import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { supabase } from './supabaseClient';

// 푸시 탭 텔레메트리 (public.push_tap_logs)
//
// S24/S25 등 실기기에서 "알림 탭 → 이동" 경로를 원격 진단하기 위해
// 탭 1건당 1행을 적재한다. 어떤 경우에도 네비게이션을 막으면 안 되므로
// 호출부는 await 없이 fire-and-forget으로 쓰고, 실패는 조용히 무시한다.
//
// source: fcm_opened_app | fcm_initial | notifee_initial | notifee_queue |
//         native_fallback | unknown
// outcome: navigate_screen | open_link | no_target | dedup_skip | error

export async function logPushTap({ source, outcome, data = {}, detail }) {
  try {
    const row = {
      device_model: DeviceInfo.getModel(),
      device_brand: DeviceInfo.getBrand(),
      os_version: `${Platform.OS} ${DeviceInfo.getSystemVersion()}`,
      app_version: DeviceInfo.getVersion(),
      source: String(source || 'unknown'),
      outcome: String(outcome || 'unknown'),
      nid: data?.nid ?? null,
      screen: data?.screen ?? null,
      link_url: data?.link_url ?? data?.url ?? null,
      ...(detail ? { detail } : {}),
    };
    const { error } = await supabase.from('push_tap_logs').insert(row);
    if (error) console.warn('[TapLog] insert error:', error.message);
  } catch (e) {
    console.warn('[TapLog] failed:', e?.message || e);
  }
}
