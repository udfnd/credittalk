// index.js
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';

import App from './App';
import { name as appName } from './app.json';

import {
  displayOnce,
  ensureNotificationChannel,
  queueTapPayload,
} from './src/lib/push';

if (!global.__PUSH_BG_BOUND__) {
  global.__PUSH_BG_BOUND__ = true;

  // 백그라운드 수신 → 표시(데이터 only면 우리가 표시, notification이면 스킵)
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
      await ensureNotificationChannel();
      await displayOnce(remoteMessage, 'background');
    } catch (e) {
      console.warn('[FCM] BG handler error:', e?.message || e);
    }
  });

  // 백그라운드/종료 탭 → ❗네비게이션은 하지 않고 '큐에 저장'만
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    try {
      if (type === EventType.PRESS) {
        const data = detail?.notification?.data || {};
        await queueTapPayload(data);
        // 여기서 딥링크 열지 마세요. (앱 포어그라운드 전환 후 App.tsx가 일괄 처리)
      }
    } catch {}
  });
}

AppRegistry.registerComponent(appName, () => App);
