/**
 * Push tap-queue race regression tests (S24/S25 간헐 미이동 버그)
 *
 * 원인: notifee 표시 알림(포그라운드 수신/데이터 전용)의 탭은
 * onBackgroundEvent → queueTapIntent(AsyncStorage 쓰기)로 적재되고,
 * 앱 초기화/AppState 'active'의 drainQueuedTap(읽기)이 이를 소비한다.
 * 쓰기와 읽기 사이 순서 보장이 없어 읽기가 먼저 끝나면 탭이 큐에 남고
 * 앱은 홈 화면만 표시된다(다음 포그라운드에서야 뒤늦게 이동).
 *
 * 수정: queueTapIntent가 적재 완료 직후 등록된 드레인 리스너를 호출해
 * pull 타이밍과 무관하게 탭이 소비되도록 한다(push-notified queue).
 */

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
  },
  AndroidImportance: { HIGH: 4 },
  AndroidLaunchActivityFlag: { SINGLE_TOP: 1, NEW_TASK: 2 },
  AndroidStyle: { BIGTEXT: 1, BIGPICTURE: 0 },
  EventType: { PRESS: 1, ACTION_PRESS: 2 },
}));

jest.mock('../src/lib/supabaseClient', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

const fs = require('fs');
const path = require('path');

describe('Push tap queue - race-free drain (S24/S25)', () => {
  let push;

  beforeEach(() => {
    jest.resetModules();
    global.__PUSH_FG_BOUND__ = false;
    push = require('../src/lib/push');
  });

  test('setTapQueueListener is exported so taps can be drained push-style', () => {
    expect(typeof push.setTapQueueListener).toBe('function');
  });

  test('queueTapIntent notifies the registered listener after persisting the tap', async () => {
    const drained = jest.fn();
    push.setTapQueueListener(drained);
    await push.queueTapIntent({ nid: 'n1', screen: 'NoticeDetail' });
    expect(drained).toHaveBeenCalledTimes(1);
  });

  test('a tap queued AFTER drainQueuedTap already ran still navigates (race regression)', async () => {
    const navigateTo = jest.fn();
    await push.wireMessageHandlers(navigateTo);

    // 초기화 시점의 drain: 큐가 비어 있음 (탭 이벤트가 아직 도착하지 않음)
    await push.drainQueuedTap(navigateTo);
    expect(navigateTo).not.toHaveBeenCalled();

    // 늦게 도착한 백그라운드 PRESS 이벤트 → 리스너가 즉시 드레인해야 함
    await push.queueTapIntent({
      nid: 'n2',
      screen: 'NoticeDetail',
      noticeId: '7',
    });
    // 리스너 콜백의 비동기 drain 완료 대기
    await new Promise(r => setTimeout(r, 0));

    expect(navigateTo).toHaveBeenCalledWith(
      'NoticeDetail',
      expect.objectContaining({ noticeId: '7' }),
    );
  });
});

describe('Tap dedup key must distinguish nid-less notifications', () => {
  // 네이티브 폴백 캡처 data에는 title/body/nid가 없을 수 있음. 이때 dedup 키가
  // 상수 "{}"로 붕괴하면 60초 내 서로 다른 알림의 두 번째 탭이 조용히 드롭됨.
  test('two different nid-less taps within 60s both navigate', async () => {
    const push2 = require('../src/lib/push');
    const navigateTo = jest.fn();
    await push2.openFromPayloadOnce(navigateTo, {
      screen: 'NoticeDetail',
      noticeId: '1',
    });
    await push2.openFromPayloadOnce(navigateTo, {
      screen: 'ReviewDetail',
      reviewId: '2',
    });
    expect(navigateTo).toHaveBeenCalledTimes(2);
    expect(navigateTo).toHaveBeenCalledWith(
      'ReviewDetail',
      expect.objectContaining({ reviewId: '2' }),
    );
  });
});

describe('External link opening under Android 11+ package visibility', () => {
  // manifest <queries>에 없는 스킴은 canOpenURL이 false를 반환하지만,
  // 실제 openURL은 성공할 수 있음. canOpenURL false로 이동을 포기하면 안 됨.
  test('openFromPayload still attempts openURL when canOpenURL is false', async () => {
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined);
    const push2 = require('../src/lib/push');
    await push2.openFromPayload(jest.fn(), { link_url: 'kakaotalk://inapp' });
    expect(openSpy).toHaveBeenCalledWith('kakaotalk://inapp');
  });
});

describe('MainActivity fallback stays scoped to FCM flat extras', () => {
  test('capturePushIntent does NOT contain dead notifee nested-bundle code', () => {
    const act = fs.readFileSync(
      path.resolve(
        __dirname,
        '../android/app/src/main/java/com/credittalka/MainActivity.kt',
      ),
      'utf-8',
    );
    // 검증 결과: notifee press는 MainActivity 인텐트에 "notification" Bundle을
    // 싣지 않음(트램폴린 액티비티로만 전달). 해당 캡처 코드는 죽은 코드라 제거됨.
    expect(act).not.toMatch(/getBundleExtra\("notification"\)/);
  });
});

describe('AuthContext must not bounce MainApp on token refresh (App→Home 되감김)', () => {
  const authSource = fs.readFileSync(
    path.resolve(__dirname, '../src/context/AuthContext.js'),
    'utf-8',
  );

  test('profile refetch is keyed by user id, not user object identity', () => {
    // onAuthStateChange는 TOKEN_REFRESHED마다 새 user 객체를 만들므로
    // [user] 의존성은 리프레시마다 profile 재조회를 유발함.
    expect(authSource).toMatch(/\},\s*\[user\?\.id\]\s*\);/);
  });

  test('transient profile fetch failure must NOT null out an existing profile', () => {
    // profile이 잠깐 null이 되면 RootStack이 MainApp을 unmount→remount하여
    // 성공한 푸시 네비게이션이 홈으로 되감김.
    const fetchBlock = authSource.match(
      /const fetchProfile = async[\s\S]*?\n    \};/,
    );
    expect(fetchBlock).not.toBeNull();
    const catchBlock = fetchBlock[0].match(/catch[\s\S]*$/);
    expect(catchBlock[0]).not.toMatch(/setProfile\(null\)/);
  });
});
