// src/lib/push.js

import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import { supabase } from '../lib/supabaseClient';

// 항상 HIGH로 설정된 알림 채널
export const CHANNEL_ID = 'push_default_v2';

/** 안드로이드 알림 채널 생성(최초 1회, 이미 있으면 no-op) */
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

/** Android 13+ 알림 권한 요청 */
export const requestNotificationPermissionAndroid = async () => {
  if (Platform.OS === 'android') {
    try {
      // Android 13 (TIRAMISU) 이상 버전 대응
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result === 'granted') {
        console.log('[Push] Android notification permission granted.');
      } else {
        console.log('[Push] Android notification permission denied.');
      }
    } catch (err) {
      console.warn('[Push] Failed to request notification permission', err);
    }
  }
};

/**
 * 로그인 성공 후, 기기의 최신 FCM 토큰을 가져와 Supabase DB에 업데이트(upsert)합니다.
 * @param {string} userId - 현재 로그인한 사용자의 auth.users.id (UUID)
 */
export const updatePushTokenOnLogin = async userId => {
  if (!userId) {
    console.error('[Push] User ID is missing, cannot update push token.');
    return;
  }

  try {
    // iOS에서는 토큰을 얻기 전 권한 요청이 선행되어야 함
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        console.log('[Push] iOS notification permission not enabled.');
        // 사용자에게 설정으로 이동하여 권한을 켜도록 안내할 수 있습니다.
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

    const { error } = await supabase.from('device_push_tokens').upsert(
      {
        user_id: userId,
        token: fcmToken,
        platform: Platform.OS,
        enabled: true,
        last_seen: new Date().toISOString(),
      },
      {
        onConflict: 'token', // 토큰이 이미 존재하면 다른 필드를 업데이트합니다. (user_id 포함)
      },
    );

    if (error) {
      console.error('[Push] Error upserting push token:', error.message);
      throw error;
    }

    console.log('[Push] Successfully upserted push token for user:', userId);
  } catch (error) {
    console.error(
      '[Push] A critical error occurred in updatePushTokenOnLogin:',
      error,
    );
  }
};

/**
 * 앱 사용 중 FCM 토큰이 갱신될 때를 대비한 리스너입니다.
 * 로그인된 사용자에 대해 한 번만 설정하면 됩니다.
 * @param {string} userId - 현재 로그인한 사용자의 auth.users.id (UUID)
 * @returns {() => void} Unsubscribe 함수
 */
export const setupTokenRefreshListener = userId => {
  if (!userId) return () => {};

  return messaging().onTokenRefresh(async newFcmToken => {
    console.log('[Push] FCM token has been refreshed:', newFcmToken);
    await supabase
      .from('device_push_tokens')
      .upsert(
        {
          user_id: userId,
          token: newFcmToken,
          platform: Platform.OS,
          enabled: true,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )
      .catch(err =>
        console.error('[Push] Failed to upsert refreshed token:', err),
      );
  });
};

// --- 이하 함수들은 기존 로직을 유지합니다 ---

function safeParse(jsonish) {
  try {
    return typeof jsonish === 'string' ? JSON.parse(jsonish) : jsonish;
  } catch {
    return undefined;
  }
}

async function openExternalUrlBestEffort(url) {
  if (!url) return;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      console.warn(`[Push] Cannot open URL: ${url}`);
    }
  } catch (error) {
    console.error('[Push] Error opening URL:', error);
  }
}

export function openFromPayload(navigateTo, data = {}) {
  try {
    const { screen, params, link_url, url } = data || {};
    if (screen) {
      const parsed = typeof params === 'string' ? safeParse(params) : params;
      navigateTo?.(screen, parsed);
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

export async function wireMessageHandlers(navigateTo) {
  messaging().onMessage(async remoteMessage => {
    try {
      const { notification, data } = remoteMessage;
      await notifee.displayNotification({
        title: notification?.title,
        body: notification?.body,
        data,
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default' },
          style: notification?.body
            ? { type: AndroidStyle.BIGTEXT, text: notification.body }
            : undefined,
        },
      });
    } catch (e) {
      console.warn('[FCM] onMessage display error:', e?.message || e);
    }
  });

  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      openFromPayload(navigateTo, detail?.notification?.data || {});
    }
  });

  messaging().onNotificationOpenedApp(remoteMessage => {
    if (remoteMessage) {
      openFromPayload(navigateTo, remoteMessage.data || {});
    }
  });

  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) {
        openFromPayload(navigateTo, remoteMessage.data || {});
      }
    });
}

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
