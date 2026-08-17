/**
 * 사용자 차단 회귀 테스트
 *
 * 버그: blocked_users.blocked_user_id(uuid, auth id)와 comments.user_id
 * (bigint, public.users.id)는 타입이 달라, 댓글 필터
 * `blockedIds.includes(c.user_id)`가 어떤 행도 매칭하지 못했다.
 * 차단 insert는 성공("차단 완료" 알림)하지만 댓글이 계속 보이는 증상.
 * 수정: 조인된 users.auth_user_id(uuid) 기준으로 필터한다.
 */

jest.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const { isCommentBlocked } = require('../src/lib/blockUser');

describe('isCommentBlocked (차단 댓글 필터)', () => {
  const AUTH_ID = '5b1f2c3d-0000-4000-8000-000000000001';
  const blockedIds = [AUTH_ID];

  const comment = {
    id: 10,
    user_id: 123, // bigint public.users.id — auth id와 절대 일치하지 않는다
    users: { id: 123, nickname: '악성유저', auth_user_id: AUTH_ID },
  };

  test('차단된 작성자의 댓글은 auth_user_id 기준으로 걸러진다', () => {
    expect(isCommentBlocked(comment, blockedIds)).toBe(true);
  });

  test('버그 재현 가드: bigint user_id로는 매칭되지 않는다(과거 필터의 실패 형태)', () => {
    // 과거 코드: blockedIds.includes(c.user_id) — 항상 false였다
    expect(blockedIds.includes(comment.user_id)).toBe(false);
  });

  test('차단되지 않은 작성자는 통과', () => {
    const other = {
      ...comment,
      users: { ...comment.users, auth_user_id: 'aaaaaaaa-0000-4000-8000-000000000002' },
    };
    expect(isCommentBlocked(other, blockedIds)).toBe(false);
  });

  test('작성자 정보가 없거나(탈퇴) 차단 목록이 비어도 안전', () => {
    expect(isCommentBlocked({ ...comment, users: null }, blockedIds)).toBe(false);
    expect(isCommentBlocked(comment, [])).toBe(false);
    expect(isCommentBlocked(comment, null)).toBe(false);
  });
});
