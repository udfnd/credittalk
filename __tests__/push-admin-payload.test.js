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

  beforeAll(() => {
    pushPageSource = fs.readFileSync(
      path.resolve(ADMIN_ROOT, 'src/app/admin/push/page.tsx'),
      'utf-8',
    );
    enqueueRouteSource = fs.readFileSync(
      path.resolve(ADMIN_ROOT, 'src/app/api/push/enqueue/route.ts'),
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

  describe('Enqueue route FCM message', () => {
    test('should normalize data payload values to strings for FCM', () => {
      // FCM data payload must be Record<string, string>
      expect(enqueueRouteSource).toMatch(
        /function normalizeDataPayload/,
      );
      // Verify it converts non-string values
      expect(enqueueRouteSource).toMatch(
        /typeof v === 'string' \? v : JSON\.stringify\(v\)/,
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
      expect(enqueueRouteSource).toMatch(/collapse_key:\s*dataPayload\.nid/);
      expect(enqueueRouteSource).toMatch(/tag:\s*dataPayload\.nid/);
    });

    test('should use the explicit Android push click action', () => {
      expect(enqueueRouteSource).toMatch(
        /click_action:\s*ANDROID_CLICK_ACTION/,
      );
    });
  });
});
