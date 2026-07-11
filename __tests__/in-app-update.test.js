/**
 * Google Play In-App Updates 도입 테스트
 *
 * 배경: 전체 출시 100% 후 한 달이 지나도 업데이트 적용률이 43%에 정체 —
 * 스토어 자동 업데이트만으로는 중요 수정(S24/S25 푸시 버그 등)이 활성
 * 사용자에게 전파되지 않음. 앱 실행 시 Play In-App Update로 직접 유도한다.
 *
 * 정책: 우선순위 4+ 또는 7일 이상 방치된 업데이트는 IMMEDIATE(전체 화면 강제),
 * 그 외는 FLEXIBLE(백그라운드 다운로드 후 재시작 설치).
 */

const mockStartUpdate = jest.fn(async () => {});
const mockInstallUpdate = jest.fn(() => {});
const mockCheckNeedsUpdate = jest.fn();
let statusListener = null;

jest.mock('sp-react-native-in-app-updates', () => {
  class SpInAppUpdates {
    checkNeedsUpdate(...args) {
      return mockCheckNeedsUpdate(...args);
    }
    startUpdate(...args) {
      return mockStartUpdate(...args);
    }
    installUpdate(...args) {
      return mockInstallUpdate(...args);
    }
    addStatusUpdateListener(fn) {
      statusListener = fn;
    }
    removeStatusUpdateListener() {
      statusListener = null;
    }
  }
  return {
    __esModule: true,
    default: SpInAppUpdates,
    IAUUpdateKind: { FLEXIBLE: 0, IMMEDIATE: 1 },
    IAUInstallStatus: { DOWNLOADED: 11 },
  };
});

const fs = require('fs');
const path = require('path');

describe('In-App Update policy (src/lib/inAppUpdate.js)', () => {
  let checkForAppUpdate;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    statusListener = null;
    const { Platform } = require('react-native');
    Platform.OS = 'android';
    ({ checkForAppUpdate } = require('../src/lib/inAppUpdate'));
  });

  test('no update available → does not start any update flow', async () => {
    mockCheckNeedsUpdate.mockResolvedValue({ shouldUpdate: false });
    await checkForAppUpdate({ allowInDev: true });
    expect(mockStartUpdate).not.toHaveBeenCalled();
  });

  test('high-priority update → IMMEDIATE (full-screen forced) flow', async () => {
    mockCheckNeedsUpdate.mockResolvedValue({
      shouldUpdate: true,
      other: { updatePriority: 5, clientVersionStalenessDays: 1 },
    });
    await checkForAppUpdate({ allowInDev: true });
    expect(mockStartUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updateType: 1 }),
    );
  });

  test('stale update (7+ days) → IMMEDIATE flow', async () => {
    mockCheckNeedsUpdate.mockResolvedValue({
      shouldUpdate: true,
      other: { updatePriority: 0, clientVersionStalenessDays: 10 },
    });
    await checkForAppUpdate({ allowInDev: true });
    expect(mockStartUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updateType: 1 }),
    );
  });

  test('normal update → FLEXIBLE flow, installs after download completes', async () => {
    mockCheckNeedsUpdate.mockResolvedValue({
      shouldUpdate: true,
      other: { updatePriority: 0, clientVersionStalenessDays: 0 },
    });
    await checkForAppUpdate({ allowInDev: true });
    expect(mockStartUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updateType: 0 }),
    );
    // FLEXIBLE 다운로드 완료 → 설치 트리거
    expect(typeof statusListener).toBe('function');
    statusListener({ status: 11 });
    expect(mockInstallUpdate).toHaveBeenCalled();
  });

  test('iOS → no-op (Google Play 전용)', async () => {
    const { Platform } = require('react-native');
    Platform.OS = 'ios';
    mockCheckNeedsUpdate.mockResolvedValue({ shouldUpdate: true });
    await checkForAppUpdate({ allowInDev: true });
    expect(mockStartUpdate).not.toHaveBeenCalled();
  });

  test('check failure is swallowed (Play 미탑재 기기 등에서 크래시 금지)', async () => {
    mockCheckNeedsUpdate.mockRejectedValue(new Error('Play unavailable'));
    await expect(
      checkForAppUpdate({ allowInDev: true }),
    ).resolves.toBeUndefined();
    expect(mockStartUpdate).not.toHaveBeenCalled();
  });
});

describe('App wiring', () => {
  test('App.tsx triggers checkForAppUpdate on startup', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    );
    expect(appSource).toMatch(/checkForAppUpdate\(/);
    expect(appSource).toMatch(
      /from '\.\/src\/lib\/inAppUpdate'/,
    );
  });
});
