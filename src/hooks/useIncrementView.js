// src/hooks/useIncrementView.js
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * 게시글 상세 페이지가 로드될 때 조회수를 1 증가시키는 커스텀 훅
 * @param {string} tableName - 조회수를 증가시킬 테이블 이름
 * @param {number | string} postId - 조회수를 증가시킬 게시글의 ID
 */
export const useIncrementView = (tableName, postId) => {
  useEffect(() => {
    // tableName이나 postId가 유효하지 않으면 함수를 실행하지 않음
    if (!tableName || !postId) {
      return;
    }

    const increment = async () => {
      try {
        const { error } = await supabase.rpc('increment_view_count', {
          table_name_param: tableName,
          post_id_param: postId,
        });

        if (error) {
          // 에러를 콘솔에만 기록하여 사용자 경험을 해치지 않음
          console.warn(`[View Count Error] table:${tableName}, post:${postId}`, error.message);
        }
      } catch (err) {
        console.warn(`[View Count RPC Error]`, err.message);
      }
    };

    // 화면이 마운트될 때 한 번만 실행
    increment();

  }, [tableName, postId]); // postId가 변경될 때만 다시 실행되도록 설정
};
