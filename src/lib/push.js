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

/* --------------------------------- 채널/권한 --------------------------------- */

export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default (High)',
    importance: AndroidImportance.HIGH,
  });
}

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

/* --------------------------------- 헬퍼들 --------------------------------- */

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

export function hasNotificationPayload(remoteMessage) {
  const notif = remoteMessage?.notification;
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
    } catch (e) {
      console.warn('[Push] Failed to parse data.params:', e);
    }
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

function getTapKeyFromData(data = {}) {
  return (
    data?.nid ||
    data?.collapse_key ||
    data?.messageId ||
    JSON.stringify({ t: data?.title, b: data?.body })
  );
}

async function markTapHandledIfFirst(key) {
  if (!key) return true;
  const k = `noti_tap:${key}`;
  const seen = await AsyncStorage.getItem(k);
  if (seen) return false;
  await AsyncStorage.setItem(k, String(Date.now()));
  return true;
}

/* ------------------------------ 표시/탭 처리 ------------------------------ */

export async function displayOnce(remote, source = 'unknown') {
  const expectOs = remote?.data?.expect_os_alert === '1';

  // OS가 표시할 예정이면(서버가 명시) 또는 notification payload가 붙어왔고,
  // 현재 포그라운드가 아니라면 → 중복 표기를 스킵
  if (source !== 'foreground' && (expectOs || hasNotificationPayload(remote))) {
    return;
  }

  await ensureNotificationChannel();
  const { title, body, data, image } = pickTitleBody(remote);

  const androidOptions = {
    channelId: CHANNEL_ID,
    pressAction: { id: 'default' },
    smallIcon: 'ic_launcher',
    ...(image
      ? { style: { type: AndroidStyle.BIGPICTURE, picture: image } }
      : body
        ? { style: { type: AndroidStyle.BIGTEXT, text: body } }
        : {}),
    ...(image ? { largeIcon: image } : {}), // 유효한 URL/리소스일 때만
  };

  await notifee.displayNotification({
    id:
      (remote?.data && (remote.data.nid || remote.data.collapse_key)) ||
      undefined,
    title,
    body,
    data,
    android: androidOptions,
    ios: {
      sound: 'default',
      foregroundPresentationOptions: { alert: true, sound: true, badge: true },
      attachments: image ? [{ url: image }] : undefined,
    },
  });
}

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

export async function openFromPayloadOnce(navigateTo, data = {}) {
  const key = getTapKeyFromData(data);
  const first = await markTapHandledIfFirst(key);
  if (!first) return;
  return openFromPayload(navigateTo, data);
}

/* ---------------------------- 토큰 등록/갱신/해제 ---------------------------- */

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
