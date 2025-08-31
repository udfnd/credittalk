// src/push/push.js
import { Platform, Alert, Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import { supabase } from '../lib/supabaseClient';

export const CHANNEL_ID = 'push_default_v2';

/** 안드로이드 알림 채널 생성(최초 1회, 이미 있으면 no-op) */
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });

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
      try {
        await notifee.requestPermission();
      } catch {}
      return true;
    }
  } catch (e) {
    console.warn('[FCM] requestPermission error:', e?.message || e);
    // iOS 외에는 실패하더라도 대체로 동작
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
    console.warn(
      '[FCM] upsert failed with user_id =',
      candidate,
      '→',
      error.message
    );
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

    const res = await upsertTokenWithCandidates({
      candidates,
      token,
      appVersion,
    });
    if (!res.ok) {
      Alert.alert(
        '푸시 토큰 저장 실패',
        'user_id 타입 불일치 또는 RLS 정책에 막혔을 수 있어요. 콘솔 로그를 확인하세요.'
      );
      return;
    }

    messaging().onTokenRefresh(async (newToken) => {
      console.log('[FCM] token refreshed:', newToken);
      const r2 = await upsertTokenWithCandidates({
        candidates,
        token: newToken,
        appVersion,
      });
      if (!r2.ok)
        console.warn('[FCM] refresh upsert failed (check RLS / user_id type)');
    });
  } catch (e) {
    console.warn('[FCM] registerPushToken error:', e?.message || e);
  }
}

/** 안전한 JSON 파서 */
function safeParse(maybeJson) {
  try {
    return maybeJson ? JSON.parse(maybeJson) : undefined;
  } catch {
    return undefined;
  }
}

/** 스킴이 없으면 https://를 붙이고, 공백/제로폭 문자 제거 */
function normalizeExternalUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // zero-width 등 제거
    .replace(/\s+/g, '');                         // 공백 제거

  // 이미 스킴 있는 경우( http:, https:, tel:, mailto:, ftp:, etc. )
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(s)) return s;

  // //example.com 형태라면 https: 붙이기
  if (s.startsWith('//')) return `https:${s}`;

  // www.로 시작하면 https:// 붙이기
  if (/^www\./i.test(s)) return `https://${s}`;

  // 그 외(대부분 도메인/경로) → https:// 붙이기
  return `https://${s}`;
}

export async function openFromPayload(
  navigateTo: (screen: string, params?: any) => void,
  data: Record<string, any> = {}
) {
  const { screen, params, link_url, url } = data || {};

  // 1) 앱 내부 네비게이션이 우선
  if (screen) {
    let parsed: any = undefined;
    try { parsed = typeof params === 'string' ? JSON.parse(params) : params; } catch {}
    navigateTo(screen, parsed);
    return;
  }

  // 2) 외부 링크 열기 (스킴 자동 보정)
  const raw = typeof link_url === 'string' ? link_url : (typeof url === 'string' ? url : null);
  const normalized = normalizeExternalUrl(raw);

  if (normalized) {
    try {
      const supported = await Linking.canOpenURL(normalized);
      await Linking.openURL(supported ? normalized : `https://${normalized.replace(/^[a-z]+:\/\//i, '')}`);
    } catch (e: any) {
      Alert.alert('링크를 열 수 없어요', e?.message ?? String(e));
    }
  }
}

/** 알림 수신/탭 핸들러 연결 (navigateTo: (screen, params) => void) */
export function wireMessageHandlers(navigateTo) {
  // 포어그라운드 수신 → 로컬(notifee) 표시 (이미지 있을 때 BigPicture)
  messaging().onMessage(async (remoteMessage) => {
    await ensureNotificationChannel();

    const dataImage =
      remoteMessage?.data?.image ||
      remoteMessage?.notification?.android?.imageUrl ||
      remoteMessage?.notification?.imageUrl;

    // 데이터-only 메시지 대비: data.title/body 폴백
    const title =
      remoteMessage?.notification?.title ?? remoteMessage?.data?.title;
    const body =
      remoteMessage?.notification?.body ?? remoteMessage?.data?.body;

    await notifee.displayNotification({
      title,
      body,
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
      // 탭 시 전달할 payload
      data: remoteMessage.data,
    });
  });

  messaging().onNotificationOpenedApp((remoteMessage) => {
    openFromPayload(navigateTo, remoteMessage?.data);
  });

  messaging().getInitialNotification().then((remoteMessage) => {
    if (!remoteMessage) return;
    openFromPayload(navigateTo, remoteMessage?.data);
  });

  // notifee로 표시한 알림을 포어그라운드에서 탭했을 때
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      openFromPayload(navigateTo, detail?.notification?.data);
    }
  });

  // ⚠️ notifee 백그라운드 탭 이벤트(onBackgroundEvent)는
  // 반드시 앱 엔트리(index.js)의 최상단(글로벌 스코프)에 등록해야 합니다.
  // index.js 예시:
  //
  // import notifee, { EventType } from '@notifee/react-native';
  // notifee.onBackgroundEvent(async ({ type, detail }) => {
  //   if (type === EventType.PRESS) {
  //     // 여기서는 Navigation이 아직 준비 안됐을 수 있으니
  //     // detail.notification.data 를 임시 저장해두고
  //     // App이 ready 되면 openFromPayload로 처리하도록 구현하세요.
  //   }
  // });
}

/** 현재 기기 토큰 비활성화(선택) */
export async function unregisterPushToken(token) {
  if (!token) {
    try {
      token = await messaging().getToken();
    } catch {
      token = undefined;
    }
  }
  if (token) {
    await supabase
      .from('device_push_tokens')
      .update({ enabled: false })
      .eq('token', token);
  }
}
