/**
 * Push payload backup/restore regression tests (S24/S25 no_target 홈만 켜짐 버그)
 *
 * 원인: 삼성 OneUI(And 12~16)에서 notifee가 표시한 알림을 탭하면 PRESS 이벤트의
 * notification.data가 비어 도착하는 사례 실측(push_tap_logs no_target 주 45건,
 * 전원 notifee_initial/notifee_queue 경로, 같은 발송을 받은 타 유저는 정상 이동).
 * data가 비면 openFromPayload가 이동 대상을 못 찾아 앱은 홈 화면만 표시된다.
 *
 * 수정: displayOnce가 표시 직전에 notification id → data를 AsyncStorage에 백업하고,
 * 탭 캡처 지점(extractTapData)이 라우팅 필드 없는 탭을 백업에서 복원한다.
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
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({ insert: jest.fn(async () => ({ error: null })) })),
  },
}));

describe('Payload backup on display → restore on data-less tap (삼성 no_target)', () => {
  let push;
  let notifee;

  beforeEach(() => {
    jest.resetModules();
    global.__PUSH_FG_BOUND__ = false;
    push = require('../src/lib/push');
    notifee = require('@notifee/react-native').default;
  });

  async function displayBroadcast() {
    // 실제 no_target 사례와 같은 형태: 링크 브로드캐스트를 포그라운드 수신 → notifee 표시
    await push.displayOnce(
      {
        messageId: 'mid-1',
        data: {
          nid: 'bcast_1',
          title: '유튜브 새 영상',
          body: '보기',
          link_url: 'https://youtu.be/abc',
        },
      },
      'foreground',
    );
    // displayNotification에 전달된 실제 알림 객체(id, data 포함)를 회수
    const call = notifee.displayNotification.mock.calls.at(-1);
    return call[0];
  }

  test('extractTapData restores routing fields when the tap arrives with empty data', async () => {
    const shown = await displayBroadcast();
    expect(shown.id).toBe('bcast_1');

    // 삼성 실측 증상 재현: PRESS 이벤트에 id는 있으나 data가 빈 채로 도착
    const restored = await push.extractTapData({ id: shown.id, data: {} });

    expect(restored.link_url).toBe('https://youtu.be/abc');
    expect(restored._restored).toBe('1');
  });

  test('restored tap actually navigates (end-to-end through openFromPayloadOnce)', async () => {
    const shown = await displayBroadcast();
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    const data = await push.extractTapData({ id: shown.id, data: {} });
    await push.openFromPayloadOnce(jest.fn(), data, 'notifee_queue');

    expect(openSpy).toHaveBeenCalledWith('https://youtu.be/abc');
  });

  test('taps that already carry routing data are returned as-is (no backup lookup)', async () => {
    const data = { screen: 'NoticeDetail', noticeId: '3' };
    const out = await push.extractTapData({ id: 'whatever', data });
    expect(out).toBe(data);
    expect(out._restored).toBeUndefined();
  });

  test('no backup available → returns original data unchanged (기존 no_target 경로 유지)', async () => {
    const out = await push.extractTapData({ id: 'never-shown', data: {} });
    expect(out).toEqual({});
  });

  test('screen-type payload (comment push) restores too', async () => {
    await push.displayOnce(
      {
        messageId: 'mid-2',
        data: {
          nid: 'comment_5',
          title: '새 댓글',
          body: '댓글 내용',
          screen: 'CommunityPostDetail',
          params: JSON.stringify({ postId: '77' }),
        },
      },
      'foreground',
    );
    const shown = notifee.displayNotification.mock.calls.at(-1)[0];

    const nav = jest.fn();
    const data = await push.extractTapData({ id: shown.id, data: {} });
    await push.openFromPayloadOnce(nav, data, 'notifee_initial', {
      fromInitialCache: true,
    });

    expect(nav).toHaveBeenCalledWith(
      'CommunityPostDetail',
      expect.objectContaining({ postId: '77' }),
    );
  });
});
