import { Platform, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';
import { supabase } from '../lib/supabaseClient';

// ✅ 새 채널 ID (항상 HIGH)
export const CHANNEL_ID = 'push_default_v2';

/** 안드로이드 알림 채널 생성(최초 1회, 이미 있으면 no-op) */
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });

  // (선택) 더 이상 쓰지 않는 기존 채널 정리
  // try { await notifee.deleteChannel('default'); } catch {}
}

/** 권한 요청(iOS 필수, Android 13+ 권장) */
export async function requestPushPermission() {
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
    return Platform.OS !== 'ios';
  }
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
    console.warn('[FCM] upsert failed with user_id =', candidate, '→', error.message);
  }
  return { ok: false };
}

/**
 * FCM 토큰 업서트 + 토큰 갱신 처리
 * - userIdOrAuthId: 보통 auth.users.id(UUID)
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

    // UUID (auth.users.id) → BIGINT (public.users.id) 순으로 시도
    const candidates = [
      typeof opts.authUserId === 'string' ? opts.authUserId : undefined,
      typeof userIdOrAuthId === 'string' ? userIdOrAuthId : undefined,
      typeof opts.appUserId === 'number' ? opts.appUserId : undefined,
      typeof userIdOrAuthId === 'number' ? userIdOrAuthId : undefined,
    ];

    const res = await upsertTokenWithCandidates({ candidates, token, appVersion });
    if (!res.ok) {
      Alert.alert('푸시 토큰 저장 실패', 'user_id 타입 불일치 또는 RLS 정책에 막혔을 수 있어요. 콘솔 로그를 확인하세요.');
      return;
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

/** 알림 수신/탭 핸들러 연결 (navigateTo: (screen, params) => void) */
export function wireMessageHandlers(navigateTo) {
  // 포어그라운드 수신 → 로컬 표시 (이미지 있을 때 BigPicture)
  messaging().onMessage(async (remoteMessage) => {
    await ensureNotificationChannel();

    const dataImage =
      remoteMessage?.data?.image ||
      remoteMessage?.notification?.android?.imageUrl ||
      remoteMessage?.notification?.imageUrl;

    await notifee.displayNotification({
      title: remoteMessage.notification?.title,
      body: remoteMessage.notification?.body,
      android: {
        channelId: CHANNEL_ID,
        ...(dataImage
          ? {
            style: {
              type: AndroidStyle.BIGPICTURE,
              picture: dataImage,
            },
          }
          : {}),
      },
      data: remoteMessage.data,
    });
  });

  // 백그라운드에서 탭
  messaging().onNotificationOpenedApp((remoteMessage) => {
    const { screen, params } = remoteMessage?.data || {};
    if (navigateTo && screen) navigateTo(screen, safeParse(params));
  });

  // 종료 상태에서 알림 탭 후 진입
  messaging().getInitialNotification().then((remoteMessage) => {
    if (!remoteMessage) return;
    const { screen, params } = remoteMessage?.data || {};
    if (navigateTo && screen) navigateTo(screen, safeParse(params));
  });
}

function safeParse(maybeJson) {
  try { return maybeJson ? JSON.parse(maybeJson) : undefined; }
  catch { return undefined; }
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
