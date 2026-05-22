-- Migration: Admin comment RPCs
-- Date: 2026-05-20
-- Description: Add or replace add_comment / update_comment / delete_comment
--              plus admin_update_comment / admin_delete_comment so the mobile
--              app's comment options (edit / delete / admin-edit / admin-delete)
--              work consistently across every board.

-- ============================================================
-- Drop any pre-existing variants first.
-- Older deployments may have these functions with a different
-- return type or argument list, in which case CREATE OR REPLACE
-- would fail. Iterate over every public.* variant and drop it.
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
-- add_comment: regular users post a new comment / reply
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
    v_uid uuid;
    v_id  bigint;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF coalesce(btrim(_content), '') = '' THEN
        RAISE EXCEPTION '댓글 내용이 비어 있습니다.';
    END IF;

    -- Optional: validate parent exists and belongs to the same post / board
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
    VALUES (_post_id, _board_type, _content, v_uid, _parent_comment_id)
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
    v_uid    uuid;
    v_author uuid;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    IF coalesce(btrim(p_new_content), '') = '' THEN
        RAISE EXCEPTION '댓글 내용이 비어 있습니다.';
    END IF;

    SELECT user_id INTO v_author
    FROM public.comments
    WHERE id = p_comment_id;

    IF v_author IS NULL THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;

    IF v_author <> v_uid THEN
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
    v_uid    uuid;
    v_author uuid;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    SELECT user_id INTO v_author
    FROM public.comments
    WHERE id = p_comment_id;

    IF v_author IS NULL THEN
        RAISE EXCEPTION '댓글을 찾을 수 없습니다.';
    END IF;

    IF v_author <> v_uid THEN
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
