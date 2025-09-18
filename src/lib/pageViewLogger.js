// src/lib/pageViewLogger.js
import { supabase } from './supabaseClient';

/**
 * 사용자의 페이지 방문 기록을 Supabase에 저장합니다.
 * @param {string | null} userId - 방문한 사용자의 ID (로그인하지 않은 경우 null)
 * @param {string} pagePath - 방문한 페이지 경로 (예: 'HomeScreen', 'NoticeDetailScreen')
 */
export const logPageView = async (userId, pagePath) => {
  if (!pagePath) {
    console.error('logPageView: pagePath is required.');
    return;
  }

  try {
    // page_views 테이블에 데이터를 삽입합니다.
    const { error } = await supabase.from('page_views').insert({
      user_id: userId,
      page_path: pagePath,
      // ip_address는 데이터베이스 정책에 따라 서버에서 자동으로 처리될 수 있습니다.
    });

    if (error) {
      // Supabase 에러를 콘솔에 기록합니다.
      console.error('Error logging page view to Supabase:', error);
    }
  } catch (e) {
    // 네트워크 오류 등 예기치 못한 에러를 처리합니다.
    console.error('An unexpected error occurred in logPageView:', e);
  }
};
