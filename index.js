// index.js
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';

import App from './App';
import { name as appName } from './app.json';

// 표시/채널 처리는 push 유틸에 위임 (탭 처리 유틸은 헤드리스에서 사용하지 않음)
import { displayOnce, ensureNotificationChannel } from './src/lib/push';

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

  // (2) 헤드리스(앱 종료) 탭 이벤트: ❗아무 것도 하지 않음
  //     실제 라우팅은 App.tsx의 getInitialNotification() 단계에서 수행
  notifee.onBackgroundEvent(async () => {
    // no-op: let App.tsx handle initial navigation after cold start
  });
}

AppRegistry.registerComponent(appName, () => App);
