import {
  Platform,
  PermissionsAndroid,
  Linking,
  Alert,
  AppState,
} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';

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
  if (Platform.OS !== 'android') return;
  try {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    console.log('[APP]', 'Android notification permission requested');
  } catch (err) {
    console.warn('[Push] request permission failed', err);
  }
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

async function markAndCheckSeen(key) {
  if (!key) return false;
  const k = `noti_seen:${key}`;
  const seen = await AsyncStorage.getItem(k);
  if (seen) return true;
  await AsyncStorage.setItem(k, String(Date.now()));
  return false;
}

function getTapKeyFromData(data = {}) {
  return (
    data?.nid ||
    data?.collapse_key ||
    data?.messageId ||
    JSON.stringify({ t: data?.title, b: data?.body })
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

  const { title, body, data, image } = picked;

  // 4) 같은 메시지는 같은 id로 '교체'되도록 보장 (nid 없으면 key로 fallback)
  const stableId =
    (remote?.data && (remote.data.nid || remote.data.collapse_key)) || key;

  const androidOptions = {
    channelId: CHANNEL_ID,
    pressAction: { id: 'default' },
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

export async function openFromPayload(navigateTo, data = {}) {
  try {
    const ALLOWED_SCREENS = new Set([
      'CommunityPostDetail',
      'ArrestNewsDetail',
      'IncidentPhotoDetail',
      'NewCrimeCaseDetail',
      'NoticeDetail',
      'ReviewDetail',
      'HelpDeskDetail',
    ]);

    const { screen, link_url, url, ...rest } = data || {};
    const finalParams =
      rest?.params && typeof rest.params === 'object' ? rest.params : rest;

    if (screen && ALLOWED_SCREENS.has(screen)) {
      console.log('[NAV:INTENT] openFromPayload navigate', {
        screen,
        params: finalParams,
      });
      navigateTo?.(screen, finalParams);
      return;
    }

    const externalUrl = link_url || url;
    if (typeof externalUrl === 'string') {
      console.log('[NAV:INTENT] open external url', externalUrl);
      await openExternalUrlBestEffort(externalUrl);
    } else {
      console.log('[NAV:INTENT] nothing to open, payload=', data);
    }
  } catch (e) {
    console.warn('[Push] openFromPayload error:', e?.message || e);
  }
}

export async function openFromPayloadOnce(navigateTo, data = {}) {
  const key = getTapKeyFromData(data);
  const marker = `noti_tap:${key}`;
  const seen = key ? await AsyncStorage.getItem(marker) : null;
  if (seen) {
    console.log('[PUSH] openFromPayloadOnce dedup (tap already handled)', {
      key,
    });
    return;
  }
  if (key) await AsyncStorage.setItem(marker, String(Date.now()));
  return openFromPayload(navigateTo, data);
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
      await openFromPayloadOnce(navigateTo, data);
    }
    console.log('[NAV:INTENT] drainQueuedTap done');
  } catch (e) {
    console.warn('[NAV:INTENT] drainQueuedTap error:', e?.message || e);
  }
}

export async function wireMessageHandlers(navigateTo) {
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
      await queueTapIntent(detail?.notification?.data || {});
      await drainQueuedTap(navigateTo);
    }
  });

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      console.log('[NAV:INTENT] AppState active → drainQueuedTap');
      drainQueuedTap(navigateTo);
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
