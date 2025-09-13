// src/lib/push.js
import { Platform, Alert, Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';
import { supabase } from '../lib/supabaseClient';

// 항상 HIGH로 설정된 알림 채널
export const CHANNEL_ID = 'push_default_v2';

/** 안드로이드 알림 채널 생성(최초 1회, 이미 있으면 no-op) */
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });
}

/** 알림 권한 요청 (iOS에서는 명시 요청 필요) */
async function requestPushPermission() {
  try {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      return enabled;
    } else {
      try { await notifee.requestPermission(); } catch {}
      return true;
    }
  } catch (e) {
    console.warn('[FCM] requestPermission error:', e?.message || e);
    // 에러 시 iOS는 보수적으로 false, Android는 true(권한 모델 차이)로 처리
    return Platform.OS !== 'ios';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }
function isBigIntLike(v) {
  return (typeof v === 'number' && Number.isInteger(v)) ||
    (typeof v === 'string' && /^\d+$/.test(v));
}
function toBigIntNumber(v) { return typeof v === 'number' ? v : Number(v); }
function uniq(arr) { return Array.from(new Set(arr)); }

let scheduledRetry = false;
function scheduleRetry(fn, delayMs = 3000) {
  if (scheduledRetry) return;
  scheduledRetry = true;
  setTimeout(async () => {
    try { await fn(); } finally { scheduledRetry = false; }
  }, delayMs);
}

/** 내부 공통 업서트 (user_id 후보 리스트로 순차 시도) */
async function upsertTokenWithCandidates({ candidates, token, appVersion }) {
  const base = {
    token,
    platform: Platform.OS,
    app_version: appVersion,
    enabled: true,
    last_seen: new Date().toISOString(),
  };

  for (const candidate of candidates) {
    if (candidate == null) continue;
    const { error } = await supabase
      .from('device_push_tokens')
      .upsert({ user_id: candidate, ...base }, { onConflict: 'token' });

    if (!error) {
      console.log('[FCM] upsert success with user_id =', candidate);
      return { ok: true, used: candidate };
    }
    console.warn('[FCM] upsert failed with user_id =', candidate, '→', error?.message);
  }
  return { ok: false };
}

/**
 * FCM 토큰 업서트 + 토큰 갱신 처리
 * - userIdOrAuthId: 보통 auth.users.id(UUID) 또는 app users.id(BIGINT) 중 하나
 * - opts.authUserId: 명시적 UUID
 * - opts.appUserId: public.users.id (BIGINT)일 때 폴백
 */
export async function registerPushToken(userIdOrAuthId, appVersion, opts = {}) {
  try {
    const permitted = await requestPushPermission();
    if (!permitted) {
      Alert.alert('알림 권한이 꺼져 있어요', '설정에서 알림을 허용해 주세요.');
      return;
    }

    const token = await messaging().getToken();
    console.log('[FCM] token:', token);

    const candidates = uniq([
      isUuid(opts?.authUserId) ? opts.authUserId : undefined,
      isUuid(userIdOrAuthId) ? userIdOrAuthId : undefined,
      isBigIntLike(opts?.appUserId) ? toBigIntNumber(opts.appUserId) : undefined,
      isBigIntLike(userIdOrAuthId) ? toBigIntNumber(userIdOrAuthId) : undefined,
    ]);

    if (!candidates.length) {
      console.warn('[FCM] no user_id candidates yet; will retry later.');
      scheduleRetry(async () => {
        const latest = await messaging().getToken();
        await registerPushToken(userIdOrAuthId, appVersion, opts);
      });
      return;
    }

    const res = await upsertTokenWithCandidates({ candidates, token, appVersion });
    if (!res.ok) {
      console.warn('[FCM] upsert failed for all candidates; will retry later (RLS/type?).');
      scheduleRetry(async () => {
        const latest = await messaging().getToken();
        const r2 = await upsertTokenWithCandidates({ candidates, token: latest, appVersion });
        if (!r2.ok) console.warn('[FCM] delayed retry also failed.');
      });
    }

    messaging().onTokenRefresh(async (newToken) => {
      console.log('[FCM] token refreshed:', newToken);
      const r2 = await upsertTokenWithCandidates({ candidates, token: newToken, appVersion });
      if (!r2.ok) console.warn('[FCM] refresh upsert failed (check RLS / user_id type)');
    });
  } catch (e) {
    console.warn('[FCM] registerPushToken error:', e?.message || e);
  }
}

function safeParse(jsonish) {
  try {
    return typeof jsonish === 'string' ? JSON.parse(jsonish) : jsonish;
  } catch {
    return undefined;
  }
}

/** http/https 외의 스킴도 허용하되, 스킴 누락시 https로 보정 */
function normalizeExternalUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // 이미 스킴이 있으면 그대로
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) return s;

  // 이메일/전화 등은 Linking가 자체 처리 가능 (mailto:, tel: 등)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;

  // 스킴이 없으면 https로 보정
  return `https://${s}`;
}

/**
 * payload 규칙:
 * - 내부 이동: { screen: 'ScreenName', params: { ... } }  (params는 JSON 문자열도 허용)
 * - 외부 링크: { link_url: 'https://...', ... } 또는 { url: 'https://...' }
 */
function openFromPayload(navigateTo, data = {}) {
  try {
    const { screen, params, link_url, url } = data || {};

    // 1) 앱 내부 네비게이션이 우선
    if (screen) {
      const parsed = typeof params === 'string' ? safeParse(params) : params;
      if (navigateTo) navigateTo(screen, parsed);
      return;
    }

    // 2) 외부 링크 열기 (스킴 자동 보정)
    const raw = typeof link_url === 'string' ? link_url : (typeof url === 'string' ? url : null);
    const normalized = normalizeExternalUrl(raw);

    if (normalized) {
      Linking.canOpenURL(normalized)
        .then((ok) => ok && Linking.openURL(normalized))
        .catch((e) => console.warn('[FCM] openURL error:', e?.message || e));
    }
  } catch (e) {
    console.warn('[FCM] openFromPayload error:', e?.message || e);
  }
}

/**
 * 포그라운드/백그라운드/종료 상태 알림 처리
 * - navigateTo: (screen, params) => void
 */
export async function wireMessageHandlers(navigateTo) {
  await ensureNotificationChannel();

  // 포그라운드 수신 → 로컬 표시
  messaging().onMessage(async (remoteMessage) => {
    const title = remoteMessage?.notification?.title || '알림';
    const body = remoteMessage?.notification?.body || '';

    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default' },
        style: body?.length > 60 ? { type: AndroidStyle.BIGTEXT, text: body } : undefined,
        // payload는 data에 그대로 유지
      },
      data: remoteMessage.data,
    });
  });

  // 백그라운드에서 탭
  messaging().onNotificationOpenedApp((remoteMessage) => {
    if (!remoteMessage) return;
    openFromPayload(navigateTo, remoteMessage.data || {});
  });

  // 종료 상태에서 알림 탭 후 진입
  messaging().getInitialNotification().then((remoteMessage) => {
    if (!remoteMessage) return;
    openFromPayload(navigateTo, remoteMessage.data || {});
  });
}

/** 현재 기기 토큰 비활성화(선택) */
export async function unregisterPushToken(token) {
  if (!token) {
    try { token = await messaging().getToken(); } catch { token = undefined; }
  }
  if (token) {
    await supabase.from('device_push_tokens').update({ enabled: false }).eq('token', token);
  }
}
