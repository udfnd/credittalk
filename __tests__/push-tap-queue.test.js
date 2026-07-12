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

  test('foreground PRESS after App remount navigates via the LATEST navigateTo (stale closure regression)', async () => {
    // 삼성 OneUI는 백그라운드에서 프로세스는 살리고 액티비티만 죽였다 재생성하는
    // 경우가 있음 → JS 컨텍스트 유지 + React 루트 리마운트. 이때 __PUSH_FG_BOUND__
    // 가드 때문에 리스너가 첫 마운트의 죽은 navRef 클로저를 계속 쥐고 있으면
    // 이후 알림 탭이 죽은 pending 큐로 들어가 조용히 사라진다(홈만 표시).
    const notifee = require('@notifee/react-native').default;
    const nav1 = jest.fn();
    const nav2 = jest.fn();

    await push.wireMessageHandlers(nav1); // 마운트 #1
    const fgHandler = notifee.onForegroundEvent.mock.calls[0][0];
    await push.wireMessageHandlers(nav2); // 액티비티 재생성 후 마운트 #2

    await fgHandler({
      type: 1, // PRESS
      detail: {
        notification: {
          data: { nid: 'remount1', screen: 'NoticeDetail', noticeId: '9' },
        },
      },
    });
    await new Promise(r => setTimeout(r, 0));

    expect(nav2).toHaveBeenCalledWith(
      'NoticeDetail',
      expect.objectContaining({ noticeId: '9' }),
    );
    expect(nav1).not.toHaveBeenCalled();
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

describe('Detail screens must refetch when route params change (재직진입 dead-nav)', () => {
  // 이미 해당 상세 화면이 포커스된 상태에서 알림을 탭하면 React Navigation은
  // 화면을 push하지 않고 기존 라우트의 params만 갱신한다. 이때 focus 이벤트는
  // 발생하지 않으므로, focus 리스너에만 의존하는 화면은 이전 글을 그대로
  // 보여준다("클릭해도 이동 안 함"). id 변경 → fetch 콜백 identity 변경 →
  // 직접 useEffect로 재조회해야 한다.
  const cases = [
    ['CommunityPostDetailScreen', 'fetchPostDetail'],
    ['NoticeDetailScreen', 'fetchNoticeDetails'],
    ['ReviewDetailScreen', 'fetchReviewDetail'],
    ['IncidentPhotoDetailScreen', 'fetchPhotoDetail'],
    ['NewCrimeCaseDetailScreen', 'fetchCaseDetail'],
    ['EventDetailScreen', 'fetchEventDetail'],
  ];

  test.each(cases)('%s re-runs %s on param change', (file, fn) => {
    const src = fs.readFileSync(
      path.resolve(__dirname, `../src/screens/${file}.js`),
      'utf-8',
    );
    const direct = new RegExp(
      `useEffect\\(\\(\\) => \\{[\\s\\S]{0,200}?${fn}\\(\\);\\s*\\}, \\[${fn}\\]\\)`,
    );
    expect(src).toMatch(direct);
  });
});

describe('Pending nav intent must survive App remounts', () => {
  test('App.tsx keeps the pending holder in module scope, not useRef', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    );
    // 액티비티 재생성으로 App이 리마운트되면 useRef 기반 pending은 유실된다.
    expect(appSource).toMatch(/const pendingNavHolder[\s\S]{0,200}?current:\s*null/);
    expect(appSource).not.toMatch(/pendingNavRef = useRef/);
  });

  test('pending intents expire (오래된 탭의 지연 로그인 후 유령 이동 방지)', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    );
    // 모듈 스코프 홀더는 프로세스 수명 동안 살아있으므로, 큐잉 시각을 기록하고
    // flush 시점에 TTL을 넘긴 인텐트는 폐기해야 한다.
    expect(appSource).toMatch(/PENDING_NAV_TTL_MS/);
    expect(appSource).toMatch(/setPendingNav\(/);
    expect(appSource).toMatch(/takePendingNav\(/);
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

  test('cold-start profile fetch failure must retry (AdditionalInfo 갇힘 + pending nav 유실 방지)', () => {
    // 콜드스타트 첫 fetchProfile이 일시 실패하면 profile=null로 남아
    // RootStack이 AdditionalInfo에 갇히고, authReady가 영영 false라
    // 큐잉된 푸시 네비게이션도 flush되지 않는다. 백오프 재시도가 필요.
    const fetchBlock = authSource.match(
      /const fetchProfile = async[\s\S]*?\n    \};/,
    );
    expect(fetchBlock).not.toBeNull();
    expect(fetchBlock[0]).toMatch(/setTimeout/);
    expect(authSource).toMatch(/RETRY_DELAYS_MS/);
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
