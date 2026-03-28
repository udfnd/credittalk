-- Migration: SPEC-ENHANCE-001
-- Date: 2026-03-28
-- Description: Name-based scam search, comment pinning, winner number management

-- ============================================================
-- MODULE 3: Name-Based Scam Search - Update search_reports RPC
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."search_reports"("search_term" "text")
RETURNS TABLE(
  "reports" "jsonb",
  "total_count" integer,
  "weekly_count" integer,
  "monthly_count" integer,
  "three_monthly_count" integer
)
LANGUAGE "plpgsql"
AS $$
DECLARE
  term_raw    text;
  term_lower  text;
  term_digits text;
  is_korean_name boolean;
  all_reports jsonb;
BEGIN
  term_raw    := coalesce(trim(search_term), '');
  term_lower  := lower(term_raw);
  term_digits := regexp_replace(term_raw, '\D', '', 'g');

  -- Detect if search term is a Korean name (2+ Korean characters, no digits)
  is_korean_name := (term_digits = '' AND char_length(term_raw) >= 2
                     AND term_raw ~ '^[가-힣]+$');

  SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO all_reports
  FROM (
    SELECT *
    FROM public.decrypted_scammer_reports dr
    WHERE
      -- Nickname search: changed from exact match to ILIKE partial match
      (term_lower <> '' AND lower(coalesce(dr.nickname, '')) ILIKE '%' || term_lower || '%')
      OR
      -- Phone number search
      (term_digits <> '' AND (
         regexp_replace(coalesce(dr.impersonated_phone_number, ''), '\D', '', 'g') = term_digits
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(dr.phone_numbers) AS phone
           WHERE regexp_replace(phone, '\D', '', 'g') = term_digits
         )
      ))
      OR
      -- Account number search
      (term_digits <> '' AND (
         regexp_replace(coalesce(dr.perpetrator_account, ''), '\D', '', 'g') = term_digits
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(dr.damage_accounts) AS o
           WHERE regexp_replace(coalesce(o->>'accountNumber',''), '\D', '', 'g') = term_digits
         )
      ))
      OR
      -- Name search: search accountHolderName in damage_accounts JSONB
      -- Only for Korean names with 2+ characters (skip digits-only and single char)
      (is_korean_name AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(dr.damage_accounts) AS o
         WHERE coalesce(o->>'accountHolderName', '') ILIKE '%' || term_raw || '%'
      ))
  ) r;

  RETURN QUERY
  SELECT
    all_reports AS reports,
    coalesce(jsonb_array_length(all_reports), 0) AS total_count,
    (SELECT count(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz)
     WHERE x.created_at >= now() - interval '1 week'),
    (SELECT count(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz)
     WHERE x.created_at >= now() - interval '1 month'),
    (SELECT count(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz)
     WHERE x.created_at >= now() - interval '3 months');
END;
$$;

-- ============================================================
-- MODULE 1: Event Comment Pinning - Schema changes
-- ============================================================

ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_pinned ON comments (post_id, board_type, is_pinned DESC, pinned_at ASC);

-- ============================================================
-- MODULE 1: Event Comment Pinning - admin_pin_comment RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_pin_comment(p_comment_id BIGINT, p_pin BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- Admin permission check (matches existing pattern from draw_event_winners)
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'message', '관리자 권한이 필요합니다.');
    END IF;

    -- Verify comment exists
    IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = p_comment_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '댓글을 찾을 수 없습니다.');
    END IF;

    -- Update pin status
    IF p_pin THEN
        UPDATE public.comments
        SET is_pinned = true, pinned_at = NOW()
        WHERE id = p_comment_id;
    ELSE
        UPDATE public.comments
        SET is_pinned = false, pinned_at = NULL
        WHERE id = p_comment_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message',
        CASE WHEN p_pin THEN '댓글이 고정되었습니다.' ELSE '댓글 고정이 해제되었습니다.' END
    );
END;
$$;

-- ============================================================
-- MODULE 2: Winner Number Management - Schema changes
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS winner_numbers INTEGER[] DEFAULT '{}';

-- ============================================================
-- MODULE 2: Update draw_event_winners to save winner_numbers
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."draw_event_winners"("p_event_id" bigint)
RETURNS TABLE("success" boolean, "message" "text", "winner_count" integer, "winner_numbers" integer[])
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
    v_event events%ROWTYPE;
    v_total_entries integer;
    v_winners integer[];
BEGIN
    -- Admin permission check
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RETURN QUERY SELECT false, '관리자 권한이 필요합니다.'::text, 0, NULL::integer[];
        RETURN;
    END IF;

    -- Event lookup
    SELECT * INTO v_event
    FROM public.events e
    WHERE e.id = p_event_id;

    IF v_event IS NULL THEN
        RETURN QUERY SELECT false, '이벤트를 찾을 수 없습니다.'::text, 0, NULL::integer[];
        RETURN;
    END IF;

    -- Check entry count
    SELECT COUNT(*) INTO v_total_entries
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id;

    IF v_total_entries = 0 THEN
        RETURN QUERY SELECT false, '응모자가 없습니다.'::text, 0, NULL::integer[];
        RETURN;
    END IF;

    -- Reset existing winners
    UPDATE public.event_entries
    SET is_winner = false
    WHERE event_id = p_event_id;

    -- Random winner selection
    WITH random_winners AS (
        SELECT ee.id, ee.entry_number
        FROM public.event_entries ee
        WHERE ee.event_id = p_event_id
        ORDER BY random()
        LIMIT LEAST(v_event.winner_count, v_total_entries)
    )
    UPDATE public.event_entries ee
    SET is_winner = true
    FROM random_winners rw
    WHERE ee.id = rw.id;

    -- Get winner numbers
    SELECT ARRAY_AGG(ee.entry_number ORDER BY ee.entry_number) INTO v_winners
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id AND ee.is_winner = true;

    -- Save winner_numbers to events table
    UPDATE public.events
    SET winner_numbers = v_winners
    WHERE id = p_event_id;

    -- Update event status
    UPDATE public.events
    SET status = 'announced', updated_at = now()
    WHERE id = p_event_id;

    RETURN QUERY SELECT true, '당첨자 추첨이 완료되었습니다.'::text, array_length(v_winners, 1), v_winners;
END;
$$;

-- ============================================================
-- MODULE 2: update_winner_numbers RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_winner_numbers(p_event_id BIGINT, p_numbers INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
    v_invalid_numbers INTEGER[];
BEGIN
    -- 1. Admin permission check (matches existing pattern)
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'message', '관리자 권한이 필요합니다.');
    END IF;

    -- Verify event exists
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '이벤트를 찾을 수 없습니다.');
    END IF;

    -- 2. Validate all numbers exist as entry_numbers for this event
    SELECT ARRAY_AGG(n) INTO v_invalid_numbers
    FROM unnest(p_numbers) AS n
    WHERE n NOT IN (
        SELECT entry_number FROM public.event_entries WHERE event_id = p_event_id
    );

    IF v_invalid_numbers IS NOT NULL AND array_length(v_invalid_numbers, 1) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', '유효하지 않은 응모 번호가 포함되어 있습니다.',
            'invalid_numbers', to_jsonb(v_invalid_numbers)
        );
    END IF;

    -- 3. Update events.winner_numbers
    UPDATE public.events
    SET winner_numbers = p_numbers, updated_at = now()
    WHERE id = p_event_id;

    -- 4. Reset all event_entries.is_winner = false for this event
    UPDATE public.event_entries
    SET is_winner = false
    WHERE event_id = p_event_id;

    -- 5. Set is_winner = true for entries matching p_numbers
    UPDATE public.event_entries
    SET is_winner = true
    WHERE event_id = p_event_id AND entry_number = ANY(p_numbers);

    -- 6. Return success JSONB with winner count
    RETURN jsonb_build_object(
        'success', true,
        'message', '당첨 번호가 업데이트되었습니다.',
        'winner_count', array_length(p_numbers, 1)
    );
END;
$$;
