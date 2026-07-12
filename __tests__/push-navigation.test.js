/**
 * Push Notification Navigation Tests
 *
 * Verifies that EventDetail screen is properly configured
 * for push notification deep-linking.
 */

const fs = require('fs');
const path = require('path');

describe('Push Notification Navigation - EventDetail', () => {
  let appSource;
  let pushSource;

  beforeAll(() => {
    appSource = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    );
    pushSource = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/push.js'),
      'utf-8',
    );
  });

  describe('PROTECTED_SCREENS (App.tsx)', () => {
    test('EventDetail must be in PROTECTED_SCREENS for auth-gated navigation', () => {
      // Extract the PROTECTED_SCREENS Set declaration
      const match = appSource.match(
        /const PROTECTED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();

      const screenList = match[1];
      expect(screenList).toContain("'EventDetail'");
    });

    test('All detail screens should be in PROTECTED_SCREENS', () => {
      const match = appSource.match(
        /const PROTECTED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      const screenList = match[1];

      // These screens require auth and should be protected
      const requiredScreens = [
        'CommunityPostDetail',
        'HelpDeskDetail',
        'ArrestNewsDetail',
        'ReviewDetail',
        'IncidentPhotoDetail',
        'NewCrimeCaseDetail',
        'NoticeDetail',
        'EventDetail',
      ];

      for (const screen of requiredScreens) {
        expect(screenList).toContain(
          `'${screen}'`,
        );
      }
    });
  });

  describe('ALLOWED_SCREENS (push.js)', () => {
    test('MyReports must be allowed (신고 분석 완료 푸시 타깃)', () => {
      const match = pushSource.match(
        /const ALLOWED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match[1]).toContain("'MyReports'");
      const protectedMatch = appSource.match(
        /const PROTECTED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(protectedMatch[1]).toContain("'MyReports'");
    });

    test('new-post-notification must map events to EventDetail (Home dead-nav 방지)', () => {
      const fn = fs.readFileSync(
        path.resolve(
          __dirname,
          '../supabase/functions/new-post-notification/index.ts',
        ),
        'utf-8',
      );
      expect(fn).toMatch(/events:\s*'EventDetail'/);
      expect(fn).toMatch(/events:\s*'eventId'/);
      // 매핑 없는 테이블이 화이트리스트 밖 'Home'으로 발송되어
      // 탭해도 아무 데도 못 가는 결정론적 dead-nav 금지.
      expect(fn).not.toMatch(/\|\|\s*'Home'/);
    });

    test('EventDetail must be in ALLOWED_SCREENS for push payload routing', () => {
      const match = pushSource.match(
        /const ALLOWED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      expect(match).not.toBeNull();

      const screenList = match[1];
      expect(screenList).toContain("'EventDetail'");
    });
  });

  describe('Screen consistency', () => {
    test('Every ALLOWED_SCREEN in push.js must be in PROTECTED_SCREENS in App.tsx', () => {
      // Extract ALLOWED_SCREENS from push.js
      const allowedMatch = pushSource.match(
        /const ALLOWED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      const allowedScreens = allowedMatch[1]
        .match(/'([^']+)'/g)
        .map(s => s.replace(/'/g, ''));

      // Extract PROTECTED_SCREENS from App.tsx
      const protectedMatch = appSource.match(
        /const PROTECTED_SCREENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
      );
      const protectedScreens = protectedMatch[1]
        .match(/'([^']+)'/g)
        .map(s => s.replace(/'/g, ''));

      // Every push-allowed screen should be auth-protected
      for (const screen of allowedScreens) {
        expect(protectedScreens).toContain(screen);
      }
    });

    test('EventDetail must be registered as a RootStack.Screen in App.tsx', () => {
      expect(appSource).toMatch(
        /RootStack\.Screen[\s\S]*?name="EventDetail"/,
      );
    });
  });

  describe('EventDetail navigation params', () => {
    test('EventDetail route should expect eventId param', () => {
      // Check type definition
      expect(appSource).toMatch(/EventDetail:\s*\{\s*eventId:\s*number/);
    });

    test('push.js openFromPayload should parse JSON params string', () => {
      // Verify the JSON parsing logic exists for params
      expect(pushSource).toMatch(/JSON\.parse\(rest\.params\)/);
    });
  });

  // S24/S25 간헐 미이동 버그: RNFirebase getInitialNotification/onNotificationOpenedApp
  // 누락 시 MainActivity가 캡처한 인텐트 extras로 복구하는 네이티브 폴백이 배선되어
  // 있는지 회귀 방지.
  describe('Native notification-tap fallback (Android S24/S25)', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const read = rel => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

    test('push.js exposes drainNativeNotificationTap using NativeModules.PushIntentModule', () => {
      expect(pushSource).toMatch(/export async function drainNativeNotificationTap/);
      expect(pushSource).toMatch(/NativeModules\.PushIntentModule/);
      expect(pushSource).toMatch(/getInitialNotificationData/);
    });

    test('push.js drains native tap on AppState active (warm-start fallback)', () => {
      const wireMatch = pushSource.match(
        /export async function wireMessageHandlers[\s\S]*?\n}/,
      );
      expect(wireMatch).not.toBeNull();
      expect(wireMatch[0]).toMatch(/drainNativeNotificationTap/);
    });

    test('App.tsx calls drainNativeNotificationTap on cold start', () => {
      expect(appSource).toMatch(/drainNativeNotificationTap\(navigateToMaybeQueue\)/);
    });

    test('PushIntentModule.kt exists and exposes getInitialNotificationData', () => {
      const mod = read(
        'android/app/src/main/java/com/credittalka/PushIntentModule.kt',
      );
      expect(mod).toMatch(/fun getName\(\): String = "PushIntentModule"/);
      expect(mod).toMatch(/fun getInitialNotificationData/);
      expect(mod).toMatch(/MainActivity\.consumePendingPushData/);
    });

    test('PushIntentModule is registered in VoicePhishingPackage', () => {
      const pkg = read(
        'android/app/src/main/java/com/credittalka/VoicePhishingPackage.kt',
      );
      expect(pkg).toMatch(/PushIntentModule\(reactContext\)/);
    });

    test('MainActivity captures push intent on cold and warm start with consume-once + recents guard', () => {
      const act = read(
        'android/app/src/main/java/com/credittalka/MainActivity.kt',
      );
      expect(act).toMatch(/fun capturePushIntent/);
      expect(act).toMatch(/fun consumePendingPushData/);
      // onCreate(cold) + onNewIntent(warm) 모두에서 캡처
      expect(act.match(/capturePushIntent\(intent\)/g)?.length).toBeGreaterThanOrEqual(2);
      // recents 재실행 시 원래 인텐트 재처리 방지 플래그
      expect(act).toMatch(/HANDLED_FLAG/);
    });
  });
});

// 공지(notices) 댓글과 레거시 오타 board_type('review')은 BOARD_TYPE_MAP에 없어
// new-comment-notification이 400으로 끝나 알림 자체가 발송되지 않았다.
describe('new-comment-notification board_type coverage', () => {
  const fnSource = require('fs').readFileSync(
    require('path').resolve(
      __dirname,
      '../supabase/functions/new-comment-notification/index.ts',
    ),
    'utf-8',
  );

  test('maps notices comments to NoticeDetail', () => {
    expect(fnSource).toMatch(/notices:\s*\{/);
    expect(fnSource).toMatch(/'NoticeDetail'/);
    expect(fnSource).toMatch(/noticeId/);
  });

  test('legacy "review" board_type is aliased to reviews mapping', () => {
    expect(fnSource).toMatch(/\breview\b/);
  });

  test('notices mapping must not assume an author column (notices has none)', () => {
    // notices 테이블에는 user_id/uploader_id가 없으므로 작성자 푸시는 건너뛰고
    // 부모 댓글 작성자 + 관리자 알림만 발송해야 한다.
    const noticesBlock = fnSource.match(/notices:\s*\{[\s\S]*?\}/);
    expect(noticesBlock).not.toBeNull();
    expect(noticesBlock[0]).not.toMatch(/postAuthorColumn:\s*'(user_id|uploader_id)'/);
  });
});
