/**
 * 푸시 탭 텔레메트리 (push_tap_logs)
 *
 * 모든 탭 처리의 단일 관문(openFromPayloadOnce/openFromPayload)에서
 * 기기·경로(source)·결과(outcome)를 Supabase에 fire-and-forget 적재.
 * S24/S25 등 실기기에서 탭→이동 실패를 원격으로 진단하기 위함.
 * 로깅은 네비게이션을 절대 막지 않아야 한다.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
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

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getModel: () => 'SM-S928N',
    getBrand: () => 'samsung',
    getSystemVersion: () => '15',
    getVersion: () => '32',
  },
}));

const mockInsert = jest.fn(async () => ({ error: null }));
jest.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({ insert: mockInsert })),
  },
}));

describe('push tap telemetry', () => {
  let push;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.__PUSH_FG_BOUND__ = false;
    push = require('../src/lib/push');
  });

  test('successful screen navigation logs navigate_screen with source & device info', async () => {
    const navigateTo = jest.fn();
    await push.openFromPayloadOnce(
      navigateTo,
      { nid: 'log1', screen: 'NoticeDetail', noticeId: '3' },
      'native_fallback',
    );
    await new Promise(r => setTimeout(r, 0));

    expect(navigateTo).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'native_fallback',
        outcome: 'navigate_screen',
        nid: 'log1',
        screen: 'NoticeDetail',
        device_model: 'SM-S928N',
      }),
    );
  });

  test('dedup-skipped tap logs dedup_skip', async () => {
    const navigateTo = jest.fn();
    const data = { nid: 'log2', screen: 'NoticeDetail', noticeId: '4' };
    await push.openFromPayloadOnce(navigateTo, data, 'fcm_initial');
    await push.openFromPayloadOnce(navigateTo, data, 'notifee_queue');
    await new Promise(r => setTimeout(r, 0));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'dedup_skip', source: 'notifee_queue' }),
    );
  });

  test('payload with no route target logs no_target', async () => {
    await push.openFromPayloadOnce(jest.fn(), { nid: 'log3' }, 'fcm_opened_app');
    await new Promise(r => setTimeout(r, 0));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'no_target', nid: 'log3' }),
    );
  });

  test('logging failure must not block navigation', async () => {
    mockInsert.mockRejectedValueOnce(new Error('db down'));
    const navigateTo = jest.fn();
    await push.openFromPayloadOnce(
      navigateTo,
      { nid: 'log4', screen: 'ReviewDetail', reviewId: '9' },
      'fcm_initial',
    );
    expect(navigateTo).toHaveBeenCalledWith(
      'ReviewDetail',
      expect.objectContaining({ reviewId: '9' }),
    );
  });
});
