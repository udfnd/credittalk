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
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Default (High)',
      importance: AndroidImportance.HIGH,
    });
    console.log('[Push] Notification channel ensured.');
  } catch (error) {
    console.error('[Push] Error creating notification channel:', error);
  }
}

/** Android 13+ 권한 요청 */
export const requestNotificationPermissionAndroid = async () => {
  if (Platform.OS === 'android') {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      console.log(
        `[Push] Android notification permission: ${result === 'granted' ? 'granted' : 'denied'}`,
      );
    } catch (err) {
      console.warn('[Push] Failed to request notification permission', err);
    }
  }
};

/** 로그인 직후 토큰 등록 */
export const updatePushTokenOnLogin = async userId => {
  if (!userId) {
    console.error('[Push] User ID is missing, cannot update push token.');
    return;
  }

  try {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        console.log('[Push] iOS notification permission not enabled.');
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

    console.log('[Push] Fetched FCM Token:', fcmToken);

    const { error } = await supabase.rpc('register_push_token', {
      fcm_token: fcmToken,
      p_platform: Platform.OS,
    });

    if (error) {
      if (error.code === '42883') {
        console.error(
          '[Push] RPC "register_push_token" not found. Create it in Supabase.',
        );
      }
      console.error(
        '[Push] Error calling register_push_token RPC:',
        error.message,
      );
      throw error;
    }

    console.log('[Push] Successfully registered push token for user:', userId);
  } catch (error) {
    console.error('[Push] Critical error in updatePushTokenOnLogin:', error);
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

/** data-only/notification 폴백 포함 제목/본문 추출 */
function pickTitleBody(remote) {
  const d = remote?.data || {};
  const n = remote?.notification || {};

  // AdminJS에서 보낸 data.params 구조를 파싱
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
      ...parsedParams, // screen, postId 등을 data 최상위로 올림
    },
  };
}

/** 푸시 페이로드 → 네비게이션 or 외부 링크 */
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

    const { screen, link_url, url, ...params } = data || {};

    // Edge Function에서 보낸 data.data.params 구조 처리
    const finalParams =
      params.params && typeof params.params === 'object'
        ? params.params
        : params;

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

/** 백그라운드/종료 상태: 데이터 전용 푸시 → 로컬 알림 생성 */
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    await ensureNotificationChannel();
    const { title, body, data } = pickTitleBody(remoteMessage);
    await notifee.displayNotification({
      title,
      body,
      data,
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default', launchActivity: 'default' },
        style: body ? { type: AndroidStyle.BIGTEXT, text: body } : undefined,
      },
    });
  } catch (e) {
    console.warn('[FCM] bg display error:', e?.message || e);
  }
});

/** 런타임 와이어링 (App.tsx에서 호출) */
export async function wireMessageHandlers(navigateTo) {
  // 포그라운드 수신 → 로컬 알림 생성
  messaging().onMessage(async remoteMessage => {
    try {
      await ensureNotificationChannel();
      const { title, body, data } = pickTitleBody(remoteMessage);
      await notifee.displayNotification({
        title,
        body,
        data,
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default' },
          style: body ? { type: AndroidStyle.BIGTEXT, text: body } : undefined,
        },
      });
    } catch (e) {
      console.warn('[FCM] onMessage display error:', e?.message || e);
    }
  });

  // ✅ Notifee 포그라운드 이벤트 (알림 탭)
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      openFromPayload(navigateTo, detail?.notification?.data || {});
    }
  });

  // ✅ Notifee 백그라운드 이벤트 (알림 탭)
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS) {
      openFromPayload(navigateTo, detail?.notification?.data || {});
    }
  });
}

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
