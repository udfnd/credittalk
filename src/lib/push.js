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
// 실측 탭 지연 최대 84h(push_tap_logs) — 24h로 두면 소비 마커가 먼저 만료되어
// 이미 방문한 payload가 blind restore로 재복원될 수 있어 백업 TTL(7d)과 맞춘다.
// 같은 메시지의 순수 재탭은 존재하지 않으므로(탭 시 알림이 쉐이드에서 제거됨)
// 마커 수명 연장의 부작용은 없다.
const CONSUMED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (= PAYLOAD_BACKUP_TTL_MS)

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
// 완전 빈 PRESS(id까지 소거) 복구용 최근 표시 인덱스: [{id, ts}] 최신이 마지막
const PAYLOAD_INDEX_KEY = 'noti_payload_index';
const PAYLOAD_INDEX_MAX = 20;
// blind 복원 후보 자격 시간창: 백업 TTL(7d)보다 짧게 둔다. 스와이프로 지워져
// id 소거 DISMISSED로 인덱스에서 못 지운 엔트리가 후보를 오염(오이동 또는
// 복수 후보로 복원 마비)시키는 기간을 제한. 실측 no_target 탭 지연은 전건
// 24h 이내라 48h면 정상 케이스를 덮는다.
const BLIND_CANDIDATE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

export function hasRoutingFields(data = {}) {
  return !!(data?.screen || data?.link_url || data?.url);
}

// 인덱스 read-modify-write 직렬화: displayOnce는 FCM headless와 포그라운드에서
// 병렬 실행될 수 있어, 비원자적 RMW가 인덱스 엔트리를 유실시킨다(적대적 검증에서
// Promise.all(displayOnce×2)로 재현됨). 전용 체인이라 데드락 여지 없음.
let indexWriteChain = Promise.resolve();
function runExclusiveIndexWrite(fn) {
  const p = indexWriteChain.then(fn, fn);
  indexWriteChain = p.then(
    () => {},
    () => {},
  );
  return p;
}

async function backupPayload(id, data = {}) {
  if (!id || !hasRoutingFields(data)) return;
  try {
    await AsyncStorage.setItem(
      PAYLOAD_BACKUP_PREFIX + id,
      JSON.stringify({ ts: Date.now(), data }),
    );
    // 인덱스는 빈 PRESS 복구(안드로이드 전용)에만 쓰이므로 iOS는 적재 생략
    if (Platform.OS !== 'android') return;
    await runExclusiveIndexWrite(async () => {
      const raw = (await AsyncStorage.getItem(PAYLOAD_INDEX_KEY)) || '[]';
      let arr = [];
      try {
        arr = JSON.parse(raw) || [];
      } catch {
        arr = [];
      }
      arr = arr.filter(
        e =>
          e?.id &&
          e.id !== id &&
          Number.isFinite(e.ts) &&
          Date.now() - e.ts < PAYLOAD_BACKUP_TTL_MS,
      );
      arr.push({ id, ts: Date.now() });
      if (arr.length > PAYLOAD_INDEX_MAX) arr = arr.slice(-PAYLOAD_INDEX_MAX);
      await AsyncStorage.setItem(PAYLOAD_INDEX_KEY, JSON.stringify(arr));
    });
  } catch {}
}

// 공용 후보 수집: "인덱스에 있고 + 지금 쉐이드에 없고 + 시간창 내 + 백업이
// 살아 있고 라우팅 필드 보유 + 아직 미소비"인 항목을 최신순으로 모은다.
// PRESS 복원(후보 1건이면 그것이 방금 탭된 알림)과 id 소거 DISMISSED 정리
// (후보 1건이면 그것이 방금 스와이프된 알림)가 같은 판별식을 공유한다.
// 반환: { candidates, indexLen, dispN, matched }
//  - dispN: 관측된 쉐이드 알림 수, matched: 그중 인덱스와 id가 일치한 수.
//    OneUI가 Notification.extras까지 지워 notifee id가 합성 폴백으로 떨어지면
//    "쉐이드에 있는데 없다"고 오판하므로, dispN>0 && matched=0 패턴을 원격
//    텔레메트리로 감지하기 위한 필드다. 관측 실패 시 dispN=-1(후보 판정 불가).
async function collectBlindCandidates() {
  const empty = (indexLen, dispN = 0, matched = 0) => ({
    candidates: [],
    indexLen,
    dispN,
    matched,
  });
  let arr = [];
  try {
    const raw = await AsyncStorage.getItem(PAYLOAD_INDEX_KEY);
    if (!raw) return empty(0);
    try {
      arr = JSON.parse(raw) || [];
    } catch {
      return empty(0);
    }
  } catch {
    return empty(-1);
  }

  let displayedIds;
  try {
    const displayed = (await notifee.getDisplayedNotifications()) || [];
    displayedIds = new Set(
      displayed.map(d => d?.notification?.id ?? d?.id).filter(Boolean),
    );
  } catch (e) {
    // 쉐이드를 못 읽으면 무엇이 사라졌는지 특정할 수 없다 → 판정 포기(fail-safe)
    console.warn('[PUSH] getDisplayedNotifications failed', e?.message || e);
    return empty(arr.length, -1);
  }
  const matched = arr.filter(e => displayedIds.has(String(e?.id))).length;

  const candidates = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const entry = arr[i];
    // 엔트리 하나가 깨져도 나머지 후보 스캔은 계속한다
    try {
      if (!entry?.id || !Number.isFinite(entry.ts)) continue;
      if (Date.now() - entry.ts > BLIND_CANDIDATE_WINDOW_MS) continue;
      if (displayedIds.has(String(entry.id))) continue; // 아직 표시 중 = 탭/스와이프 아님
      const rawBackup = await AsyncStorage.getItem(
        PAYLOAD_BACKUP_PREFIX + entry.id,
      );
      if (!rawBackup) continue;
      const { ts, data: saved } = JSON.parse(rawBackup) || {};
      if (!Number.isFinite(ts) || Date.now() - ts > PAYLOAD_BACKUP_TTL_MS)
        continue;
      if (!hasRoutingFields(saved)) continue;
      if (await isTapConsumed(saved)) continue;
      candidates.push({ id: entry.id, saved });
      if (candidates.length > 1) break; // 소비처가 전부 "정확히 1건"만 쓰므로 조기 종료
    } catch {
      continue;
    }
  }
  return { candidates, indexLen: arr.length, dispN: displayedIds.size, matched };
}

// 스와이프 dismiss된 알림은 탭될 수 없으므로 blind 복원 후보에서 즉시 제거한다.
// (쉐이드 부재만으로는 "탭으로 사라짐"과 "스와이프로 사라짐"을 구분할 수 없어,
// DISMISSED 이벤트로 지우지 않으면 라우팅 없는 알림 탭이 스와이프된 링크로
// 오이동하거나, 후보 복수로 blind 복원이 시간창 내내 마비된다)
// id가 소거된 DISMISSED(OneUI가 PRESS와 같은 방식으로 비워 보내는 경우)는
// PRESS 복원과 대칭으로 처리: 방금 쉐이드에서 사라진 미소비 후보가 정확히
// 1건이면 그것이 스와이프된 알림이므로 제거하고, 애매하면 아무것도 안 한다.
export async function removeFromDisplayIndex(id) {
  try {
    let targetId = id;
    if (!targetId) {
      if (Platform.OS !== 'android') return;
      const { candidates } = await collectBlindCandidates();
      if (candidates.length !== 1) return;
      targetId = candidates[0].id;
    }
    await runExclusiveIndexWrite(async () => {
      const raw = (await AsyncStorage.getItem(PAYLOAD_INDEX_KEY)) || '[]';
      let arr = [];
      try {
        arr = JSON.parse(raw) || [];
      } catch {
        arr = [];
      }
      const next = arr.filter(e => String(e?.id) !== String(targetId));
      if (next.length !== arr.length) {
        console.log('[PUSH] removed dismissed entry from display index', {
          id: targetId,
        });
        await AsyncStorage.setItem(PAYLOAD_INDEX_KEY, JSON.stringify(next));
      }
    });
  } catch {}
}

// 완전 빈 PRESS(OneUI가 notification을 id·data 통째로 비워 전달 — v36 id 기반
// 복원이 배포 후 성공 0건으로 실측된 원인) 복구.
//
// 추측이 아니라 관측으로 대상을 좁힌다: notifee 알림은 autoCancel(기본 true)로
// 탭 직후 쉐이드에서 사라지므로, 후보(collectBlindCandidates)가 정확히 1건일
// 때만 그것을 방금 탭된 알림으로 보고 복원한다. 라우팅 없는 알림을 탭한 경우
// (동일하게 빈 PRESS로 도착) 쌓여 있던 다른 알림들은 여전히 쉐이드에 보이므로
// 후보에서 배제된다 → 오이동 방지. 0건/복수(스와이프로 지운 미탭 알림이 섞인
// 경우)나 쉐이드 관측 실패 시에는 복원을 포기한다(오이동보다 홈 유지가 안전).
// 연속 탭은 앞선 탭이 소비 마커를 남기므로 매번 후보 1건으로 수렴한다.
async function restoreLatestDisplayedPayload() {
  try {
    const { candidates, indexLen, dispN, matched } =
      await collectBlindCandidates();
    if (candidates.length !== 1)
      return {
        payload: null,
        indexLen,
        candidates: dispN === -1 ? -1 : candidates.length,
        dispN,
        matched,
      };
    const { id, saved } = candidates[0];
    console.log('[PUSH] blind-restored displayed payload', { id });
    return {
      payload: {
        ...saved,
        _restored: '2',
        _restoredId: String(id),
        _dispn: String(dispN),
        _match: String(matched),
      },
      indexLen,
      candidates: 1,
      dispN,
      matched,
    };
  } catch {}
  return { payload: null, indexLen: -1, candidates: 0, dispN: -1, matched: 0 };
}

// 탭 이벤트의 notification에서 data를 꺼내되, 라우팅 필드가 유실됐으면
// 표시 시점 백업에서 복원한다. 복원 시 _restored 마커를 남겨 텔레메트리로
// 복원 빈도를 추적할 수 있게 한다.
// allowBlindRestore: 실제 사용자 탭이 확실한 PRESS 이벤트 경로에서만 true.
// (getInitialNotification류 초기화 캐시는 일반 실행에서도 빈 알림을 재반환할
// 수 있어, blind 복원을 허용하면 탭 없이 앱만 열어도 과거 알림으로 이동하는
// 오발동 위험이 있으므로 금지)
export async function extractTapData(
  notification,
  { allowBlindRestore = false } = {},
) {
  const data = notification?.data || {};
  if (hasRoutingFields(data)) return data;
  const id = notification?.id;
  if (!id) {
    // OneUI 소거 시그니처: id·data 모두 빈 PRESS(실측: 필드의 no_target 전건이
    // 이 형태). 라우팅 없는 알림의 탭도 같은 시그니처로 오므로, 복원 함수가
    // 쉐이드 관측으로 후보를 좁혀 1건일 때만 복원한다. 삼성 OneUI 한정 증상이라
    // 안드로이드에서만 시도(iOS는 실익 없이 오이동 위험만 추가).
    if (
      allowBlindRestore &&
      Platform.OS === 'android' &&
      Object.keys(data).length === 0
    ) {
      const { payload, indexLen, candidates, dispN, matched } =
        await restoreLatestDisplayedPayload();
      if (payload) return payload;
      // 복원 실패 진단 마커: id 부재(_noid), 당시 인덱스 크기(_idx), 후보 수
      // (_cand: -1=쉐이드 관측 실패), 쉐이드 알림 수/인덱스 일치 수
      // (_dispn/_match: OneUI가 쉐이드 id까지 합성 폴백으로 바꾸는 기기 감지),
      // 발생 시각(_ts: 60초 dedup 키 붕괴로 연타 진단이 dedup_skip에 먹히는 것
      // 방지). underscore 필터로 화면 params에는 새지 않는다.
      return {
        _noid: '1',
        _idx: String(indexLen),
        _cand: String(candidates),
        _dispn: String(dispN),
        _match: String(matched),
        _ts: String(Date.now()),
      };
    }
    return data;
  }
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
      // 빈 PRESS 진단 마커(_ts): 키가 상수로 붕괴해 연속 빈 탭의 no_target
      // 진단 로그가 dedup_skip으로 먹히는 것을 막는다(네비게이션은 어차피 없음)
      n: data?._ts,
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
    // (_mid/_restored/_restoredId 등 내부 마커도 화면 params로 새지 않게 제거)
    const { params: _params, type: _type, nid: _nid, ...cleanRest } = rest;
    const finalParams = Object.fromEntries(
      Object.entries({ ...cleanRest, ...parsedParams }).filter(
        ([k]) => !k.startsWith('_'),
      ),
    );

    // 백업 복원을 거친 탭인지 성공 로그에도 남겨 복원 효과를 원격 검증한다.
    // blind 복원(_restored='2')은 쉐이드 관측치(dispN/matched)도 함께 남겨
    // "잘못된 복원"(dispN>0 && matched=0 기기)을 원격에서 판별할 수 있게 한다.
    const restoredDetail = data?._restored
      ? {
          detail: {
            restored: data._restored,
            ...(data?._dispn !== undefined
              ? { dispN: Number(data._dispn), matched: Number(data._match) }
              : {}),
          },
        }
      : {};

    if (screen && ALLOWED_SCREENS.has(screen)) {
      console.log('[NAV:INTENT] openFromPayload navigate', {
        screen,
        params: finalParams,
      });
      navigateTo?.(screen, finalParams);
      logPushTap({ source, outcome: 'navigate_screen', data, ...restoredDetail });
      return;
    }

    const externalUrl = link_url || url;
    if (typeof externalUrl === 'string') {
      console.log('[NAV:INTENT] open external url', externalUrl);
      logPushTap({ source, outcome: 'open_link', data, ...restoredDetail });
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
          // '1'=id 기반 복원, '2'=blind 복원, null=복원 안 거침(성공 로그와 동형)
          restored: data?._restored ?? null,
          // 빈 PRESS(blind restore 시도) 실패 진단: id 부재 + 당시 인덱스
          // 크기 + 후보 수(-1=쉐이드 관측 실패) + 쉐이드 관측치
          ...(data?._noid === '1'
            ? {
                hasId: false,
                indexLen: Number(data?._idx),
                candidates: Number(data?._cand),
                dispN: Number(data?._dispn),
                matched: Number(data?._match),
              }
            : {}),
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
      await queueTapIntent(
        await extractTapData(detail?.notification, {
          allowBlindRestore: true,
        }),
      );
    } else if (type === EventType.DISMISSED) {
      // 스와이프로 지운 알림은 blind 복원 후보에서 제거(id 소거 시 best-effort)
      await removeFromDisplayIndex(detail?.notification?.id);
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
