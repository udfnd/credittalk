/**
 * @format
 */

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppRegistry, Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';

import App from './App';
import { name as appName } from './app.json';

// 앱 내부 push 유틸에서 채널 ID 재사용
import {
  CHANNEL_ID,
  hasNotificationPayload,
  pickTitleBody,
} from './src/lib/push';

/* ──────────────────────────────────────────────────────────────
 *  백그라운드 수신/탭 처리 (엔트리에서 반드시 등록)
 *  - data-only 수신 시 우리가 로컬로 표시
 *  - 표시된 카드를 백그라운드에서 탭하면 link_url 열기
 * ────────────────────────────────────────────────────────────── */

// 스킴 없으면 https로 보정
function normalizeExternalUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`;
}

// youtu.be 단축 링크를 www.youtube.com/watch로 변환
function rewriteYoutubeShort(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '');
      if (!id) return null;
      const qs = u.search ? `&${u.search.slice(1)}` : '';
      return `https://www.youtube.com/watch?v=${id}${qs}`;
    }
  } catch {}
  return null;
}

// data.link_url / data.url 우선 순위로 외부 링크 열기 (https는 canOpenURL 체크 없이 바로 시도)
async function openLinkFromData(data) {
  try {
    const raw = data?.link_url || data?.url;
    let url = normalizeExternalUrl(raw);
    if (!url) return;

    try {
      await Linking.openURL(url);
      return;
    } catch {
      // 유튜브 단축링크 재시도
      const yt = rewriteYoutubeShort(url);
      if (yt && yt !== url) {
        try {
          await Linking.openURL(yt);
        } catch {}
      }
    }
  } catch {
    // 절대 크래시 금지
  }
}

// 안드로이드 채널 보장(여러 번 호출되어도 안전)
async function ensureChannel() {
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Default (High)',
      importance: AndroidImportance.HIGH,
    });
  } catch {}
}

// Fast Refresh 대비: 중복 등록 방지
if (!global.__PUSH_BG_BOUND__) {
  global.__PUSH_BG_BOUND__ = true;

  // (1) 백그라운드 수신(data-only 포함) → 우리가 직접 로컬 표시
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
      if (hasNotificationPayload(remoteMessage)) {
        // 시스템이 이미 표시하는 알림이라면 중복 표시 방지
        return;
      }

      await ensureChannel();
      const { title, body, data } = pickTitleBody(remoteMessage);

      await notifee.displayNotification({
        title,
        body,
        data,
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default', launchActivity: 'default' },
          style:
            body && body.length > 60
              ? { type: AndroidStyle.BIGTEXT, text: body }
              : undefined,
        },
      });
    } catch {}
  });

  // (2) Notifee "백그라운드" 탭 이벤트 → 외부 링크 열기
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    try {
      if (type === EventType.PRESS) {
        await openLinkFromData(detail?.notification?.data);
      }
    } catch {}
  });
}

AppRegistry.registerComponent(appName, () => App);
