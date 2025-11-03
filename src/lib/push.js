// src/lib/push.js

import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';

export const CHANNEL_ID = 'push_default_v2';

/** Android 채널 보장 */
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });
}

/** Android 13+ 권한 요청 */
export const requestNotificationPermissionAndroid = async () => {
  if (Platform.OS !== 'android') return;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    console.log(
      `[Push] Android permission: ${result === 'granted' ? 'granted' : result}`,
    );
  } catch (err) {
    console.warn('[Push] request permission failed', err);
  }
};

/** (선택) 외부 URL 열기 */
async function openExternalUrlBestEffort(url) {
  if (!url) return;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else console.warn(`[Push] Cannot open URL: ${url}`);
  } catch (error) {
    console.error('[Push] Error opening URL:', error);
  }
}

/** notification payload 존재 여부 */
export function hasNotificationPayload(remoteMessage) {
  const notif = remoteMessage?.notification;
  if (!notif) return false;
  return Object.values(notif).some(Boolean);
}

/** 제목/본문 + data 병합(pick) */
export function pickTitleBody(remote) {
  const d = remote?.data || {};
  const n = remote?.notification || {};

  // data.params(JSON) → 펼치기
  let parsedParams = {};
  if (d.params && typeof d.params === 'string') {
    try {
      parsedParams = JSON.parse(d.params);
    } catch (e) {
      console.warn('[Push] Failed to parse data.params:', e);
    }
  } else if (d.params && typeof d.params === 'object') {
    parsedParams = d.params;
  }

  return {
    title: d.title || n.title || '알림',
    body: d.body || n.body || '',
    data: {
      ...d,
      ...parsedParams,
    },
  };
}

/** 디듀프 키 생성: messageId → data.nid → fallback 조합 */
function getMessageKey(remote) {
  const d = remote?.data || {};
  const n = remote?.notification || {};
  return (
    remote?.messageId ||
    d.nid ||
    `${d.threadId || ''}:${d.ts || ''}:${d.title || n.title || ''}:${d.body || n.body || ''}`
  );
}

/** 디듀프 체크 & 마킹 */
async function markAndCheckSeen(key) {
  if (!key) return false;
  const k = `noti_seen:${key}`;
  const seen = await AsyncStorage.getItem(k);
  if (seen) return true;
  await AsyncStorage.setItem(k, String(Date.now()));
  return false;
}

/**
 * “한 번만 표시” 규칙을 강제하는 공통 표시 함수
 * @param {'foreground'|'background'|'unknown'} source
 */
export async function displayOnce(remote, source = 'unknown') {
  // 1) 백그라/종료 + notification payload → OS가 이미 표시했으니 우리는 스킵
  if (source !== 'foreground' && hasNotificationPayload(remote)) {
    return;
  }

  // 2) 디듀프
  const key = getMessageKey(remote);
  const dup = await markAndCheckSeen(key);
  if (dup) return;

  // 3) 표시
  await ensureNotificationChannel();
  const { title, body, data } = pickTitleBody(remote);

  await notifee.displayNotification({
    // 동일 id면 업데이트/병합
    id:
      (remote?.data && (remote.data.nid || remote.data.collapse_key)) ||
      undefined,
    title,
    body,
    data,
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: 'default' },
      style: body ? { type: AndroidStyle.BIGTEXT, text: body } : undefined,
    },
  });
}

/** 페이로드 기반 라우팅/외부링크 */
export function openFromPayload(navigateTo, data = {}) {
  try {
    const ALLOWED_SCREENS = new Set([
      'CommunityPostDetail',
      'ArrestNewsDetail',
      'IncidentPhotoDetail',
      'NewCrimeCaseDetail',
      'NoticeDetail',
      'ReviewDetail',
    ]);

    const { screen, link_url, url, ...rest } = data || {};
    const finalParams =
      rest.params && typeof rest.params === 'object' ? rest.params : rest;

    if (screen && ALLOWED_SCREENS.has(screen)) {
      navigateTo?.(screen, finalParams);
      return;
    }

    const externalUrl = link_url || url;
    if (typeof externalUrl === 'string') {
      openExternalUrlBestEffort(externalUrl);
    }
  } catch (e) {
    console.warn('[Push] openFromPayload error:', e?.message || e);
  }
}

/** 런타임 와이어링 (App.tsx에서 호출) — 포그라운드만 바인딩 */
export async function wireMessageHandlers(navigateTo) {
  // Fast Refresh/중복 호출 방지
  if (global.__PUSH_FG_BOUND__) return;
  global.__PUSH_FG_BOUND__ = true;

  // 포그라운드 수신 → 우리가 1회 표시
  messaging().onMessage(async remoteMessage => {
    try {
      await displayOnce(remoteMessage, 'foreground');
    } catch (e) {
      console.warn('[FCM] onMessage display error:', e?.message || e);
    }
  });

  // 포그라운드 탭 이벤트만 처리 (백그라운드 탭은 index.js 전담)
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      openFromPayload(navigateTo, detail?.notification?.data || {});
    }
  });
}

// ===== 토큰 등록/갱신 & 해제 =====

/** 로그인 직후 토큰 등록 */
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

    if (error) {
      if (error.code === '42883') {
        console.error('[Push] RPC "register_push_token" not found.');
      }
      console.error('[Push] register_push_token RPC error:', error.message);
      throw error;
    }

    console.log('[Push] Token registered for user:', userId);
  } catch (error) {
    console.error('[Push] updatePushTokenOnLogin error:', error);
  }
};

/** 토큰 갱신 리스너 */
export const setupTokenRefreshListener = userId => {
  if (!userId) return () => {};
  return messaging().onTokenRefresh(async newFcmToken => {
    console.log('[Push] FCM token refreshed:', newFcmToken);
    const { error } = await supabase.rpc('register_push_token', {
      fcm_token: newFcmToken,
      p_platform: Platform.OS,
    });
    if (error)
      console.error('[Push] Failed to register refreshed token:', error);
  });
};

/** 토큰 해제 */
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
