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

describe('Payload backup on display → restore on data-less tap (삼성 no_target)', () => {
  let push;
  let notifee;

  beforeEach(() => {
    jest.resetModules();
    global.__PUSH_FG_BOUND__ = false;
    // blind restore와 표시 인덱스는 안드로이드 전용(OneUI 소거 대응)
    require('react-native').Platform.OS = 'android';
    push = require('../src/lib/push');
    notifee = require('@notifee/react-native').default;
    notifee.getDisplayedNotifications.mockReset();
    notifee.getDisplayedNotifications.mockResolvedValue([]);
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

  // ── 완전 빈 PRESS(id·data 모두 소거) blind restore ──────────────────────
  // v36 백업 복원(id 기반)은 배포 후 push_tap_logs에서 복원 성공 0건 —
  // OneUI가 PRESS 이벤트의 notification을 id까지 통째로 비워 보내는 것이 실측됨
  // (no_target 전건 keys:[], nid:null, restored:false). id가 없으면 백업 조회가
  // 불가능하므로 쉐이드 관측으로 좁힌다: 탭된 알림은 autoCancel로 방금 쉐이드에서
  // 사라졌으므로 "인덱스에 있고 + 쉐이드에 없고 + 미소비"인 후보가 정확히 1건일
  // 때만 그 payload를 복원한다(_restored='2'). 0건/복수/관측 실패면 포기(홈 유지).
  // PRESS 이벤트 경로에서만 허용(allowBlindRestore).

  async function displayWith(nid, extra) {
    await push.displayOnce(
      {
        messageId: `mid-${nid}`,
        data: { nid, title: 't', body: 'b', ...extra },
      },
      'foreground',
    );
  }

  test('완전 빈 PRESS + 쉐이드에서 사라진 후보 1건 → blind 복원(_restored=2)', async () => {
    await displayWith('bcast_9', { link_url: 'https://youtu.be/xyz' });
    // 탭 직후: autoCancel로 쉐이드가 비어 있음
    notifee.getDisplayedNotifications.mockResolvedValue([]);

    // 실측 시그니처: detail.notification이 통째로 빈 채 도착
    const out = await push.extractTapData({}, { allowBlindRestore: true });

    expect(out.link_url).toBe('https://youtu.be/xyz');
    expect(out._restored).toBe('2');
  });

  test('allowBlindRestore 없이는(초기화 캐시 경로) 빈 탭 그대로 반환', async () => {
    await displayWith('bcast_10', { link_url: 'https://youtu.be/xyz' });
    const out = await push.extractTapData({});
    expect(out).toEqual({});
  });

  test('아직 쉐이드에 표시 중인 알림은 후보에서 제외(라우팅 없는 알림 탭 보호)', async () => {
    // 어제의 링크 브로드캐스트가 탭되지 않은 채 쉐이드에 남아 있는 상황에서
    // 라우팅 없는 알림을 탭(동일한 빈 PRESS 시그니처) → 오이동하면 안 된다
    await displayWith('bcast_link', { link_url: 'https://youtu.be/old' });
    notifee.getDisplayedNotifications.mockResolvedValue([{ id: 'bcast_link' }]);

    const out = await push.extractTapData({}, { allowBlindRestore: true });

    expect(out.link_url).toBeUndefined();
    expect(out._noid).toBe('1');
  });

  test('후보 복수(스와이프로 지운 미탭 알림 혼재) → 복원 포기', async () => {
    await displayWith('older_1', { link_url: 'https://youtu.be/old' });
    await displayWith('newer_2', { link_url: 'https://youtu.be/new' });
    notifee.getDisplayedNotifications.mockResolvedValue([]); // 둘 다 쉐이드에 없음

    const out = await push.extractTapData({}, { allowBlindRestore: true });

    expect(out._restored).toBeUndefined();
    expect(out._noid).toBe('1');
    expect(out._cand).toBe('2');
  });

  test('스와이프 dismiss(removeFromDisplayIndex)된 알림은 후보에서 제거', async () => {
    await displayWith('swiped_link', { link_url: 'https://youtu.be/SWIPED' });
    // DISMISSED 핸들러가 인덱스에서 제거(스와이프는 탭이 아님)
    await push.removeFromDisplayIndex('swiped_link');
    notifee.getDisplayedNotifications.mockResolvedValue([]);

    // 이후 라우팅 없는 알림 탭(빈 PRESS) → 스와이프된 링크로 오이동하면 안 됨
    const out = await push.extractTapData({}, { allowBlindRestore: true });

    expect(out.link_url).toBeUndefined();
    expect(out._cand).toBe('0');
  });

  test('id 소거 DISMISSED: 방금 사라진 후보 1건을 대칭 판별로 인덱스에서 제거', async () => {
    await displayWith('kept_A', { link_url: 'https://youtu.be/A' });
    await displayWith('swiped_B', { link_url: 'https://youtu.be/B' });

    // 사용자가 B를 스와이프(쉐이드에는 A만 남음) — DISMISSED가 id 없이 도착
    notifee.getDisplayedNotifications.mockResolvedValue([{ id: 'kept_A' }]);
    await push.removeFromDisplayIndex(undefined);

    // 이후 A를 실제 탭(빈 PRESS, 쉐이드 빈다) → B는 제거됐으므로 A가 정확히 복원
    notifee.getDisplayedNotifications.mockResolvedValue([]);
    const out = await push.extractTapData({}, { allowBlindRestore: true });
    expect(out.nid).toBe('kept_A');
    expect(out._restored).toBe('2');
  });

  test('쉐이드 관측 실패 → 복원 포기(fail-safe)', async () => {
    await displayWith('bcast_13', { link_url: 'https://youtu.be/xyz' });
    notifee.getDisplayedNotifications.mockRejectedValue(new Error('boom'));

    const out = await push.extractTapData({}, { allowBlindRestore: true });

    expect(out._restored).toBeUndefined();
    expect(out._cand).toBe('-1');
  });

  test('연속 탭: 앞선 탭의 소비 마커 덕에 매번 후보 1건으로 수렴', async () => {
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await displayWith('older_1', { link_url: 'https://youtu.be/old' });
    await displayWith('newer_2', { link_url: 'https://youtu.be/new' });

    // 1번째 탭: newer_2를 탭(쉐이드에는 older_1만 남음) → newer_2 복원
    notifee.getDisplayedNotifications.mockResolvedValue([{ id: 'older_1' }]);
    const first = await push.extractTapData({}, { allowBlindRestore: true });
    expect(first.nid).toBe('newer_2');
    await push.openFromPayloadOnce(jest.fn(), first, 'notifee_queue');

    // 2번째 탭: older_1도 탭(쉐이드 빈다) → newer_2는 소비됐으므로 older_1 복원
    notifee.getDisplayedNotifications.mockResolvedValue([]);
    const second = await push.extractTapData({}, { allowBlindRestore: true });
    expect(second.nid).toBe('older_1');
  });

  test('data에 내용이 있으면(라우팅 필드만 없음) blind 복원하지 않음', async () => {
    await displayWith('bcast_11', { link_url: 'https://youtu.be/xyz' });
    const out = await push.extractTapData(
      { data: { foo: '1' } },
      { allowBlindRestore: true },
    );
    expect(out).toEqual({ foo: '1' });
  });

  test('id가 있으나 백업 없음(라우팅 없는 알림 탭) → blind 복원하지 않음', async () => {
    await displayWith('bcast_12', { link_url: 'https://youtu.be/xyz' });
    const out = await push.extractTapData(
      { id: 'plain-notification', data: {} },
      { allowBlindRestore: true },
    );
    expect(out).toEqual({});
  });

  test('내부 마커(_mid 등)는 네비게이션 params로 새지 않는다', async () => {
    await push.displayOnce(
      {
        messageId: 'mid-guard',
        data: {
          nid: 'comment_9',
          title: '새 댓글',
          body: '댓글',
          screen: 'CommunityPostDetail',
          params: JSON.stringify({ postId: '42' }),
        },
      },
      'foreground',
    );
    const shown = notifee.displayNotification.mock.calls.at(-1)[0];

    const nav = jest.fn();
    const data = await push.extractTapData({ id: shown.id, data: {} });
    await push.openFromPayloadOnce(nav, data, 'notifee_queue');

    const [screen, params] = nav.mock.calls[0];
    expect(screen).toBe('CommunityPostDetail');
    expect(params.postId).toBe('42');
    expect(params._mid).toBeUndefined();
    expect(params._restored).toBeUndefined();
    expect(params._restoredId).toBeUndefined();
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
