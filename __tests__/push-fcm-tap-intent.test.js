/**
 * FCM 알림 탭 인텐트 회귀 테스트
 *
 * 배경(2026-09-04 실측): send-fcm-v1-push가 android.notification.click_action을
 * 'android.intent.action.MAIN'으로 지정한 뒤(09-02 배포) push_tap_logs에서
 * fcm_opened_app/native_fallback 경로가 전 버전에서 0으로 떨어지고 탭이 전부
 * notifee 빈 PRESS(no_target=홈)로 흘렀다.
 *
 * 원인은 FCM SDK(CommonNotificationBuilder.createTargetIntent) 동작이다.
 *   - click_action 있음 → new Intent(action).setPackage(pkg)  = 카테고리 없는 "암시적" 인텐트
 *   - click_action 없음 → PackageManager.getLaunchIntentForPackage(pkg) = "명시적" 인텐트
 * 두 경우 모두 data payload가 extras로 실리지만, 암시적 인텐트는 startActivity가
 * CATEGORY_DEFAULT를 요구(MATCH_DEFAULT_ONLY)한다. MainActivity의 MAIN 필터에는
 * LAUNCHER만 있어 해석에 실패 → 탭이 앱에 도달하지 못한다.
 */

const fs = require('fs');
const path = require('path');

describe('FCM 알림 탭 인텐트', () => {
  const senderSource = fs.readFileSync(
    path.resolve(__dirname, '../supabase/functions/send-fcm-v1-push/index.ts'),
    'utf-8',
  );
  const manifestSource = fs.readFileSync(
    path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml'),
    'utf-8',
  );

  test('발송 함수는 android.notification.click_action을 지정하지 않는다', () => {
    // 지정하는 순간 FCM이 명시적 런치 인텐트 대신 암시적 인텐트를 만든다.
    // 주석의 설명 문구는 제외하고 실제 코드만 검사한다.
    const code = senderSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/click_action/);
  });

  test('MainActivity MAIN 필터는 CATEGORY_DEFAULT를 포함한다(방어선)', () => {
    // 다른 발송 경로(어드민 웹 등)가 click_action을 다시 넣더라도 인텐트가
    // 해석되도록 하는 2차 방어선. 이것만으로는 부족하고 위 테스트가 1차다.
    const mainFilter = manifestSource.match(
      /<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"[\s\S]*?<\/intent-filter>/,
    );
    expect(mainFilter).not.toBeNull();
    expect(mainFilter[0]).toMatch(/android\.intent\.category\.DEFAULT/);
    expect(mainFilter[0]).toMatch(/android\.intent\.category\.LAUNCHER/);
  });
});
