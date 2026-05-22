ALTER TABLE public.blocked_users
  DROP CONSTRAINT IF EXISTS blocked_users_blocked_user_id_fkey;


CREATE OR REPLACE FUNCTION public.get_my_blocked_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(array_agg(blocked_user_id), ARRAY[]::uuid[])
  FROM public.blocked_users
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_blocked_user_ids() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_arrest_news_with_comment_info()
RETURNS TABLE("id" bigint, "title" "text", "created_at" timestamp with time zone, "author_name" "text", "image_urls" "text"[], "views" bigint, "is_pinned" boolean, "is_published" boolean, "comment_count" bigint, "has_new_comment" boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        an.id,
        an.title,
        an.created_at,
        an.author_name,
        an.image_urls,
        an.views,
        an.is_pinned,
        an.is_published,
        COALESCE(c.comment_count, 0) as comment_count,
        EXISTS (
            SELECT 1
            FROM comments
            WHERE comments.post_id = an.id
              AND comments.board_type = 'arrest_news'
              AND comments.created_at > now() - interval '24 hours'
        ) as has_new_comment
    FROM
        arrest_news an
    LEFT JOIN (
        SELECT
            post_id,
            count(*) as comment_count
        FROM
            comments
        WHERE
            comments.board_type = 'arrest_news'
        GROUP BY
            post_id
    ) c ON an.id = c.post_id
    WHERE an.is_published = true
      AND an.user_id NOT IN (
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      )
    ORDER BY
        an.is_pinned DESC,
        an.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_community_posts_with_comment_info()
RETURNS TABLE("id" bigint, "title" "text", "created_at" timestamp with time zone, "author_auth_id" "uuid", "views" bigint, "author_name" "text", "image_urls" "text"[], "is_pinned" boolean, "comment_count" bigint, "has_new_comment" boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        cp.id,
        cp.title,
        cp.created_at,
        cp.user_id as author_auth_id,
        cp.views,
        u.nickname as author_name,
        cp.image_urls,
        cp.is_pinned,
        COALESCE(c.comment_count, 0) as comment_count,
        EXISTS (
            SELECT 1
            FROM comments
            WHERE comments.post_id = cp.id
              AND comments.board_type = 'community_posts'
              AND comments.created_at > now() - interval '24 hours'
        ) as has_new_comment
    FROM
        community_posts cp
    LEFT JOIN
        users u ON cp.user_id = u.auth_user_id
    LEFT JOIN (
        SELECT
            post_id,
            count(*) as comment_count
        FROM
            comments
        WHERE
            comments.board_type = 'community_posts'
        GROUP BY
            post_id
    ) c ON cp.id = c.post_id
    WHERE cp.user_id NOT IN (
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      )
    ORDER BY
        cp.is_pinned DESC,
        cp.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_help_questions_with_status()
RETURNS TABLE("id" bigint, "user_id" "uuid", "title" "text", "created_at" timestamp with time zone, "case_summary" "text", "is_answered" boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_incident_photos_with_comment_info()
RETURNS TABLE("id" bigint, "title" "text", "created_at" timestamp with time zone, "image_urls" "text"[], "category" "text", "description" "text", "is_pinned" boolean, "views" bigint, "is_published" boolean, "comment_count" bigint, "has_new_comment" boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ip.id,
        ip.title,
        ip.created_at,
        ip.image_urls,
        ip.category,
        ip.description,
        ip.is_pinned,
        ip.views,
        ip.is_published,
        COALESCE(c.comment_count, 0) as comment_count,
        EXISTS (
            SELECT 1
            FROM comments
            WHERE comments.post_id = ip.id
              AND comments.board_type = 'incident_photos'
              AND comments.created_at > now() - interval '24 hours'
        ) as has_new_comment
    FROM
        incident_photos ip
    LEFT JOIN (
        SELECT
            post_id,
            count(*) as comment_count
        FROM
            comments
        WHERE
            comments.board_type = 'incident_photos'
        GROUP BY
            post_id
    ) c ON ip.id = c.post_id
    WHERE ip.is_published = true
      AND ip.uploader_id NOT IN (
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      )
    ORDER BY
        ip.is_pinned DESC,
        ip.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_new_crime_cases_with_comment_info()
RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "title" "text", "image_urls" "text"[], "category" "text", "views" bigint, "is_pinned" boolean, "is_published" boolean, "comment_count" bigint, "has_new_comment" boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ncc.id,
        ncc.created_at,
        ncc.title,
        ncc.image_urls,
        ncc.category,
        ncc.views,
        ncc.is_pinned,
        ncc.is_published,
        COALESCE(c.comment_count, 0) as comment_count,
        EXISTS (
            SELECT 1
            FROM comments
            WHERE comments.post_id = ncc.id
              AND comments.board_type = 'new_crime_cases'
              AND comments.created_at > now() - interval '24 hours'
        ) as has_new_comment
    FROM
        new_crime_cases ncc
    LEFT JOIN (
        SELECT
            post_id,
            count(*) as comment_count
        FROM
            comments
        WHERE
            comments.board_type = 'new_crime_cases'
        GROUP BY
            post_id
    ) c ON ncc.id = c.post_id
    WHERE ncc.is_published = true
      AND ncc.user_id NOT IN (
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      )
    ORDER BY
        ncc.is_pinned DESC,
        ncc.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_reviews_with_comment_info()
RETURNS TABLE("id" bigint, "title" "text", "created_at" timestamp with time zone, "author_auth_id" "uuid", "rating" smallint, "author_name" "text", "views" bigint, "is_published" boolean, "is_pinned" boolean, "comment_count" bigint, "has_new_comment" boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.title,
        r.created_at,
        r.user_id as author_auth_id,
        r.rating,
        u.nickname as author_name,
        r.views,
        r.is_published,
        r.is_pinned,
        COALESCE(c.comment_count, 0) as comment_count,
        EXISTS (
            SELECT 1
            FROM comments
            WHERE comments.post_id = r.id
              AND comments.board_type = 'reviews'
              AND comments.created_at > now() - interval '24 hours'
        ) as has_new_comment
    FROM
        reviews r
    LEFT JOIN
        users u ON r.user_id = u.auth_user_id
    LEFT JOIN (
        SELECT
            post_id,
            count(*) as comment_count
        FROM
            comments
        WHERE
            comments.board_type = 'reviews'
        GROUP BY
            post_id
    ) c ON r.id = c.post_id
    WHERE r.is_published = true
      AND r.user_id NOT IN (
        SELECT blocked_user_id FROM public.blocked_users WHERE user_id = auth.uid()
      )
    ORDER BY
        r.is_pinned DESC,
        r.created_at DESC;
END;
$$;
