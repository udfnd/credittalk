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
  extractTapData,
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
      // 삼성에서 PRESS 이벤트의 data가 비어 오는 사례 대비: 표시 시점 백업에서 복원
      await queueTapIntent(await extractTapData(detail?.notification));
      if (detail?.notification?.id) {
        try {
          await notifee.cancelNotification(detail.notification.id);
        } catch {}
      }
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
