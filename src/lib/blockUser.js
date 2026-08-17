import { supabase } from './supabaseClient';

/**
 * 사용자 차단 처리.
 *
 * 관리자(isAdmin=true)는 admin_ban_and_purge_user RPC를 호출해
 *   - blocked_users 등록
 *   - 대상 사용자가 작성한 모든 글/댓글 일괄 삭제
 *   - 전화번호 banned_phones 등록
 * 까지 서버에서 한 번에 처리한다.
 *
 * 일반 사용자는 blocked_users 테이블에 본인 차단만 등록한다.
 *
 * @param {object} params
 * @param {string} params.callerUserId   차단을 수행하는 사용자(auth user id)
 * @param {string} params.targetUserId   차단 대상(auth user id)
 * @param {boolean} params.isAdmin       차단 수행자가 관리자인지 여부
 * @returns {Promise<{ adminPurged: boolean, phoneBanned: boolean, deleted: object | null }>}
 */
export async function blockUser({ callerUserId, targetUserId, isAdmin }) {
  if (!callerUserId) {
    throw new Error('로그인이 필요합니다.');
  }
  if (!targetUserId) {
    throw new Error('대상 사용자가 없습니다.');
  }
  if (callerUserId === targetUserId) {
    throw new Error('본인을 차단할 수 없습니다.');
  }

  if (isAdmin) {
    const { data, error } = await supabase.rpc('admin_ban_and_purge_user', {
      p_target_user_id: targetUserId,
    });
    if (error) throw error;

    return {
      adminPurged: true,
      phoneBanned: data?.phone_banned === true,
      deleted: data?.deleted ?? null,
    };
  }

  const { error } = await supabase.from('blocked_users').insert({
    user_id: callerUserId,
    blocked_user_id: targetUserId,
  });
  // 중복(이미 차단) 에러는 정상으로 간주
  if (error && error.code !== '23505') {
    throw error;
  }

  return { adminPurged: false, phoneBanned: false, deleted: null };
}

/**
 * 댓글 작성자가 차단 목록에 있는지 판정.
 *
 * blocked_users.blocked_user_id(= get_my_blocked_user_ids 반환)는 auth uuid이고
 * comments.user_id는 public.users.id(bigint)라 서로 비교하면 절대 매칭되지
 * 않는다(실제로 이 비교를 쓰던 필터가 아무 댓글도 걸러내지 못했음).
 * 반드시 조인된 users.auth_user_id(uuid) 기준으로 비교한다.
 */
export function isCommentBlocked(comment, blockedIds) {
  if (!Array.isArray(blockedIds) || blockedIds.length === 0) return false;
  const authorAuthId = comment?.users?.auth_user_id;
  return !!authorAuthId && blockedIds.includes(authorAuthId);
}

/**
 * 차단 결과를 사용자에게 보여줄 메시지 문자열.
 */
export function buildBlockSuccessMessage({ adminPurged, phoneBanned }) {
  if (adminPurged) {
    return phoneBanned
      ? '사용자가 차단되었으며, 작성한 모든 게시물·댓글이 삭제되고 해당 전화번호의 재가입이 차단되었습니다.'
      : '사용자가 차단되었으며, 작성한 모든 게시물·댓글이 삭제되었습니다.';
  }
  return '사용자가 성공적으로 차단되었습니다. 차단된 사용자의 모든 게시물과 댓글이 즉시 숨겨집니다.';
}
