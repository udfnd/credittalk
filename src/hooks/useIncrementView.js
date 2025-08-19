import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * 게시글 상세 페이지가 로드될 때마다 조회수를 1 증가시키는 커스텀 훅.
 * @param {string} tableName - 조회수를 증가시킬 테이블 이름.
 * @param {number | string} postId - 조회수를 증가시킬 게시글의 ID.
 */
export const useIncrementView = (tableName, postId) => {
  useEffect(() => {
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
          console.warn(`[View Count Error] table:${tableName}, post:${postId}`, error.message);
        } else {
          console.log(`조회수 증가 요청: ${tableName}-${postId}`);
        }
      } catch (err) {
        console.warn(`[View Count RPC Error]`, err.message);
      }
    };

    increment();

  }, [tableName, postId]);
};
