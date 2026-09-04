/**
 * Android 알림 표시를 notifee → 네이티브(NotificationManager)로 전환하는 회귀 테스트
 *
 * 배경(2026-09-04 프로덕션 실측):
 *  - notifee가 표시한 알림의 탭은 21일간 사용자 155명 중 2명만 성공했다(사실상 불능).
 *  - v36~v40에 걸쳐 만든 id 백업 / 쉐이드 관측 blind 복원은 264회 시도 중 복원 0건.
 *  - 원인(디컴파일 확인): notifee ReceiverService.launchPendingIntentActivity 는
 *    MainActivity 인텐트에 "mainComponent" 문자열 하나만 싣는다. payload가 네이티브로
 *    전달될 통로가 없어, 성공률 1위 경로인 MainActivity.capturePushIntent 가 notifee
 *    탭만은 구제할 수 없다. payload는 JS 이벤트로만 오고 OneUI가 그걸 비운다.
 *
 * 수정: 안드로이드는 앱이 직접 알림을 띄우고(PendingIntent → MainActivity + data extras),
 * 탭은 이미 검증된 네이티브 캡처 경로로 들어온다. 다른 앱들이 쓰는 방식과 동일하다.
 */

const fs = require('fs');
const path = require('path');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock'),
);

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = () => ({
    onMessage: jest.fn(),
    onTokenRefresh: jest.fn(() => jest.fn()),
    getToken: jest.fn(async () => 'token'),
    requestPermission: jest.fn(),
  });
  messaging.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2 };
  return { __esModule: true, default: messaging };
});

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => {}),
    displayNotification: jest.fn(async () => {}),
    onForegroundEvent: jest.fn(),
    onBackgroundEvent: jest.fn(),
    cancelNotification: jest.fn(async () => {}),
    getDisplayedNotifications: jest.fn(async () => []),
  },
  AndroidImportance: { HIGH: 4 },
  AndroidLaunchActivityFlag: { SINGLE_TOP: 1, NEW_TASK: 2 },
  AndroidStyle: { BIGTEXT: 1, BIGPICTURE: 0 },
  EventType: { PRESS: 1, ACTION_PRESS: 2 },
}));

jest.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({ insert: jest.fn(async () => ({ error: null })) })),
  },
}));

const BROADCAST = {
  messageId: 'mid-native-1',
  data: {
    nid: 'push_native_1',
    title: '쑈부 보자고!',
    body: '영상 보러가기',
    link_url: 'https://youtu.be/yZRlUDAMeto',
  },
};

describe('Android 알림은 앱이 직접 표시한다(notifee 탭 경로 제거)', () => {
  let push;
  let notifee;
  let ReactNative;
  let display;

  beforeEach(() => {
    jest.resetModules();
    global.__PUSH_FG_BOUND__ = false;
    ReactNative = require('react-native');
    ReactNative.Platform.OS = 'android';
    display = jest.fn(async () => {});
    ReactNative.NativeModules.PushNotifier = { display };
    push = require('../src/lib/push');
    notifee = require('@notifee/react-native').default;
  });

  test('안드로이드 표시는 네이티브 모듈을 쓰고 notifee를 쓰지 않는다', async () => {
    await push.displayOnce(BROADCAST, 'foreground');

    expect(display).toHaveBeenCalledTimes(1);
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  test('네이티브로 넘기는 payload에 라우팅 data와 제목/본문/채널이 실린다', async () => {
    await push.displayOnce(BROADCAST, 'foreground');

    const payload = display.mock.calls[0][0];
    expect(payload.id).toBe('push_native_1');
    expect(payload.title).toBe('쑈부 보자고!');
    expect(payload.body).toBe('영상 보러가기');
    expect(payload.channelId).toBe(push.CHANNEL_ID);
    // 탭 인텐트 extras가 될 data — MainActivity.capturePushIntent 가 읽는 키들
    expect(payload.data.link_url).toBe('https://youtu.be/yZRlUDAMeto');
    expect(payload.data.nid).toBe('push_native_1');
    expect(payload.data._mid).toBe('mid-native-1');
  });

  test('data 값은 전부 문자열로 직렬화된다(ReadableMap 제약)', async () => {
    await push.displayOnce(
      {
        messageId: 'mid-native-2',
        data: {
          nid: 'push_native_2',
          title: '답변 등록',
          screen: 'HelpDeskDetail',
          params: JSON.stringify({ questionId: 12 }),
        },
      },
      'foreground',
    );

    const payload = display.mock.calls[0][0];
    Object.values(payload.data).forEach(value => {
      expect(typeof value).toBe('string');
    });
    expect(payload.data.screen).toBe('HelpDeskDetail');
  });

  test('네이티브 모듈이 없으면 notifee로 폴백한다(알림 유실 방지)', async () => {
    jest.resetModules();
    const RN = require('react-native');
    RN.Platform.OS = 'android';
    delete RN.NativeModules.PushNotifier;
    const fallbackPush = require('../src/lib/push');
    const fallbackNotifee = require('@notifee/react-native').default;

    await fallbackPush.displayOnce(BROADCAST, 'foreground');

    expect(fallbackNotifee.displayNotification).toHaveBeenCalledTimes(1);
  });

  test('iOS는 기존대로 notifee로 표시한다', async () => {
    jest.resetModules();
    const RN = require('react-native');
    RN.Platform.OS = 'ios';
    const iosDisplay = jest.fn(async () => {});
    RN.NativeModules.PushNotifier = { display: iosDisplay };
    const iosPush = require('../src/lib/push');
    const iosNotifee = require('@notifee/react-native').default;

    await iosPush.displayOnce(BROADCAST, 'foreground');

    expect(iosNotifee.displayNotification).toHaveBeenCalledTimes(1);
    expect(iosDisplay).not.toHaveBeenCalled();
  });
});

describe('포그라운드 탭도 네이티브 캡처를 즉시 소비한다', () => {
  const nativeSource = fs.readFileSync(
    path.resolve(__dirname, '../android/app/src/main/java/com/credittalka/MainActivity.kt'),
    'utf-8',
  );
  const moduleSource = fs.readFileSync(
    path.resolve(__dirname, '../android/app/src/main/java/com/credittalka/PushIntentModule.kt'),
    'utf-8',
  );
  const pushSource = fs.readFileSync(
    path.resolve(__dirname, '../src/lib/push.js'),
    'utf-8',
  );

  test('MainActivity는 인텐트 캡처 직후 JS에 알린다', () => {
    // 앱이 이미 포그라운드면 AppState 'active' 전이가 없어 드레인 트리거가 사라진다.
    expect(nativeSource).toMatch(/PushIntentModule\.notifyCaptured\(\)/);
    expect(moduleSource).toMatch(/fun notifyCaptured/);
    expect(moduleSource).toMatch(/RCTDeviceEventEmitter/);
  });

  test('push.js는 그 이벤트를 받아 네이티브 탭을 드레인한다', () => {
    expect(pushSource).toMatch(/PushIntentCaptured/);
    expect(pushSource).toMatch(/DeviceEventEmitter/);
  });
});

describe('네이티브 알림 모듈', () => {
  const notifierSource = (() => {
    const p = path.resolve(
      __dirname,
      '../android/app/src/main/java/com/credittalka/PushNotifierModule.kt',
    );
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  })();

  test('탭 PendingIntent는 MainActivity를 직접 겨냥하고 data를 extras로 싣는다', () => {
    expect(notifierSource).toMatch(/MainActivity::class\.java/);
    expect(notifierSource).toMatch(/putExtra/);
    expect(notifierSource).toMatch(/PendingIntent\.getActivity/);
    // Android 12+ 필수
    expect(notifierSource).toMatch(/FLAG_IMMUTABLE/);
    // 탭하면 쉐이드에서 사라져야 한다
    expect(notifierSource).toMatch(/setAutoCancel\(true\)/);
  });
});
