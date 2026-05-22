-- Migration: Fix ambiguous user_id in get_help_questions_with_status
-- Date: 2026-05-22
-- Description: The RPC declared `user_id` as an OUT column in RETURNS TABLE.
--              Inside the WHERE clause, `user_id = auth.uid()` was ambiguous
--              between the OUT parameter and blocked_users.user_id, raising
--              PL/pgSQL error 42702 ("column reference user_id is ambiguous")
--              and breaking the admin help-desk list page.
--              Qualify the subquery column with the table alias.

CREATE OR REPLACE FUNCTION public.get_help_questions_with_status()
RETURNS TABLE("id" bigint, "user_id" "uuid", "title" "text", "created_at" timestamp with time zone, "case_summary" "text", "is_answered" boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    hq.id,
    hq.user_id,
    hq.title,
    hq.created_at,
    hq.case_summary,
    EXISTS (
        SELECT 1
        FROM public.help_desk_comments hdc
        JOIN public.users u ON hdc.user_id = u.auth_user_id
        WHERE hdc.question_id = hq.id AND u.is_admin = true
    ) AS is_answered
  FROM
    public.help_questions hq
  WHERE hq.user_id NOT IN (
        SELECT bu.blocked_user_id
        FROM public.blocked_users bu
        WHERE bu.user_id = auth.uid()
      );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_help_questions_with_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_help_questions_with_status() TO anon;
GRANT EXECUTE ON FUNCTION public.get_help_questions_with_status() TO service_role;
