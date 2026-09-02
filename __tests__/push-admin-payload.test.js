/**
 * Push Notification Admin Payload Tests
 *
 * Verifies that the admin dashboard constructs correct
 * FCM payloads for EventDetail push notifications.
 */

const fs = require('fs');
const path = require('path');

const ADMIN_ROOT = path.resolve(__dirname, '../../credittalk-admin');

describe('Admin Push Payload - EventDetail', () => {
  let pushPageSource;
  let enqueueRouteSource;
  let canonicalSenderSource;

  beforeAll(() => {
    pushPageSource = fs.readFileSync(
      path.resolve(ADMIN_ROOT, 'src/app/admin/push/page.tsx'),
      'utf-8',
    );
    enqueueRouteSource = fs.readFileSync(
      path.resolve(ADMIN_ROOT, 'src/app/api/push/enqueue/route.ts'),
      'utf-8',
    );
    canonicalSenderSource = fs.readFileSync(
      path.resolve(__dirname, '../supabase/functions/send-fcm-v1-push/index.ts'),
      'utf-8',
    );
  });

  describe('Push page payload construction', () => {
    test('should set screen to EventDetail when event is selected', () => {
      expect(pushPageSource).toMatch(
        /dataPayload\.screen\s*=\s*'EventDetail'/,
      );
    });

    test('should include eventId in params as JSON string', () => {
      expect(pushPageSource).toMatch(
        /dataPayload\.params\s*=\s*JSON\.stringify\(\{\s*eventId:/,
      );
    });

    test('should convert selectedEventId to Number', () => {
      expect(pushPageSource).toMatch(
        /eventId:\s*Number\(selectedEventId\)/,
      );
    });
  });

  describe('Enqueue route and canonical FCM sender', () => {
    test('should normalize data payload values to strings for FCM', () => {
      // FCM data payload must be Record<string, string>
      expect(canonicalSenderSource).toMatch(
        /function normalizeDataPayload/,
      );
      // Verify it converts non-string values
      expect(canonicalSenderSource).toMatch(
        /typeof raw === 'string' \? raw : JSON\.stringify\(raw\)/,
      );
    });

    test('should spread custom data into FCM data payload', () => {
      // buildMessage should include ...data spread
      expect(enqueueRouteSource).toMatch(/\.\.\.data/);
    });

    test('should pass the job-stable merged data field to sendWithRetry', () => {
      expect(enqueueRouteSource).toMatch(
        /data:\s*mergedData/,
      );
    });

    test('should create one stable nid per push job', () => {
      expect(enqueueRouteSource).toMatch(
        /nid:\s*suppliedNid\s*\?\?\s*`push_\$\{crypto\.randomUUID\(\)\}`/,
      );
      expect(canonicalSenderSource).toMatch(/tag:\s*nid/);
      // FCM은 앱별 collapse key를 최대 4개만 보관하므로 매 알림 고유 키를
      // transport collapse_key로 쓰면 정상 알림이 퇴출될 수 있다.
      expect(canonicalSenderSource).not.toMatch(/collapse_key\s*:/);
    });

    test('should use the explicit Android push click action', () => {
      expect(canonicalSenderSource).toMatch(
        /click_action:\s*ANDROID_CLICK_ACTION/,
      );
    });

    test('should surface remaining transient token failures to the durable worker', () => {
      expect(canonicalSenderSource).toMatch(/retryable_failed:\s*retryableFailed/);
      expect(canonicalSenderSource).toMatch(
        /if \(retryableFailed > 0\) return json\(result, 503\)/,
      );
    });

    test('should reject malformed or excessive targeted audiences before enqueue', () => {
      expect(enqueueRouteSource).toMatch(/MAX_EXPLICIT_TARGETS\s*=\s*1000/);
      expect(enqueueRouteSource).toMatch(/targetUserIds\.some\(id => !UUID_PATTERN\.test\(id\)\)/);
    });
  });
});
