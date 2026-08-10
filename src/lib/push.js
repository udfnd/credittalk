import {
  Platform,
  PermissionsAndroid,
  Linking,
  Alert,
  AppState,
  NativeModules,
} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidLaunchActivityFlag,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { logPushTap } from './pushTapLog';

export const CHANNEL_ID = 'push_default_v2';
const TAP_QUEUE_KEY = 'noti_tap_queue';

export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });
}

export const requestNotificationPermissionAndroid = async () => {
  if (Platform.OS !== 'android') return { granted: true };
  if (Platform.Version < 33) return { granted: true };
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    console.log('[APP]', 'Android notification permission requested');
    console.log('[Push] POST_NOTIFICATIONS', result);
    return { granted };
  } catch (err) {
    console.warn('[Push] request permission failed', err);
    return { granted: false };
  }
};

/**
 * 전화 감지 기능에 필요한 권한을 요청합니다.
 * - READ_PHONE_STATE: 전화 상태 감지
 * - READ_CALL_LOG: Android 10 이상에서 전화번호 가져오기 (필수)
 * - READ_CONTACTS: 연락처 확인
 */
export const requestCallDetectionPermissionsAndroid = async () => {
  if (Platform.OS !== 'android') return { allGranted: true };

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
    ];

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      result => result === PermissionsAndroid.RESULTS.GRANTED,
    );

    console.log('[APP] Call detection permissions requested', {
      READ_PHONE_STATE: results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE],
      READ_CALL_LOG: results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG],
      READ_CONTACTS: results[PermissionsAndroid.PERMISSIONS.READ_CONTACTS],
      allGranted,
    });

    return {
      allGranted,
      READ_PHONE_STATE:
        results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
        PermissionsAndroid.RESULTS.GRANTED,
      READ_CALL_LOG:
        results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] ===
        PermissionsAndroid.RESULTS.GRANTED,
      READ_CONTACTS:
        results[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] ===
        PermissionsAndroid.RESULTS.GRANTED,
    };
  } catch (err) {
    console.warn('[Push] request call detection permissions failed', err);
    return { allGranted: false, error: err };
  }
};

async function openExternalUrlBestEffort(url) {
  if (!url) return;
  try {
    // Android 11+ 패키지 가시성: manifest <queries>에 없는 스킴은 canOpenURL이
    // false를 반환하지만 실제 openURL은 성공할 수 있음 → 항상 시도한다.
    const supported = await Linking.canOpenURL(url);
    if (!supported) console.warn(`[Push] canOpenURL=false, trying anyway: ${url}`);
    await Linking.openURL(url);
  } catch (error) {
    console.error('[Push] Error opening URL:', error);
  }
}

export function hasNotificationPayload(remote) {
  const notif = remote?.notification;
  if (!notif) return false;
  return Object.values(notif).some(Boolean);
}

function isValidAndroidImageString(uri) {
  if (typeof uri !== 'string') return false;
  const u = uri.trim();
  if (!u) return false;
  return /^(https?:|content:|file:|asset:|android\.resource:)/i.test(u);
}

function sanitizeImageCandidate(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return undefined;
  if (!isValidAndroidImageString(trimmed)) return undefined;
  return trimmed;
}

export function pickTitleBody(remote) {
  const d = remote?.data || {};
  const n = remote?.notification || {};

  let parsedParams = {};
  if (d.params && typeof d.params === 'string') {
    try {
      parsedParams = JSON.parse(d.params);
    } catch {}
  } else if (d.params && typeof d.params === 'object') {
    parsedParams = d.params;
  }

  return {
    title: d.title || n.title || '알림',
    body: d.body || n.body || '',
    data: { ...d, ...parsedParams },
    image:
      sanitizeImageCandidate(d.image) ||
      sanitizeImageCandidate(d.imageUrl) ||
      sanitizeImageCandidate(n.image),
  };
}

function getMessageKey(remote) {
  const d = remote?.data || {};
  const n = remote?.notification || {};
  return (
    remote?.messageId ||
    d.nid ||
    `${d.threadId || ''}:${d.ts || ''}:${d.title || n.title || ''}:${d.body || n.body || ''}`
  );
}

// 같은 메시지의 단기 중복 표시만 차단. nid가 재사용되는 재발송(예: 글 수정 재알림)은
// TTL 경과 후 다시 표시되도록 허용한다. (마커 영구 저장 시 알림이 영영 안 뜨는 버그 방지)
const SEEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function markAndCheckSeen(key) {
  if (!key) return false;
  const k = `noti_seen:${key}`;
  const prev = await AsyncStorage.getItem(k);
  if (prev) {
    const ts = Number(prev);
    if (Number.isFinite(ts) && Date.now() - ts < SEEN_TTL_MS) return true;
  }
  await AsyncStorage.setItem(k, String(Date.now()));
  return false;
}

// ── 메시지 단위 consume 마커 ─────────────────────────────────────────────
// RNFirebase messaging().getInitialNotification()이 삼성 기기에서 "이전 탭"
// 메시지를 콜드스타트마다 재반환하거나(stale 캐시), recents 인텐트 재전달로
// 과거 탭이 재생되는 문제가 실측됨(push_tap_logs 7/15·7/17·7/23 참조).
// 탭이 실제 처리되면 메시지 키를 기록해 두고, 초기화 캐시 경로(fcm_initial /
// notifee_initial / native_fallback)는 이미 소비된 메시지를 무시한다.
// 키는 FCM message id(_mid) 우선 — 같은 nid로 재발송된 "새" 메시지는 _mid가
// 달라 차단되지 않는다. _mid가 없으면 nid로 폴백.
const CONSUMED_PREFIX = 'noti_msg_consumed:';
const CONSUMED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getConsumeKey(data = {}) {
  const mid = data?._mid || data?.messageId;
  if (mid) return `mid:${mid}`;
  if (data?.nid) return `nid:${data.nid}`;
  return null;
}

async function isTapConsumed(data) {
  const key = getConsumeKey(data);
  if (!key) return false;
  try {
    const prev = await AsyncStorage.getItem(CONSUMED_PREFIX + key);
    if (!prev) return false;
    const ts = Number(prev);
    return Number.isFinite(ts) && Date.now() - ts < CONSUMED_TTL_MS;
  } catch {
    return false;
  }
}

async function markTapConsumed(data) {
  const key = getConsumeKey(data);
  if (!key) return;
  try {
    await AsyncStorage.setItem(CONSUMED_PREFIX + key, String(Date.now()));
  } catch {}
}

// ── 푸시 처리 직렬화 ────────────────────────────────────────────────────
// 콜드스타트 초기화 시퀀스(App.tsx)와 AppState 'active' 드레인, 탭 큐 드레인이
// 동시에 달리면 "실제 탭"이 "stale 재생"에게 마지막-네비게이션 자리를 빼앗기는
// 레이스가 실측됨(7/17 04:24 로그). 모든 푸시 인텐트 처리를 한 체인에서
// 순차 실행해 인터리빙을 제거한다.
let pushOpChain = Promise.resolve();

export function runExclusivePushOp(label, fn) {
  const run = async () => {
    try {
      return await fn();
    } catch (e) {
      console.warn(`[PUSH] exclusive op "${label}" error:`, e?.message || e);
      return undefined;
    }
  };
  const p = pushOpChain.then(run);
  // 다음 작업이 이전 실패에 막히지 않게 체인은 항상 resolve로 유지
  pushOpChain = p.then(
    () => {},
    () => {},
  );
  return p;
}

// ── 표시 시점 payload 백업 ──────────────────────────────────────────────
// 삼성 OneUI(S24/S25 포함, And 12~16)에서 notifee가 표시한 알림을 탭하면
// PRESS 이벤트의 notification.data가 비어 도착하는 사례 실측(push_tap_logs
// no_target 주 45건, 전원 notifee_initial/notifee_queue 경로). FCM 경로의
// 네이티브 인텐트 캡처 폴백은 notifee 알림 인텐트를 읽지 못하므로, 표시할 때
// notification id 기준으로 data를 백업해 두고 탭 data에 라우팅 필드가 없으면
// 복원한다.
const PAYLOAD_BACKUP_PREFIX = 'noti_payload:';
const PAYLOAD_BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export function hasRoutingFields(data = {}) {
  return !!(data?.screen || data?.link_url || data?.url);
}

async function backupPayload(id, data = {}) {
  if (!id || !hasRoutingFields(data)) return;
  try {
    await AsyncStorage.setItem(
      PAYLOAD_BACKUP_PREFIX + id,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {}
}

// 탭 이벤트의 notification에서 data를 꺼내되, 라우팅 필드가 유실됐으면
// 표시 시점 백업에서 복원한다. 복원 시 _restored 마커를 남겨 텔레메트리로
// 복원 빈도를 추적할 수 있게 한다.
export async function extractTapData(notification) {
  const data = notification?.data || {};
  if (hasRoutingFields(data)) return data;
  const id = notification?.id;
  if (!id) return data;
  try {
    const raw = await AsyncStorage.getItem(PAYLOAD_BACKUP_PREFIX + id);
    if (!raw) return data;
    const { ts, data: saved } = JSON.parse(raw) || {};
    if (!Number.isFinite(ts) || Date.now() - ts > PAYLOAD_BACKUP_TTL_MS)
      return data;
    if (!hasRoutingFields(saved)) return data;
    console.log('[PUSH] tap data restored from backup', { id });
    return { ...saved, ...data, _restored: '1' };
  } catch {
    return data;
  }
}

function getTapKeyFromData(data = {}) {
  // 네이티브 폴백 캡처 data에는 nid/collapse_key/messageId/title/body가 모두
  // 없을 수 있음. 그때 키가 상수("{}")로 붕괴하면 60초 내 서로 다른 알림의
  // 두 번째 탭이 dedup에 먹혀 조용히 드롭되므로 라우팅 필드까지 키에 포함.
  return (
    data?.nid ||
    data?.collapse_key ||
    data?.messageId ||
    JSON.stringify({
      t: data?.title,
      b: data?.body,
      s: data?.screen,
      l: data?.link_url || data?.url,
      p: data?.params,
    })
  );
}

export async function displayOnce(remote, source = 'unknown') {
  console.log('[PUSH] displayOnce enter', { source, platform: Platform.OS });

  // 1) 동일 메시지 재표시 방지
  const key = getMessageKey(remote);
  if (await markAndCheckSeen(key)) {
    console.log('[PUSH] displayOnce dedup skip', { key });
    return;
  }

  // 2) iOS: 서버가 OS 배너 표시를 예고하면 앱 표시 스킵
  const picked = pickTitleBody(remote);
  if (Platform.OS === 'ios' && picked?.data?.expect_os_alert === '1') {
    console.log('[PUSH] iOS expect_os_alert=1 → skip app display');
    return;
  }

  // 3) OS가 이미 표시한(notification payload) 케이스는 스킵
  if (source !== 'foreground' && hasNotificationPayload(remote)) {
    console.log('[PUSH] displayOnce skip: OS already displayed');
    return;
  }

  await ensureNotificationChannel();

  const { title, body, data: pickedData, image } = picked;
  // FCM message id를 데이터에 보존: 탭 시 consume 마커 키로 사용(stale 재생 차단)
  const data = remote?.messageId
    ? { ...pickedData, _mid: String(remote.messageId) }
    : pickedData;

  // 4) 같은 메시지는 같은 id로 '교체'되도록 보장 (nid 없으면 key로 fallback)
  const stableId =
    (remote?.data && (remote.data.nid || remote.data.collapse_key)) || key;

  // 탭 이벤트에서 data가 유실되는 삼성 사례 대비: 표시 전에 id→data 백업
  await backupPayload(stableId, data);

  const androidOptions = {
    channelId: CHANNEL_ID,
    // launchActivity를 명시적으로 지정: Android 14+ implicit PendingIntent 제한 대응
    // launchActivityFlags: Samsung OneUI 6.1+ (S24/S25)에서 singleTask 액티비티 탭 인텐트 처리 보강
    pressAction: {
      id: 'default',
      launchActivity: 'com.credittalka.MainActivity',
      launchActivityFlags: [
        AndroidLaunchActivityFlag.SINGLE_TOP,
        AndroidLaunchActivityFlag.NEW_TASK,
      ],
    },
    smallIcon: 'ic_launcher',
    ...(image
      ? { style: { type: AndroidStyle.BIGPICTURE, picture: image } }
      : body
        ? { style: { type: AndroidStyle.BIGTEXT, text: body } }
        : {}),
    ...(image ? { largeIcon: image } : {}),
  };

  const notif = {
    id: stableId,
    title,
    body,
    data,
    ...(Platform.OS === 'android' ? { android: androidOptions } : {}),
    ...(Platform.OS === 'ios'
      ? {
          ios: {
            sound: 'default',
            foregroundPresentationOptions: {
              alert: true,
              sound: true,
              badge: true,
            },
            ...(image ? { attachments: [{ url: image }] } : {}),
          },
        }
      : {}),
  };

  console.log('[PUSH] displayOnce payload summary', {
    id: stableId,
    hasAndroid: !!notif.android,
    hasIos: !!notif.ios,
  });

  await notifee.displayNotification(notif);
  console.log('[PUSH] displayOnce done');
}

export async function openFromPayload(navigateTo, data = {}, source = 'unknown') {
  try {
    const ALLOWED_SCREENS = new Set([
      'CommunityPostDetail',
      'ArrestNewsDetail',
      'IncidentPhotoDetail',
      'NewCrimeCaseDetail',
      'NoticeDetail',
      'ReviewDetail',
      'HelpDeskDetail',
      'EventDetail',
      'MyReports', // 신고 분석 완료 푸시(admin) 타깃
    ]);

    const { screen, link_url, url, ...rest } = data || {};

    // params가 JSON 문자열인 경우 파싱하여 병합
    let parsedParams = {};
    if (rest?.params && typeof rest.params === 'string') {
      try {
        parsedParams = JSON.parse(rest.params);
      } catch {
        // 파싱 실패 시 무시
      }
    } else if (rest?.params && typeof rest.params === 'object') {
      parsedParams = rest.params;
    }

    // rest에서 불필요한 메타데이터 필드 제거하고 파싱된 params 병합
    const { params: _params, type: _type, nid: _nid, ...cleanRest } = rest;
    const finalParams = { ...cleanRest, ...parsedParams };

    if (screen && ALLOWED_SCREENS.has(screen)) {
      console.log('[NAV:INTENT] openFromPayload navigate', {
        screen,
        params: finalParams,
      });
      navigateTo?.(screen, finalParams);
      logPushTap({ source, outcome: 'navigate_screen', data });
      return;
    }

    const externalUrl = link_url || url;
    if (typeof externalUrl === 'string') {
      console.log('[NAV:INTENT] open external url', externalUrl);
      logPushTap({ source, outcome: 'open_link', data });
      await openExternalUrlBestEffort(externalUrl);
    } else {
      console.log('[NAV:INTENT] nothing to open, payload=', data);
      // keys: 탭 data가 통째로 빈 것인지(키 0개) 라우팅 필드만 빠진 것인지 구분,
      // restored: 백업 복원을 거쳤는데도 대상이 없었는지 추적
      logPushTap({
        source,
        outcome: 'no_target',
        data,
        detail: {
          keys: Object.keys(data || {}),
          restored: data?._restored === '1',
        },
      });
    }
  } catch (e) {
    console.warn('[Push] openFromPayload error:', e?.message || e);
    logPushTap({ source, outcome: 'error', data, detail: { message: String(e?.message || e) } });
  }
}

// 콜드스타트 시 동시에 발화하는 여러 경로(notifee.getInitialNotification +
// drainQueuedTap + messaging.onNotificationOpenedApp/getInitialNotification)가
// 같은 탭을 중복 네비게이션하는 것만 차단. 짧은 TTL이라 이후 동일 nid 재탭은 정상 동작.
const TAP_DEDUP_TTL_MS = 60 * 1000; // 60s

export async function openFromPayloadOnce(
  navigateTo,
  data = {},
  source = 'unknown',
  { fromInitialCache = false } = {},
) {
  // 초기화 캐시 경로(fcm_initial/notifee_initial/native_fallback)는 과거에
  // 이미 처리된 탭을 재반환할 수 있다 → consume 마커로 차단하고 로그를 남긴다.
  if (fromInitialCache && (await isTapConsumed(data))) {
    console.log('[PUSH] openFromPayloadOnce stale replay skip', {
      source,
      key: getConsumeKey(data),
    });
    logPushTap({ source, outcome: 'stale_replay_skip', data });
    return;
  }

  const key = getTapKeyFromData(data);
  const marker = `noti_tap:${key}`;
  const prev = key ? await AsyncStorage.getItem(marker) : null;
  if (prev) {
    const ts = Number(prev);
    if (Number.isFinite(ts) && Date.now() - ts < TAP_DEDUP_TTL_MS) {
      console.log('[PUSH] openFromPayloadOnce dedup (tap already handled)', {
        key,
      });
      logPushTap({ source, outcome: 'dedup_skip', data });
      return;
    }
  }
  if (key) await AsyncStorage.setItem(marker, String(Date.now()));
  // 실제 처리로 진입 → 이후 콜드스타트 캐시가 이 메시지를 재반환해도 무시되도록 기록
  await markTapConsumed(data);
  return openFromPayload(navigateTo, data, source);
}

// push-notified queue: 탭 적재 완료 직후 등록된 드레인 리스너를 호출한다.
// 배경: onBackgroundEvent의 queueTapIntent(쓰기)와 앱 초기화/AppState 'active'의
// drainQueuedTap(읽기)은 서로 순서 보장이 없어, 읽기가 먼저 끝나면 탭이 큐에
// 잠들고 앱은 홈 화면만 표시됐다(S24/S25 간헐 미이동의 잔여 원인).
// 리스너는 wireMessageHandlers에서 초기화 드레인보다 먼저 바인딩되므로,
// 쓰기가 늦든 읽기가 늦든 둘 중 하나는 반드시 탭을 소비한다.
let tapQueueListener = null;

export function setTapQueueListener(listener) {
  tapQueueListener = listener;
}

export async function queueTapIntent(data = {}) {
  try {
    const raw = (await AsyncStorage.getItem(TAP_QUEUE_KEY)) || '[]';
    const arr = JSON.parse(raw);
    arr.push({ ts: Date.now(), data });
    await AsyncStorage.setItem(TAP_QUEUE_KEY, JSON.stringify(arr));
    console.log('[PUSH] queueTapIntent stored', arr.length);
  } catch (e) {
    console.warn('[PUSH] queueTapIntent error', e?.message || e);
  }
  try {
    await tapQueueListener?.();
  } catch (e) {
    console.warn('[PUSH] tapQueueListener error', e?.message || e);
  }
}

export async function drainQueuedTap(navigateTo) {
  try {
    const raw = (await AsyncStorage.getItem(TAP_QUEUE_KEY)) || '[]';
    let arr = [];
    try {
      arr = JSON.parse(raw) || [];
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      console.log('[NAV:INTENT] drainQueuedTap: empty');
      return;
    }
    console.log('[NAV:INTENT] drainQueuedTap start', { count: arr.length });

    await AsyncStorage.setItem(TAP_QUEUE_KEY, JSON.stringify([]));
    for (const item of arr) {
      const data = item?.data || {};
      console.log('[NAV:INTENT] draining one', data);
      try {
        await openFromPayloadOnce(navigateTo, data, 'notifee_queue');
      } catch (e) {
        // 큐는 이미 비웠으므로 여기서 터지면 탭이 조용히 유실된다 → 반드시 기록
        logPushTap({
          source: 'notifee_queue',
          outcome: 'error',
          data,
          detail: { message: String(e?.message || e), phase: 'drain_item' },
        });
      }
    }
    console.log('[NAV:INTENT] drainQueuedTap done');
  } catch (e) {
    console.warn('[NAV:INTENT] drainQueuedTap error:', e?.message || e);
    logPushTap({
      source: 'notifee_queue',
      outcome: 'error',
      detail: { message: String(e?.message || e), phase: 'drain' },
    });
  }
}

// 네이티브 폴백: 삼성 OneUI 프로세스 재생성 상황에서 RNFirebase의
// getInitialNotification/onNotificationOpenedApp 이 payload를 누락해도,
// MainActivity가 인텐트 extras에서 직접 캡처해 둔 알림 data를 읽어 네비게이션한다.
// (consume-once + openFromPayloadOnce nid 디듀프로 FCM 표준 경로와 중복 실행 방지)
/** @returns {Promise<boolean>} 라우팅 가능한 탭 data를 발견해 처리(또는 스킵 판정)했으면 true */
export async function drainNativeNotificationTap(navigateTo) {
  if (Platform.OS !== 'android') return false;
  try {
    const mod = NativeModules.PushIntentModule;
    if (!mod?.getInitialNotificationData) return false;
    const data = await mod.getInitialNotificationData();
    if (data && (data.link_url || data.url || data.screen)) {
      console.log('[NAV:INTENT] drainNativeNotificationTap got data', data);
      // 액티비티 인텐트에서 직접 캡처한 값 = 실제 앱을 연 탭(가장 신뢰 가능).
      // 단 recents 재전달로 과거 인텐트가 다시 올 수 있으므로 initial-cache 취급.
      await openFromPayloadOnce(navigateTo, data, 'native_fallback', {
        fromInitialCache: true,
      });
      return true;
    }
    console.log('[NAV:INTENT] drainNativeNotificationTap: nothing pending');
    return false;
  } catch (e) {
    console.warn('[NAV:INTENT] drainNativeNotificationTap error', e?.message || e);
    return false;
  }
}

// 삼성 OneUI 등은 백그라운드에서 프로세스는 살리고 액티비티만 회수했다가
// 재생성하는 경우가 있다 → JS 컨텍스트(모듈 상태)는 유지된 채 React 루트만
// 리마운트되어 navRef가 교체된다. OS 리스너(1회 바인딩)가 첫 마운트의
// navigateTo 클로저를 계속 쥐고 있으면 이후 탭이 죽은 navRef로 흘러가
// 조용히 증발하므로, 리스너는 항상 이 참조를 통해 최신 마운트의
// navigateTo를 호출한다(wireMessageHandlers가 마운트마다 갱신).
let currentNavigateTo = null;

export async function wireMessageHandlers(navigateTo) {
  currentNavigateTo = navigateTo;
  const nav = (screen, params) => currentNavigateTo?.(screen, params);

  // 탭이 큐에 적재되는 즉시 소비(늦게 도착한 백그라운드/콜드스타트 PRESS 대응).
  // 리마운트 시에도 최신 nav로 재바인딩되어야 하므로 가드보다 먼저 실행.
  // 콜드스타트 초기화 시퀀스와의 인터리빙 방지를 위해 직렬화 체인에서 실행.
  setTapQueueListener(() =>
    runExclusivePushOp('tap-queue-drain', () => drainQueuedTap(nav)),
  );

  if (global.__PUSH_FG_BOUND__) return;
  global.__PUSH_FG_BOUND__ = true;

  messaging().onMessage(async remoteMessage => {
    try {
      await displayOnce(remoteMessage, 'foreground');
    } catch (e) {
      console.warn('[FCM] onMessage display error:', e?.message || e);
    }
  });

  notifee.onForegroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      console.log(
        '[FG] onForegroundEvent PRESS/ACTION_PRESS, queue & open once',
      );
      // queueTapIntent가 tapQueueListener(직렬화된 드레인)를 호출하므로
      // 여기서 별도 drain을 중복 실행하지 않는다.
      await queueTapIntent(await extractTapData(detail?.notification));
    }
  });

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      console.log('[NAV:INTENT] AppState active → drain queued + native tap');
      runExclusivePushOp('appstate-drain', async () => {
        await drainQueuedTap(nav);
        // 웜 스타트(백그라운드 알림 탭 → 복귀) 폴백
        await drainNativeNotificationTap(nav);
      });
    }
  });
}

export const updatePushTokenOnLogin = async userId => {
  if (!userId) return;
  try {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        Alert.alert(
          '알림 권한이 꺼져 있어요',
          '설정에서 알림을 허용해 주세요.',
        );
        return;
      }
    }
    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      console.log('[Push] Could not get FCM token.');
      return;
    }
    const { error } = await supabase.rpc('register_push_token', {
      fcm_token: fcmToken,
      p_platform: Platform.OS,
    });
    if (error)
      console.error('[Push] register_push_token RPC error:', error.message);
    else console.log('[Push] Token registered for user:', userId);
  } catch (error) {
    console.error('[Push] updatePushTokenOnLogin error:', error);
  }
};

export const setupTokenRefreshListener = userId => {
  if (!userId) return () => {};
  return messaging().onTokenRefresh(async newFcmToken => {
    try {
      console.log('[Push] FCM token refreshed:', newFcmToken);
      const { error } = await supabase.rpc('register_push_token', {
        fcm_token: newFcmToken,
        p_platform: Platform.OS,
      });
      if (error)
        console.error('[Push] Failed to register refreshed token:', error);
    } catch (e) {
      console.warn('[Push] onTokenRefresh error:', e?.message || e);
    }
  });
};

export async function unregisterPushToken() {
  try {
    const token = await messaging().getToken();
    if (token) {
      await supabase
        .from('device_push_tokens')
        .update({ enabled: false })
        .eq('token', token);
      await messaging().deleteToken();
      console.log('[Push] Token unregistered and deleted.');
    }
  } catch (e) {
    console.warn('[FCM] unregisterPushToken error:', e?.message || e);
  }
}
