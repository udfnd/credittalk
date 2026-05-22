-- Migration: Fix comments user_id type mismatch
-- Date: 2026-05-22
-- Description: The 20260521 admin comment RPC migration assumed
--              public.comments.user_id was UUID, but it is BIGINT
--              (references public.users.id, not auth.users.id directly).
--              Inserts/updates/deletes failed with:
--                "column user_id is of type bigint but expression is of type uuid"
--              and comments could no longer be written from the mobile app.
--              public.help_desk_comments.user_id IS uuid, so its functions
--              remain unchanged.
--
--              This migration:
--                1. Rewrites add_comment / update_comment / delete_comment /
--                   admin_update_comment / admin_delete_comment to translate
--                   auth.uid() (uuid) -> public.users.id (bigint) before
--                   touching public.comments.
--                2. Patches admin_ban_and_purge_user so the cascade delete
--                   on public.comments compares bigint to bigint instead of
--                   uuid to bigint.

-- ============================================================
-- Drop pre-existing variants first (defensive — types changed)
-- ============================================================
DO $cleanup$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'add_comment',
              'update_comment',
              'delete_comment',
              'admin_update_comment',
              'admin_delete_comment'
          )
    ) LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s);',
                       r.nspname, r.proname, r.args);
    END LOOP;
END
$cleanup$;


-- ============================================================
-- add_comment: maps auth.uid() (uuid) -> users.id (bigint)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_comment(
    _post_id bigint,
    _board_type text,
    _content text,
    _parent_comment_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_auth_uid uuid := auth.uid();
    v_user_id  bigint;
    v_id       bigint;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF coalesce(btrim(_content), '') = '' THEN
        RAISE EXCEPTION '댓글 내용이 비어 있습니다.';
    END IF;

    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.auth_user_id = v_auth_uid;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
    END IF;

    IF _parent_comment_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.comments
            WHERE id = _parent_comment_id
              AND post_id = _post_id
              AND board_type = _board_type
        ) THEN
            RAISE EXCEPTION '부모 댓글을 찾을 수 없습니다.';
        END IF;
    END IF;

    INSERT INTO public.comments (post_id, board_type, content, user_id, parent_comment_id)
    VALUES (_post_id, _board_type, _content, v_user_id, _parent_comment_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_comment(bigint, text, text, bigint) TO authenticated;


-- ============================================================
-- update_comment: author edits their own comment
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_comment(
    p_comment_id bigint,
    p_new_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_auth_uid     uuid := auth.uid();
    v_caller_id    bigint;
    v_author_id    bigint;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF coalesce(btrim(p_new_content), '') = '' THEN
        RAISE EXCEPTION '댓글 내용이 비어 있습니다.';
    END IF;

    SELECT u.id INTO v_caller_id
    FROM public.users u
    WHERE u.auth_user_id = v_auth_uid;

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
    END IF;

    SELECT c.user_id INTO v_author_id
    FROM public.comments c
    WHERE c.id = p_comment_id;

    IF v_author_id IS NULL THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;

    IF v_author_id <> v_caller_id THEN
        RAISE EXCEPTION '본인 댓글만 수정할 수 있습니다.';
    END IF;

    UPDATE public.comments
       SET content = p_new_content
     WHERE id = p_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_comment(bigint, text) TO authenticated;


-- ============================================================
-- delete_comment: author deletes their own comment (with replies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_auth_uid  uuid := auth.uid();
    v_caller_id bigint;
    v_author_id bigint;
BEGIN
    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    SELECT u.id INTO v_caller_id
    FROM public.users u
    WHERE u.auth_user_id = v_auth_uid;

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
    END IF;

    SELECT c.user_id INTO v_author_id
    FROM public.comments c
    WHERE c.id = p_comment_id;

    IF v_author_id IS NULL THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;

    IF v_author_id <> v_caller_id THEN
        RAISE EXCEPTION '본인 댓글만 삭제할 수 있습니다.';
    END IF;

    WITH RECURSIVE descendants AS (
        SELECT id FROM public.comments WHERE id = p_comment_id
        UNION
        SELECT c.id FROM public.comments c
        INNER JOIN descendants d ON c.parent_comment_id = d.id
    )
    DELETE FROM public.comments WHERE id IN (SELECT id FROM descendants);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_comment(bigint) TO authenticated;


-- ============================================================
-- admin_update_comment: admin edits any comment
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_comment(
    p_comment_id bigint,
    p_new_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;

    IF coalesce(btrim(p_new_content), '') = '' THEN
        RAISE EXCEPTION '댓글 내용이 비어 있습니다.';
    END IF;

    UPDATE public.comments
       SET content = p_new_content
     WHERE id = p_comment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_comment(bigint, text) TO authenticated;


-- ============================================================
-- admin_delete_comment: admin deletes any comment (with replies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_comment_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.comments WHERE id = p_comment_id) THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;

    WITH RECURSIVE descendants AS (
        SELECT id FROM public.comments WHERE id = p_comment_id
        UNION
        SELECT c.id FROM public.comments c
        INNER JOIN descendants d ON c.parent_comment_id = d.id
    )
    DELETE FROM public.comments WHERE id IN (SELECT id FROM descendants);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_comment(bigint) TO authenticated;


-- ============================================================
-- admin_ban_and_purge_user: patch the public.comments delete to
-- translate UUID -> bigint via the users lookup we already did.
-- The function was originally created in 20260520; we recreate it
-- whole here so the fix is self-contained.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_ban_and_purge_user(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller_uid uuid;
    v_is_admin   boolean;
    v_target_id  bigint;
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

    -- Translate target's auth uid -> public.users.id (bigint)
    -- for tables whose user_id column is bigint.
    SELECT u.id, u.phone_number
      INTO v_target_id, v_phone
    FROM public.users u
    WHERE u.auth_user_id = p_target_user_id;

    -- 1. Block the user
    INSERT INTO public.blocked_users (user_id, blocked_user_id)
    VALUES (v_caller_uid, p_target_user_id)
    ON CONFLICT DO NOTHING;

    -- 2. Delete authored content
    -- public.comments.user_id is BIGINT (FK to public.users.id)
    IF v_target_id IS NOT NULL THEN
        DELETE FROM public.comments WHERE user_id = v_target_id;
        GET DIAGNOSTICS v_comments = ROW_COUNT;
    END IF;

    -- public.help_desk_comments.user_id is UUID (FK to auth.users.id)
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

    -- 3. Ban phone number
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
