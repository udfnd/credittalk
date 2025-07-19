import { NativeModules } from 'react-native';
import { supabase } from '../lib/supabaseClient'; // supabase 클라이언트 경로 확인 필요

const { CallDetectionModule } = NativeModules;

/**
 * Supabase에서 사기꾼 리포트(전화번호)를 가져와
 * 네이티브 모듈의 블랙리스트를 업데이트합니다.
 */
export const syncBlacklist = async () => {
  console.log('Start syncing blacklist...');
  try {
    // 'scammer_reports' 테이블에서 전화번호가 있는 모든 리포트를 가져옵니다.
    // 한 번에 너무 많은 데이터를 가져오지 않도록 limit을 설정하는 것이 좋습니다.
    const { data, error } = await supabase
      .from('scammer_reports')
      .select('phone_number, damage_type, reported_nickname')
      .not('phone_number', 'is', null)
      .limit(1000); // 필요에 따라 개수 조정

    if (error) {
      throw error;
    }

    if (data) {
      // 네이티브 모듈이 원하는 형식으로 데이터를 가공합니다.
      const blacklist = data.map(item => ({
        phoneNumber: item.phone_number,
        scamType: item.damage_type || 'N/A',
        nickname: item.reported_nickname || 'N/A',
      }));

      // JSON 문자열로 변환하여 네이티브 모듈에 전달합니다.
      await CallDetectionModule.updateBlacklist(JSON.stringify(blacklist));
      console.log('Blacklist synced successfully:', `${blacklist.length} numbers loaded.`);
    }
  } catch (err) {
    console.error('Failed to sync blacklist:', err);
  }
};
