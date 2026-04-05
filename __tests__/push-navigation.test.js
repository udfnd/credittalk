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
});
