-- Migration: Admin ban + purge user
-- Date: 2026-05-20
-- Description: When an admin blocks a user we want every trace of that user
--              removed (no "탈퇴한 사용자" leftovers). This RPC:
--                1. Verifies caller is admin.
--                2. Records the block in blocked_users.
--                3. Deletes every post / comment authored by the target across
--                   community_posts, reviews, incident_photos, new_crime_cases,
--                   arrest_news, help_questions, comments, help_desk_comments.
--                4. Adds the target's phone number to banned_phones so they
--                   cannot re-register (mirrors admin-ban-phone Edge function).
--              scammer_reports is intentionally preserved.

CREATE OR REPLACE FUNCTION public.admin_ban_and_purge_user(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller_uid uuid;
    v_is_admin   boolean;
    v_phone      text;
    v_community  int := 0;
    v_reviews    int := 0;
    v_incident   int := 0;
    v_crime      int := 0;
    v_arrest     int := 0;
    v_help_q     int := 0;
    v_comments   int := 0;
    v_help_c     int := 0;
    v_phone_ban  boolean := false;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION '대상 사용자 ID가 필요합니다.';
    END IF;

    IF p_target_user_id = v_caller_uid THEN
        RAISE EXCEPTION '본인을 차단할 수 없습니다.';
    END IF;

    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = v_caller_uid;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;

    -- 1. Block the user (skip if already blocked by this admin)
    INSERT INTO public.blocked_users (user_id, blocked_user_id)
    VALUES (v_caller_uid, p_target_user_id)
    ON CONFLICT DO NOTHING;

    -- 2. Delete authored content (cascade order: comments / replies first)
    DELETE FROM public.comments WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_comments = ROW_COUNT;

    DELETE FROM public.help_desk_comments WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_help_c = ROW_COUNT;

    DELETE FROM public.community_posts WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_community = ROW_COUNT;

    DELETE FROM public.reviews WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_reviews = ROW_COUNT;

    DELETE FROM public.incident_photos WHERE uploader_id = p_target_user_id;
    GET DIAGNOSTICS v_incident = ROW_COUNT;

    DELETE FROM public.new_crime_cases WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_crime = ROW_COUNT;

    DELETE FROM public.arrest_news WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_arrest = ROW_COUNT;

    DELETE FROM public.help_questions WHERE user_id = p_target_user_id;
    GET DIAGNOSTICS v_help_q = ROW_COUNT;

    -- 3. Ban phone number (mirrors admin-ban-phone Edge function)
    SELECT phone_number INTO v_phone
    FROM public.users
    WHERE auth_user_id = p_target_user_id;

    IF v_phone IS NOT NULL AND length(btrim(v_phone)) > 0 THEN
        INSERT INTO public.banned_phones (phone_number, banned_by, banned_user_id)
        VALUES (v_phone, v_caller_uid, p_target_user_id)
        ON CONFLICT DO NOTHING;
        v_phone_ban := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'phone_banned', v_phone_ban,
        'deleted', jsonb_build_object(
            'community_posts', v_community,
            'reviews', v_reviews,
            'incident_photos', v_incident,
            'new_crime_cases', v_crime,
            'arrest_news', v_arrest,
            'help_questions', v_help_q,
            'comments', v_comments,
            'help_desk_comments', v_help_c
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ban_and_purge_user(uuid) TO authenticated;
