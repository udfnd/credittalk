import { Platform } from 'react-native';

// Google Play In-App Updates
//
// 배경: 전체 출시 100% 후 한 달이 지나도 스토어 자동 업데이트 적용률이 43%에
// 정체 — Wi-Fi/충전/유휴 조건과 자동 업데이트를 꺼둔 사용자 때문에 스토어에만
// 기대면 중요 수정(S24/S25 푸시 버그 등)이 활성 사용자에게 전파되지 않는다.
// 앱 실행 시점에 Play 업데이트를 직접 확인해 설치를 유도/강제한다.
//
// 정책:
// - 우선순위 4+(Play Developer API의 inAppUpdatePriority) 또는 출시 후 7일
//   이상 방치된 업데이트 → IMMEDIATE(전체 화면, 설치 완료까지 진행)
// - 그 외 → FLEXIBLE(백그라운드 다운로드, 완료 시 재시작 설치)
// - Play 미탑재 기기/에뮬레이터/스토어 외 설치본에서는 조용히 no-op.
//
// 라이브러리는 try 안에서 지연 require한다: 네이티브 모듈이 없는 환경에서는
// require 시점에 throw하는데(사전 출시 리포트에서 "NativeModule.RNDeviceInfo
// is null" 크래시로 확인), 업데이트 확인 실패가 앱을 죽여서는 안 된다.

const IMMEDIATE_PRIORITY_THRESHOLD = 4;
const IMMEDIATE_STALENESS_DAYS = 7;

let inFlight = false;

export async function checkForAppUpdate({ allowInDev = false } = {}) {
  if (Platform.OS !== 'android') return;
  if (__DEV__ && !allowInDev) return;
  if (inFlight) return;
  inFlight = true;

  try {
    const {
      default: SpInAppUpdates,
      IAUUpdateKind,
      IAUInstallStatus,
    } = require('sp-react-native-in-app-updates');

    const updater = new SpInAppUpdates(false);
    const result = await updater.checkNeedsUpdate();
    if (!result?.shouldUpdate) return;

    const priority = Number(result?.other?.updatePriority ?? 0);
    const stalenessDays = Number(result?.other?.clientVersionStalenessDays ?? 0);
    const forceImmediate =
      priority >= IMMEDIATE_PRIORITY_THRESHOLD ||
      stalenessDays >= IMMEDIATE_STALENESS_DAYS;

    if (forceImmediate) {
      console.log('[IAU] starting IMMEDIATE update', { priority, stalenessDays });
      await updater.startUpdate({ updateType: IAUUpdateKind.IMMEDIATE });
      return;
    }

    console.log('[IAU] starting FLEXIBLE update', { priority, stalenessDays });
    updater.addStatusUpdateListener(status => {
      if (status?.status === IAUInstallStatus.DOWNLOADED) {
        try {
          updater.installUpdate();
        } catch (e) {
          console.warn('[IAU] installUpdate failed:', e?.message || e);
        }
      }
    });
    await updater.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
  } catch (e) {
    // 라이브러리/네이티브 모듈 부재, Play 서비스 부재, 스토어 외 설치,
    // 사용자 취소 등 — 앱 동작에 영향 금지
    console.warn('[IAU] in-app update check failed:', e?.message || e);
  } finally {
    inFlight = false;
  }
}
