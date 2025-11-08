// index.js
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';

import App from './App';
import { name as appName } from './app.json';

// 표시/채널/딥링크 처리는 push 유틸에 위임
import {
  displayOnce,
  ensureNotificationChannel,
  openFromPayloadOnce, // 외부 링크/딥링크 열기
} from './src/lib/push';

// Fast Refresh 대비: 중복 등록 방지
if (!global.__PUSH_BG_BOUND__) {
  global.__PUSH_BG_BOUND__ = true;

  // (1) 백그라운드 수신 → 우리가 1회 표시
  //     - data-only: 표시
  //     - notification payload 동봉: displayOnce 내부에서 스킵 (OS가 이미 표시)
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
      await ensureNotificationChannel();
      await displayOnce(remoteMessage, 'background');
    } catch (e) {
      console.warn('[FCM] BG handler error:', e?.message || e);
    }
  });

  // (2) Notifee "백그라운드" 탭 이벤트 → 페이로드 처리(외부 링크/딥링크)
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    try {
      if (type === EventType.PRESS) {
        // headless 컨텍스트라 내비게이션은 생략, 링크/딥링크만 처리
        await openFromPayloadOnce(undefined, detail?.notification?.data || {});
      }
    } catch (e) {
      // no-op
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
