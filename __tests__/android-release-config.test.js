/**
 * Play 정책 관련 릴리스 빌드 설정 회귀 테스트
 *
 * 2026-09-04 Play Console 경고 2건:
 *  1) 앱 최적화 기준 미달 — 난독화 2%(기준 25%). 공개 상태·게시에 영향 가능.
 *     → 릴리스 빌드에서 R8(minifyEnabled)을 켠다.
 *  2) 2026-08-31부터 targetSdk 36 미만은 업데이트 불가.
 *     → targetSdkVersion을 36 이상으로 유지한다.
 *
 * 둘 다 설정 한 줄이라 조용히 되돌아가기 쉬워 테스트로 고정한다.
 */

const fs = require('fs');
const path = require('path');

const appGradle = fs.readFileSync(
  path.resolve(__dirname, '../android/app/build.gradle'),
  'utf-8',
);
const rootGradle = fs.readFileSync(
  path.resolve(__dirname, '../android/build.gradle'),
  'utf-8',
);
const proguard = fs.readFileSync(
  path.resolve(__dirname, '../android/app/proguard-rules.pro'),
  'utf-8',
);

describe('Android 릴리스 빌드 설정', () => {
  test('릴리스 빌드에서 R8 난독화가 켜져 있다', () => {
    expect(appGradle).toMatch(/def enableProguardInReleaseBuilds = true/);
    expect(appGradle).toMatch(/minifyEnabled enableProguardInReleaseBuilds/);
  });

  test('targetSdk가 36 이상이다', () => {
    const match = rootGradle.match(/targetSdkVersion\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(36);
  });

  test('푸시 네이티브 코드는 R8에서 보존된다', () => {
    // 알림 표시·탭 라우팅 경로가 축소되면 푸시가 통째로 죽는다.
    expect(proguard).toMatch(/-keep class com\.credittalka\.\*\* \{ \*; \}/);
  });

  test('리플렉션/직렬화 SDK 규칙이 있다(Kakao·Naver·Gson)', () => {
    expect(proguard).toMatch(/com\.kakao\.sdk/);
    expect(proguard).toMatch(/com\.navercorp\.nid/);
    expect(proguard).toMatch(/SerializedName/);
  });

  test('크래시 역난독화를 위해 줄번호를 보존한다', () => {
    expect(proguard).toMatch(/-keepattributes SourceFile,LineNumberTable/);
  });
});
