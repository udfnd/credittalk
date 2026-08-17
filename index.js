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
  removeFromDisplayIndex,
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
    if (type === EventType.DISMISSED) {
      // 스와이프로 지운 알림은 blind 복원 후보에서 제거(id 소거 시 best-effort)
      await removeFromDisplayIndex(detail?.notification?.id);
      return;
    }
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      // 삼성에서 PRESS 이벤트의 data(때로 id까지)가 비어 오는 사례 대비:
      // 표시 시점 백업에서 복원(빈 PRESS는 최근 표시분으로 추정 복원)
      const tapData = await extractTapData(detail?.notification, {
        allowBlindRestore: true,
      });
      await queueTapIntent(tapData);
      // 탭된 알림은 autoCancel(기본 true)이 이미 쉐이드에서 제거하므로
      // _restoredId를 추가로 cancel하지 않는다(추정이 틀리면 탭하지 않은
      // 알림을 지워 그 링크를 되찾을 수 없게 됨 — 적대적 검증 1-B)
      if (detail?.notification?.id) {
        try {
          await notifee.cancelNotification(detail.notification.id);
        } catch {}
      }
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
