// src/lib/push.js

import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import { supabase } from '../lib/supabaseClient';

export const CHANNEL_ID = 'push_default_v2';

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

export const requestNotificationPermissionAndroid = async () => {
  if (Platform.OS === 'android') {
    try {
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
          '[Push] RPC function "register_push_token" not found. Please create it in your Supabase project using the provided SQL script.',
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
    console.error(
      '[Push] A critical error occurred in updatePushTokenOnLogin:',
      error,
    );
  }
};

export const setupTokenRefreshListener = userId => {
  if (!userId) return () => {};

  return messaging().onTokenRefresh(async newFcmToken => {
    console.log('[Push] FCM token has been refreshed:', newFcmToken);

    const { error } = await supabase.rpc('register_push_token', {
      fcm_token: newFcmToken,
      p_platform: Platform.OS,
    });

    if (error) {
      console.error(
        '[Push] Failed to register refreshed token via RPC:',
        error,
      );
    }
  });
};

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
    const { screen, link_url, url, ...params } = data || {};

    if (screen) {
      navigateTo?.(screen, params);
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
