import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppRegistry, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';

import App from './App';
import { name as appName } from './app.json';

import {
  displayOnce,
  ensureNotificationChannel,
  queueTapIntent,
} from './src/lib/push';

if (!global.__PUSH_BG_BOUND__) {
  global.__PUSH_BG_BOUND__ = true;

  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('[BG] setBackgroundMessageHandler fired', {
      platform: Platform.OS,
      hasData: !!remoteMessage?.data,
      hasNotif: !!remoteMessage?.notification,
    });
    try {
      await ensureNotificationChannel();
      await displayOnce(remoteMessage, 'background');
    } catch (e) {
      console.warn('[FCM] BG handler error:', e?.message || e);
    }
  });

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      await queueTapIntent(detail?.notification?.data || {});
      if (detail?.notification?.id) {
        try {
          await notifee.cancelNotification(detail.notification.id);
        } catch {}
      }
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
