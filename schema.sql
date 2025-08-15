

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."search_result_with_stats" AS (
	"reports" "jsonb",
	"total_count" integer,
	"weekly_count" integer,
	"monthly_count" integer,
	"three_monthly_count" integer
);


ALTER TYPE "public"."search_result_with_stats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  _key_id UUID;
  _decrypted_value BYTEA;
  _encryption_key_name TEXT := 'ENCRYPTION_KEY';
BEGIN
  -- 데이터가 NULL이면 NULL 반환
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- 키 ID 조회
  BEGIN
    SELECT id INTO _key_id
    FROM pgsodium.valid_key
    WHERE name = _encryption_key_name;

    IF _key_id IS NULL THEN
      RAISE EXCEPTION 'Secret key named "%" not found in Supabase Vault.', _encryption_key_name;
    END IF;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      RAISE EXCEPTION 'pgsodium.valid_key table/columns not found.';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to retrieve key ID for "%": %', _encryption_key_name, SQLERRM;
  END;

  -- 복호화 시도
  BEGIN
    -- positional argument 방식으로 함수 호출
    _decrypted_value := pgsodium.crypto_aead_det_decrypt(
      encrypted_data,                 -- 암호화된 데이터
      convert_to('scammer-report', 'utf8'),  -- context (bytea로 변환)
      _key_id,                        -- 키 ID
      NULL                            -- nonce (NULL로 설정하면 자동 nonce 사용)
    );
  EXCEPTION
    WHEN invalid_parameter_value OR data_exception THEN
      RAISE WARNING 'Decryption failed. Possible key/context mismatch or corrupted data. %', SQLERRM;
      RETURN '[DECRYPTION FAILED]';  -- 복호화 실패 시 반환값
    WHEN undefined_function THEN
      RAISE EXCEPTION 'pgsodium.crypto_aead_det_decrypt function not found.';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Decryption failed during pgsodium operation: %', SQLERRM;
  END;

  -- UTF-8로 변환
  BEGIN
    RETURN convert_from(_decrypted_value, 'UTF8');
  EXCEPTION
    WHEN character_not_in_repertoire OR untranslatable_character THEN
      RAISE WARNING 'Failed to convert decrypted bytes to UTF8 text.';
      RETURN '[INVALID UTF8 DATA]';  -- UTF-8 변환 실패 시 반환값
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed during UTF8 conversion: %', SQLERRM;
  END;

END;$$;


ALTER FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrypt_secret_array"("encrypted_array" "bytea"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  decrypted_array text[];
  item bytea;
BEGIN
  IF encrypted_array IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH item IN ARRAY encrypted_array
  LOOP
    decrypted_array := array_append(decrypted_array, decrypt_secret(item));
  END LOOP;
  RETURN decrypted_array;
END;
$$;


ALTER FUNCTION "public"."decrypt_secret_array"("encrypted_array" "bytea"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."encrypt_secret"("data" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _key_id UUID;
  _secret_value BYTEA;
BEGIN
  -- Vault 키 ID 조회
  SELECT id
    INTO _key_id
    FROM pgsodium.valid_key
   WHERE name = 'ENCRYPTION_KEY';

  IF _key_id IS NULL THEN
    RAISE EXCEPTION 'Vault key "ENCRYPTION_KEY" not found.';
  END IF;

  IF data IS NULL THEN
    RETURN NULL;
  END IF;

  -- ✂ 여기서 named-parameter 대신 positional call ✂
  _secret_value := pgsodium.crypto_aead_det_encrypt(
    pg_catalog.convert_to(data,           'utf8'),  -- 평문 (bytea)
    pg_catalog.convert_to('scammer-report','utf8'),  -- AAD (bytea)
    _key_id,                                         -- 키 ID (uuid)
    NULL                                             -- nonce(NULL이면 내부 결정적 nonce 사용)
  );

  RETURN _secret_value;

EXCEPTION
  WHEN undefined_object THEN
    RAISE EXCEPTION 'pgsodium extension or tables missing.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Encryption failed: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."encrypt_secret"("data" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_email_by_profile"("p_name" "text", "p_phone_number" "text") RETURNS TABLE("email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT u_auth.email
  FROM public.users u_profile
  JOIN auth.users u_auth ON u_profile.auth_user_id = u_auth.id
  WHERE u_profile.name = p_name AND u_profile.phone_number = p_phone_number;
END;
$$;


ALTER FUNCTION "public"."find_email_by_profile"("p_name" "text", "p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") RETURNS TABLE("room_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT crp1.room_id
  FROM public.chat_room_participants crp1
  JOIN public.chat_room_participants crp2 ON crp1.room_id = crp2.room_id
  LEFT JOIN public.chat_rooms cr ON crp1.room_id = cr.id -- chat_rooms 테이블 조인
  WHERE
    crp1.user_id = user1_id AND crp2.user_id = user2_id
    AND ( -- 해당 채팅방의 참여자가 정확히 2명인지 확인
      SELECT COUNT(*)
      FROM public.chat_room_participants crp_count
      WHERE crp_count.room_id = crp1.room_id
    ) = 2
    AND cr.name IS NULL; -- 1:1 채팅방은 보통 이름이 없음 (그룹채팅과 구분)
END;
$$;


ALTER FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."scammer_reports" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone_numbers" "bytea"[],
    "category" "text" NOT NULL,
    "description" "text",
    "ip_address" "inet",
    "company_type" "text",
    "scam_report_source" "text",
    "nickname" "text",
    "victim_circumstances" "text",
    "traded_item_category" "text",
    "perpetrator_identified" boolean,
    "analysis_result" "text",
    "analysis_message" "text",
    "analyzed_at" timestamp with time zone,
    "analyzer_id" "uuid",
    "gender" "text",
    "reporter_id" "uuid",
    "attempted_fraud" boolean,
    "damage_path" "text",
    "damaged_item" "text",
    "impersonated_person" "text",
    "nickname_evidence_url" "text",
    "illegal_collection_evidence_urls" "text"[],
    "site_name" "text",
    "traded_item_image_urls" "text"[],
    "impersonated_phone_number" "bytea",
    "detailed_crime_type" "text",
    "damage_amount" integer,
    "no_damage_amount" boolean,
    "damage_accounts" "jsonb",
    "is_face_to_face" boolean,
    "perpetrator_id" "text",
    "perpetrator_account" "text",
    "crypto_transfer_amount" numeric,
    CONSTRAINT "scammer_reports_company_type_check" CHECK (("company_type" = ANY (ARRAY['사업자'::"text", '개인'::"text"]))),
    CONSTRAINT "scammer_reports_gender_check" CHECK (("gender" = ANY (ARRAY['남성'::"text", '여성'::"text", '모름'::"text"])))
);

ALTER TABLE ONLY "public"."scammer_reports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."scammer_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."scammer_reports" IS '사기꾼 신고 정보 (민감 정보 암호화 및 RLS 적용)';



COMMENT ON COLUMN "public"."scammer_reports"."phone_numbers" IS '신고 대상 연락처 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."analysis_result" IS '관리자 분석 결과';



COMMENT ON COLUMN "public"."scammer_reports"."analysis_message" IS '관리자 분석 상세 메시지';



COMMENT ON COLUMN "public"."scammer_reports"."analyzed_at" IS '분석 완료 시간';



COMMENT ON COLUMN "public"."scammer_reports"."analyzer_id" IS '분석 수행 관리자 ID';



COMMENT ON COLUMN "public"."scammer_reports"."reporter_id" IS '신고를 작성한 사용자의 ID (auth.users.id)';



COMMENT ON COLUMN "public"."scammer_reports"."traded_item_image_urls" IS '거래물품 증빙 사진 URL 목록';



COMMENT ON COLUMN "public"."scammer_reports"."impersonated_phone_number" IS '사칭된 연락처 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."detailed_crime_type" IS '세부 피해 종류';



COMMENT ON COLUMN "public"."scammer_reports"."damage_amount" IS '피해 금액';



CREATE OR REPLACE FUNCTION "public"."get_allowed_scammer_reports_for_user"() RETURNS SETOF "public"."scammer_reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_job_type text;
  current_role_is_admin boolean;
BEGIN
  -- 현재 역할이 관리자 역할인지 확인 (예: 'postgres' 또는 'service_role')
  -- Supabase Studio에서 테이블을 조회하는 역할에 따라 이 부분을 조정해야 할 수 있습니다.
  -- current_setting('role') 또는 session_user 등을 사용할 수 있습니다.
  -- 좀 더 확실한 방법은 Supabase 프로젝트 설정에서 관리자 역할을 특정하고, 해당 역할인지 확인하는 것입니다.
  -- 여기서는 session_user가 'postgres'이거나 'service_role'인 경우 관리자로 간주하는 예시입니다.
  current_role_is_admin := (session_user IN ('postgres', 'service_role')); -- 실제 사용하는 관리자 역할로 변경

  IF current_role_is_admin THEN
    -- 관리자 역할이면 모든 scammer_reports 반환
    RETURN QUERY SELECT sr.* FROM public.scammer_reports sr;
  ELSE
    -- 일반 사용자인 경우, 기존 RLS 로직 적용
    SELECT job_type INTO user_job_type
    FROM public.users
    WHERE auth_user_id = auth.uid();

    RETURN QUERY
    SELECT sr.*
    FROM public.scammer_reports sr
    WHERE
      (auth.role() = 'authenticated'::text) AND -- 앱 사용자는 항상 authenticated 역할일 것으로 가정
      (
        ( (user_job_type = '대부업 종사자'::text) AND (sr.category = '불법 사채'::text) ) OR
        ( (user_job_type = '자영업 종사자'::text) AND (sr.category = ANY (ARRAY['알바 사기'::text, '노쇼'::text])) ) OR
        (
          ((user_job_type = '일반'::text) OR (user_job_type IS NULL)) AND
          (sr.category <> ALL (ARRAY['불법 사채'::text, '알바 사기'::text, '노쇼'::text]))
        )
      );
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_allowed_scammer_reports_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bank_account_stats"() RETURNS TABLE("bank_name" "text", "report_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH bank_names AS (
        SELECT
            public.decrypt_secret((account ->> 'bankName')::bytea) as decrypted_bank_name
        FROM
            public.scammer_reports,
            jsonb_array_elements(damage_accounts) AS account
        WHERE
            damage_accounts IS NOT NULL
            AND (account ->> 'isCashTransaction')::boolean = false
    )
    SELECT
        decrypted_bank_name,
        COUNT(*) AS report_count
    FROM bank_names
    WHERE decrypted_bank_name IS NOT NULL AND decrypted_bank_name != '[DECRYPTION FAILED]'
    GROUP BY decrypted_bank_name
    ORDER BY report_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_bank_account_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_crime_summary_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
    category_counts jsonb;
    monthly_trends jsonb;
    damage_distribution jsonb;
    total_reports BIGINT;
BEGIN
    -- 1. 전체 신고 건수
    SELECT count(*) INTO total_reports FROM public.scammer_reports;

    -- 2. 카테고리별 신고 건수
    SELECT jsonb_object_agg(category, count)
    INTO category_counts
    FROM (
        SELECT category, COUNT(*) as count
        FROM public.scammer_reports
        GROUP BY category
    ) AS a;

    -- 3. 최근 12개월 월별 신고 추이
    SELECT jsonb_object_agg(month, count)
    INTO monthly_trends
    FROM (
        SELECT
            to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COUNT(*) AS count
        FROM public.scammer_reports
        WHERE created_at >= date_trunc('month', now()) - interval '11 months'
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
    ) AS b;

    -- 4. 피해 금액 분포
    SELECT jsonb_object_agg(range, count)
    INTO damage_distribution
    FROM (
        SELECT
            CASE
                WHEN damage_amount IS NULL OR no_damage_amount = true THEN '피해액 없음'
                WHEN damage_amount BETWEEN 1 AND 100000 THEN '10만원 이하'
                WHEN damage_amount BETWEEN 100001 AND 1000000 THEN '10만원-100만원'
                WHEN damage_amount BETWEEN 1000001 AND 10000000 THEN '100만원-1000만원'
                ELSE '1000만원 초과'
            END AS range,
            COUNT(*) AS count
        FROM public.scammer_reports
        GROUP BY range
    ) AS c;

    -- 최종 결과 JSON으로 조합
    result := jsonb_build_object(
        'totalReports', total_reports,
        'categoryCounts', category_counts,
        'monthlyTrends', monthly_trends,
        'damageDistribution', damage_distribution
    );

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_crime_summary_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_id"() RETURNS bigint
    LANGUAGE "sql" STABLE
    AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_current_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result RECORD;
BEGIN
  -- !!! 중요: 여기에 호출자가 관리자인지 확인하는 로직 필수 !!!
  -- 예: IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: Admin privileges required.'; END IF;

  SELECT
    r.id, 
    r.reporter_id, -- `user_id` 대신 `reporter_id`가 올바른 컬럼명인 것 같습니다. 스키마를 확인하세요.
    r.created_at,
    decrypt_secret(r.name) AS name,
    decrypt_secret(r.phone_numbers) AS phone_numbers,
    decrypt_secret(r.account_number) AS account_number,
    r.category, 
    r.description, 
    r.ip_address
  INTO result
  FROM public.scammer_reports r
  WHERE r.id = report_id_input;

  RETURN row_to_json(result);
END;
$$;


ALTER FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_phone_number_stats"() RETURNS TABLE("phone_number" "text", "report_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH decrypted_numbers AS (
        SELECT public.decrypt_secret(unnest(sr.phone_numbers)) AS phone
        FROM public.scammer_reports sr
        WHERE sr.phone_numbers IS NOT NULL
    )
    SELECT
        phone,
        COUNT(*) AS report_count
    FROM decrypted_numbers
    WHERE phone IS NOT NULL AND phone != '[DECRYPTION FAILED]'
    GROUP BY phone
    ORDER BY report_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_phone_number_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_question_ids"("p_question_ids" "uuid"[]) RETURNS TABLE("question_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT source_help_question_id
    FROM public.new_crime_cases
    WHERE source_help_question_id = ANY(p_question_ids);
END;
$$;


ALTER FUNCTION "public"."get_public_question_ids"("p_question_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_job_type"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  job_type_result text;
BEGIN
  SELECT job_type INTO job_type_result
  FROM public.users
  WHERE auth_user_id = auth.uid(); -- auth.uid()를 사용하여 현재 사용자의 ID를 가져옴
  RETURN job_type_result;
END;
$$;


ALTER FUNCTION "public"."get_user_job_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_login"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- users 테이블의 마지막 로그인 시간 업데이트
    UPDATE public.users
    SET last_login_at = NOW()
    WHERE auth_user_id = NEW.id;

    -- user_login_logs 테이블에 로그인 기록 추가
    INSERT INTO public.user_login_logs (user_id, user_name, user_email, ip_address)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email, inet_client_addr());

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_new_crime_case_view"("case_id_input" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.new_crime_cases
  -- 'views' 컬럼의 값을 기존 값에서 1 더한 값으로 설정합니다.
  -- 만약 views가 null이면, 0으로 취급하고 1을 더합니다.
  SET views = COALESCE(views, 0) + 1
  -- 함수로 전달받은 ID와 일치하는 사례를 찾습니다.
  WHERE id = case_id_input;
END;
$$;


ALTER FUNCTION "public"."increment_new_crime_case_view"("case_id_input" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_post_view"("post_id_input" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.community_posts
  -- 👇👇👇 [핵심] 이 'view_count'를 당신의 실제 조회수 컬럼 이름으로 바꾸세요! 👇👇👇
  SET views = COALESCE(views, 0) + 1
  -- 👆👆👆 [핵심] 예를 들어, 컬럼 이름이 'views'라면 SET views = COALESCE(views, 0) + 1 로 수정 👆👆👆
  WHERE id = post_id_input;
END;
$$;


ALTER FUNCTION "public"."increment_post_view"("post_id_input" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_user_id = user_uuid AND is_admin = TRUE
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  is_admin_result boolean;
BEGIN
  -- 현재 인증된 사용자의 auth.uid()를 사용하여 users 테이블에서 is_admin 값을 찾습니다.
  SELECT u.is_admin INTO is_admin_result
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  -- 결과가 NULL이면 false를 반환하고, 그렇지 않으면 is_admin 값을 반환합니다.
  RETURN COALESCE(is_admin_result, false);
END;
$$;


ALTER FUNCTION "public"."is_current_user_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mask_damage_accounts"("damage_accounts_json" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF damage_accounts_json IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN (
        SELECT jsonb_agg(
            CASE
                WHEN (elem->>'isCashTransaction')::boolean THEN elem
                ELSE jsonb_build_object(
                    'bankName', elem->>'bankName',
                    'isCashTransaction', elem->'isCashTransaction',
                    'accountHolderName', public.mask_name(elem->>'accountHolderName'),
                    'accountNumber', public.mask_string(elem->>'accountNumber', 3, 3, '***')
                )
            END
        )
        FROM jsonb_array_elements(damage_accounts_json) AS elem
    );
END;
$$;


ALTER FUNCTION "public"."mask_damage_accounts"("damage_accounts_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mask_name"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF p_name IS NULL THEN
        RETURN NULL;
    END IF;

    IF length(p_name) > 2 THEN
        RETURN left(p_name, 1) || repeat('*', length(p_name) - 2) || right(p_name, 1);
    ELSIF length(p_name) = 2 THEN
        RETURN left(p_name, 1) || '*';
    ELSE
        RETURN p_name;
    END IF;
END;
$$;


ALTER FUNCTION "public"."mask_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mask_phone_number"("p_phone_number" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF p_phone_number IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN regexp_replace(p_phone_number, '(\d{3})-?(\d{1,4})-?(\d{4})', '\1-****-\3');
END;
$$;


ALTER FUNCTION "public"."mask_phone_number"("p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mask_string"("p_string" "text", "p_start_visible" integer, "p_end_visible" integer, "p_mask_char" "text" DEFAULT '*'::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    v_length integer;
    v_masked_part text;
BEGIN
    IF p_string IS NULL THEN
        RETURN NULL;
    END IF;

    v_length := length(p_string);
    IF v_length <= p_start_visible + p_end_visible THEN
        RETURN p_string; -- 마스킹할 부분이 없으면 원본 반환
    END IF;
    
    v_masked_part := repeat(p_mask_char, v_length - p_start_visible - p_end_visible);

    RETURN left(p_string, p_start_visible) || v_masked_part || right(p_string, p_end_visible);
END;
$$;


ALTER FUNCTION "public"."mask_string"("p_string" "text", "p_start_visible" integer, "p_end_visible" integer, "p_mask_char" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_reports"("search_term" "text") RETURNS SETOF "public"."search_result_with_stats"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    search_pattern TEXT;
    all_reports JSONB;
BEGIN
    search_pattern := '%' || search_term || '%';
    
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO all_reports
    FROM (
        SELECT *
        FROM public.decrypted_scammer_reports dr
        WHERE
            dr.impersonated_phone_number ILIKE search_pattern OR
            dr.nickname ILIKE search_pattern OR
            dr.description ILIKE search_pattern OR
            dr.perpetrator_account ILIKE search_pattern OR
            dr.perpetrator_id ILIKE search_pattern OR
            EXISTS (SELECT 1 FROM jsonb_array_elements_text(dr.phone_numbers) AS phone WHERE phone ILIKE search_pattern) OR
            EXISTS (SELECT 1 FROM jsonb_array_elements(dr.damage_accounts) AS o WHERE o->>'accountHolderName' ILIKE search_pattern OR o->>'accountNumber' ILIKE search_pattern OR o->>'bankName' ILIKE search_pattern)
    ) r;

    -- [핵심 수정 부분] COUNT(*)의 결과를 ::int로 형 변환하여 타입 불일치 문제를 해결합니다.
    RETURN QUERY
    SELECT
        all_reports AS reports,
        COALESCE(jsonb_array_length(all_reports), 0) AS total_count,
        (SELECT COUNT(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz) WHERE x.created_at >= now() - interval '1 week') AS weekly_count,
        (SELECT COUNT(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz) WHERE x.created_at >= now() - interval '1 month') AS monthly_count,
        (SELECT COUNT(*)::int FROM jsonb_to_recordset(all_reports) AS x(created_at timestamptz) WHERE x.created_at >= now() - interval '3 months') AS three_monthly_count;
END;
$$;


ALTER FUNCTION "public"."search_reports"("search_term" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_room_last_message_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.chat_rooms
  SET last_message_at = NEW.created_at
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_room_last_message_at"() OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."decrypted_scammer_reports" AS
 SELECT "r"."id",
    "r"."created_at",
    "r"."category",
    "r"."description",
    "r"."ip_address",
    "r"."company_type",
    "r"."scam_report_source",
    "r"."nickname",
    "r"."perpetrator_account",
    "r"."perpetrator_id",
    "r"."victim_circumstances",
    "r"."traded_item_category",
    "r"."perpetrator_identified",
    "r"."analysis_result",
    "r"."analysis_message",
    "r"."analyzed_at",
    "r"."analyzer_id",
    "r"."gender",
    "r"."reporter_id",
    "r"."attempted_fraud",
    "r"."damage_path",
    "r"."damaged_item",
    "r"."impersonated_person",
    "r"."nickname_evidence_url",
    "r"."illegal_collection_evidence_urls",
    "r"."site_name",
    "r"."traded_item_image_urls",
    "public"."decrypt_secret"("r"."impersonated_phone_number") AS "impersonated_phone_number",
    "r"."detailed_crime_type",
    "r"."damage_amount",
    "r"."no_damage_amount",
    ( SELECT "jsonb_agg"("public"."decrypt_secret"("pn"."pn")) AS "jsonb_agg"
           FROM "unnest"("r"."phone_numbers") "pn"("pn")) AS "phone_numbers",
    ( SELECT "jsonb_agg"(
                CASE
                    WHEN (("elem"."value" ->> 'is_other_method'::"text"))::boolean THEN "elem"."value"
                    ELSE "jsonb_build_object"('bankName', ("elem"."value" ->> 'bankName'::"text"), 'is_other_method', ("elem"."value" -> 'is_other_method'::"text"), 'other_method_details', ("elem"."value" ->> 'other_method_details'::"text"), 'accountHolderName', "public"."decrypt_secret"((("elem"."value" ->> 'accountHolderName'::"text"))::"bytea"), 'accountNumber', "public"."decrypt_secret"((("elem"."value" ->> 'accountNumber'::"text"))::"bytea"))
                END) AS "jsonb_agg"
           FROM "jsonb_array_elements"("r"."damage_accounts") "elem"("value")) AS "damage_accounts"
   FROM "public"."scammer_reports" "r";


ALTER TABLE "public"."decrypted_scammer_reports" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_scammer_reports_view" AS
 SELECT "decrypted_scammer_reports"."id",
    "decrypted_scammer_reports"."created_at",
    "decrypted_scammer_reports"."category",
    "decrypted_scammer_reports"."description",
    "decrypted_scammer_reports"."ip_address",
    "decrypted_scammer_reports"."company_type",
    "decrypted_scammer_reports"."scam_report_source",
    "decrypted_scammer_reports"."nickname",
    "decrypted_scammer_reports"."perpetrator_account",
    "decrypted_scammer_reports"."perpetrator_id",
    "decrypted_scammer_reports"."victim_circumstances",
    "decrypted_scammer_reports"."traded_item_category",
    "decrypted_scammer_reports"."perpetrator_identified",
    "decrypted_scammer_reports"."analysis_result",
    "decrypted_scammer_reports"."analysis_message",
    "decrypted_scammer_reports"."analyzed_at",
    "decrypted_scammer_reports"."analyzer_id",
    "decrypted_scammer_reports"."gender",
    "decrypted_scammer_reports"."reporter_id",
    "decrypted_scammer_reports"."attempted_fraud",
    "decrypted_scammer_reports"."damage_path",
    "decrypted_scammer_reports"."damaged_item",
    "decrypted_scammer_reports"."impersonated_person",
    "decrypted_scammer_reports"."nickname_evidence_url",
    "decrypted_scammer_reports"."illegal_collection_evidence_urls",
    "decrypted_scammer_reports"."site_name",
    "decrypted_scammer_reports"."traded_item_image_urls",
    "decrypted_scammer_reports"."impersonated_phone_number",
    "decrypted_scammer_reports"."detailed_crime_type",
    "decrypted_scammer_reports"."damage_amount",
    "decrypted_scammer_reports"."no_damage_amount",
    "decrypted_scammer_reports"."phone_numbers",
    "decrypted_scammer_reports"."damage_accounts"
   FROM "public"."decrypted_scammer_reports";


ALTER TABLE "public"."admin_scammer_reports_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arrest_news" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "author_name" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "link_url" "text",
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "image_urls" "text"[],
    "category" "text"
);


ALTER TABLE "public"."arrest_news" OWNER TO "postgres";


COMMENT ON TABLE "public"."arrest_news" IS '검거소식 게시물';



COMMENT ON COLUMN "public"."arrest_news"."title" IS '게시물 제목';



COMMENT ON COLUMN "public"."arrest_news"."content" IS '게시물 본문';



COMMENT ON COLUMN "public"."arrest_news"."author_name" IS '작성자 (관리자)';



COMMENT ON COLUMN "public"."arrest_news"."is_published" IS '게시 여부';



ALTER TABLE "public"."arrest_news" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."arrest_news_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."audio_analysis_results" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "transcribed_text" "text",
    "detected_keywords" "text"[],
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audio_analysis_results" OWNER TO "postgres";


ALTER TABLE "public"."audio_analysis_results" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."audio_analysis_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" bigint NOT NULL,
    "room_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_read" boolean DEFAULT false
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS '각 채팅방의 메시지를 저장합니다.';



COMMENT ON COLUMN "public"."chat_messages"."sender_id" IS '메시지를 보낸 사용자의 ID (auth.users.id 참조)';



COMMENT ON COLUMN "public"."chat_messages"."content" IS '메시지 내용';



ALTER TABLE "public"."chat_messages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."chat_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "phone_number" "text",
    "job_type" "text" NOT NULL,
    "auth_user_id" "uuid",
    "is_admin" boolean DEFAULT false,
    "naver_id" "text",
    "nickname" "text",
    "sign_up_source" "text",
    "last_login_at" timestamp with time zone,
    "is_dormant" boolean DEFAULT false,
    "last_seen_at" timestamp with time zone,
    CONSTRAINT "nickname_length_check" CHECK ((("char_length"("nickname") >= 2) AND ("char_length"("nickname") <= 20))),
    CONSTRAINT "users_job_type_check" CHECK (("job_type" = ANY (ARRAY['일반'::"text", '사업자'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."last_seen_at" IS '사용자의 마지막 활동 시간';



CREATE OR REPLACE VIEW "public"."chat_messages_with_sender_profile" AS
 SELECT "cm"."id",
    "cm"."room_id",
    "cm"."sender_id",
    "cm"."content",
    "cm"."created_at",
    "cm"."is_read",
    "u"."name" AS "sender_name",
    "u"."id" AS "sender_profile_id"
   FROM ("public"."chat_messages" "cm"
     LEFT JOIN "public"."users" "u" ON (("cm"."sender_id" = "u"."auth_user_id")));


ALTER TABLE "public"."chat_messages_with_sender_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_room_participants" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_room_participants" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_room_participants" IS '사용자와 채팅방의 참여 관계를 정의합니다.';



ALTER TABLE "public"."chat_room_participants" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."chat_room_participants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."chat_room_participants_with_profile" AS
 SELECT "crp"."id",
    "crp"."room_id",
    "crp"."user_id" AS "author_auth_id",
    "crp"."created_at" AS "participant_created_at",
    "crp"."joined_at",
    "u"."id" AS "user_profile_id",
    "u"."name" AS "user_name",
    "u"."job_type" AS "user_job_type"
   FROM ("public"."chat_room_participants" "crp"
     LEFT JOIN "public"."users" "u" ON (("crp"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."chat_room_participants_with_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text"
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_rooms" IS '채팅방 정보를 저장합니다.';



COMMENT ON COLUMN "public"."chat_rooms"."last_message_at" IS '채팅방의 마지막 메시지 수신/발신 시간입니다.';



CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "board_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_comment_id" bigint,
    "user_id" bigint,
    CONSTRAINT "content_length_check" CHECK (("char_length"("content") > 0))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


ALTER TABLE "public"."comments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "user_id" "uuid" NOT NULL,
    "category" "text",
    "views" bigint DEFAULT 0,
    "image_urls" "text"[],
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "link_url" "text"
);


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


ALTER TABLE "public"."community_posts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."community_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."community_posts_with_author_profile" AS
 SELECT "p"."id",
    "p"."created_at",
    "p"."updated_at",
    "p"."title",
    "p"."content",
    "p"."category",
    "p"."views",
    "p"."is_pinned",
    "p"."pinned_at",
    "p"."image_urls",
    "p"."link_url",
    "u"."name" AS "author_name",
    "p"."user_id" AS "author_auth_id"
   FROM ("public"."community_posts" "p"
     JOIN "public"."users" "u" ON (("p"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."community_posts_with_author_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."help_answers" (
    "id" bigint NOT NULL,
    "question_id" bigint NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."help_answers" OWNER TO "postgres";


COMMENT ON TABLE "public"."help_answers" IS '헬프 데스크 답변';



ALTER TABLE "public"."help_answers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."help_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."help_questions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_answered" boolean DEFAULT false NOT NULL,
    "user_name" "text",
    "user_phone" "text",
    "conversation_reason" "text",
    "opponent_account" "text",
    "opponent_phone" "text",
    "opponent_sns" "text",
    "case_summary" "text"
);


ALTER TABLE "public"."help_questions" OWNER TO "postgres";


COMMENT ON TABLE "public"."help_questions" IS '헬프 데스크 질문';



COMMENT ON COLUMN "public"."help_questions"."is_answered" IS '관리자 답변 여부';



COMMENT ON COLUMN "public"."help_questions"."user_name" IS '작성자 이름';



COMMENT ON COLUMN "public"."help_questions"."user_phone" IS '작성자 전화번호';



COMMENT ON COLUMN "public"."help_questions"."conversation_reason" IS '상대방과 대화 계기';



COMMENT ON COLUMN "public"."help_questions"."opponent_account" IS '상대방 계좌';



COMMENT ON COLUMN "public"."help_questions"."opponent_phone" IS '상대방 전화번호';



COMMENT ON COLUMN "public"."help_questions"."opponent_sns" IS '상대방 SNS 닉네임';



COMMENT ON COLUMN "public"."help_questions"."case_summary" IS '사건 개요';



ALTER TABLE "public"."help_questions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."help_questions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."help_questions_with_author" AS
 SELECT "hq"."id",
    "hq"."user_id",
    "hq"."title",
    "hq"."content",
    "hq"."created_at",
    "hq"."is_answered",
    "u"."name" AS "author_name"
   FROM ("public"."help_questions" "hq"
     LEFT JOIN "public"."users" "u" ON (("hq"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."help_questions_with_author" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_photos" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "uploader_id" "uuid",
    "is_published" boolean DEFAULT true,
    "link_url" "text",
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "image_urls" "text"[]
);


ALTER TABLE "public"."incident_photos" OWNER TO "postgres";


ALTER TABLE "public"."incident_photos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."incident_photos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."incident_photos_with_author_profile" AS
 SELECT "p"."id",
    "p"."created_at",
    "p"."title",
    "p"."description",
    "p"."category",
    "p"."image_urls",
    "p"."link_url",
    "p"."is_published",
    "p"."is_pinned",
    "p"."pinned_at",
    "p"."uploader_id",
    "u"."name" AS "author_name"
   FROM ("public"."incident_photos" "p"
     LEFT JOIN "public"."users" "u" ON (("p"."uploader_id" = "u"."auth_user_id")));


ALTER TABLE "public"."incident_photos_with_author_profile" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."masked_scammer_reports" AS
 SELECT "decrypted_scammer_reports"."id",
    "decrypted_scammer_reports"."created_at",
    "decrypted_scammer_reports"."category",
    "decrypted_scammer_reports"."description",
    "decrypted_scammer_reports"."ip_address",
    "decrypted_scammer_reports"."company_type",
    "decrypted_scammer_reports"."scam_report_source",
    "decrypted_scammer_reports"."nickname",
    "decrypted_scammer_reports"."perpetrator_account",
    "decrypted_scammer_reports"."perpetrator_id",
    "decrypted_scammer_reports"."victim_circumstances",
    "decrypted_scammer_reports"."traded_item_category",
    "decrypted_scammer_reports"."perpetrator_identified",
    "decrypted_scammer_reports"."analysis_result",
    "decrypted_scammer_reports"."analysis_message",
    "decrypted_scammer_reports"."analyzed_at",
    "decrypted_scammer_reports"."analyzer_id",
    "decrypted_scammer_reports"."gender",
    "decrypted_scammer_reports"."reporter_id",
    "decrypted_scammer_reports"."attempted_fraud",
    "decrypted_scammer_reports"."damage_path",
    "decrypted_scammer_reports"."damaged_item",
    "decrypted_scammer_reports"."impersonated_person",
    "decrypted_scammer_reports"."nickname_evidence_url",
    "decrypted_scammer_reports"."illegal_collection_evidence_urls",
    "decrypted_scammer_reports"."site_name",
    "decrypted_scammer_reports"."traded_item_image_urls",
    "decrypted_scammer_reports"."impersonated_phone_number",
    "decrypted_scammer_reports"."detailed_crime_type",
    "decrypted_scammer_reports"."damage_amount",
    "decrypted_scammer_reports"."no_damage_amount",
    "decrypted_scammer_reports"."phone_numbers",
    "decrypted_scammer_reports"."damage_accounts"
   FROM "public"."decrypted_scammer_reports";


ALTER TABLE "public"."masked_scammer_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."new_crime_cases" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "method" "text" NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "views" bigint DEFAULT 0,
    "image_urls" "text"[],
    "source_help_question_id" integer,
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "title" "text" NOT NULL,
    "link_url" "text",
    "category" "text"
);


ALTER TABLE "public"."new_crime_cases" OWNER TO "postgres";


COMMENT ON TABLE "public"."new_crime_cases" IS '신종 범죄 수법 사례';



COMMENT ON COLUMN "public"."new_crime_cases"."method" IS '범죄 수법에 대한 텍스트 설명';



COMMENT ON COLUMN "public"."new_crime_cases"."is_published" IS '게시 여부 (관리자용)';



COMMENT ON COLUMN "public"."new_crime_cases"."views" IS '조회수';



ALTER TABLE "public"."new_crime_cases" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."new_crime_cases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notices" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "author_name" "text",
    "is_published" boolean DEFAULT true,
    "views" bigint DEFAULT 0,
    "link_url" "text",
    "image_urls" "text"[],
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "category" "text"
);


ALTER TABLE "public"."notices" OWNER TO "postgres";


ALTER TABLE "public"."notices" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."page_views" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "page_path" "text" NOT NULL,
    "ip_address" "inet"
);


ALTER TABLE "public"."page_views" OWNER TO "postgres";


COMMENT ON TABLE "public"."page_views" IS '페이지별 방문 기록';



ALTER TABLE "public"."page_views" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."page_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."phone_verifications" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "hashed_otp" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."phone_verifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."phone_verifications" IS '휴대폰 번호 인증을 위한 OTP 코드 저장 테이블';



COMMENT ON COLUMN "public"."phone_verifications"."hashed_otp" IS '보안을 위해 해시된 OTP 값';



COMMENT ON COLUMN "public"."phone_verifications"."expires_at" IS 'OTP 만료 시간 (예: 5분 후)';



COMMENT ON COLUMN "public"."phone_verifications"."used_at" IS 'OTP 사용 완료 시간 (재사용 방지용)';



ALTER TABLE "public"."phone_verifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."phone_verifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "user_id" "uuid" NOT NULL,
    "rating" smallint,
    "is_published" boolean DEFAULT true,
    "is_pinned" boolean DEFAULT false,
    "pinned_at" timestamp with time zone,
    "image_urls" "text"[],
    "category" "text",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


ALTER TABLE "public"."reviews" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."reviews_with_author_profile" AS
 SELECT "r"."id",
    "r"."created_at",
    "r"."title",
    "r"."content",
    "r"."rating",
    "r"."is_published",
    "r"."is_pinned",
    "r"."pinned_at",
    "r"."image_urls",
    "u"."name" AS "author_name",
    "r"."user_id" AS "author_auth_id"
   FROM ("public"."reviews" "r"
     JOIN "public"."users" "u" ON (("r"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."reviews_with_author_profile" OWNER TO "postgres";


ALTER TABLE "public"."scammer_reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."scammer_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_login_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_name" "text",
    "user_email" "text",
    "login_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet"
);


ALTER TABLE "public"."user_login_logs" OWNER TO "postgres";


ALTER TABLE "public"."user_login_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_login_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."arrest_news"
    ADD CONSTRAINT "arrest_news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audio_analysis_results"
    ADD CONSTRAINT "audio_analysis_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_room_id_key" UNIQUE ("user_id", "room_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."help_answers"
    ADD CONSTRAINT "help_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."help_answers"
    ADD CONSTRAINT "help_answers_question_id_key" UNIQUE ("question_id");



ALTER TABLE ONLY "public"."help_questions"
    ADD CONSTRAINT "help_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "new_crime_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "new_crime_cases_source_help_question_id_key" UNIQUE ("source_help_question_id");



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phone_verifications"
    ADD CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_login_logs"
    ADD CONSTRAINT "user_login_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_naver_id_key" UNIQUE ("naver_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_nickname_key" UNIQUE ("nickname");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_comments_parent_comment_id" ON "public"."comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_comments_post_board_type" ON "public"."comments" USING "btree" ("post_id", "board_type");



CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "handle_arrest_news_updated_at" BEFORE UPDATE ON "public"."arrest_news" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_chat_rooms_updated_at" BEFORE UPDATE ON "public"."chat_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "notify_on_new_help_question" AFTER INSERT ON "public"."help_questions" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://lmwtidqrmfclrbapmtdm.supabase.co/functions/v1/send-sens-notification', 'POST', '{"Content-type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtd3RpZHFybWZjbHJiYXBtdGRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzM4MTM4OSwiZXhwIjoyMDU4OTU3Mzg5fQ.aYfmDA2VkC-i4tLAyMT-_Yy8I6iu0eqnwr9-5sYCCVc"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "on_comment_updated" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_community_posts_updated" BEFORE UPDATE ON "public"."community_posts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_incident_photos_updated" BEFORE UPDATE ON "public"."incident_photos" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_new_message_update_room_timestamp" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_room_last_message_at"();



CREATE OR REPLACE TRIGGER "on_reviews_updated" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."audio_analysis_results"
    ADD CONSTRAINT "audio_analysis_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."help_answers"
    ADD CONSTRAINT "fk_admin" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("auth_user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."help_answers"
    ADD CONSTRAINT "fk_question" FOREIGN KEY ("question_id") REFERENCES "public"."help_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "fk_source_help_question" FOREIGN KEY ("source_help_question_id") REFERENCES "public"."help_questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."help_questions"
    ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("auth_user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "new_crime_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_analyzer_id_fkey" FOREIGN KEY ("analyzer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_login_logs"
    ADD CONSTRAINT "user_login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage arrest news." ON "public"."arrest_news" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admins can manage incident photos." ON "public"."incident_photos" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admins can manage notices" ON "public"."notices" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admins can view all user profiles" ON "public"."users" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Allow admin to read all login logs" ON "public"."user_login_logs" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Allow admins to insert answers" ON "public"."help_answers" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Allow admins to read page_views" ON "public"."page_views" FOR SELECT USING ("public"."is_current_user_admin"());



CREATE POLICY "Allow admins to update questions" ON "public"."help_questions" FOR UPDATE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Allow all authenticated users to view all answers" ON "public"."help_answers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all users to view comments" ON "public"."comments" FOR SELECT USING (true);



CREATE POLICY "Allow authenticated users to insert comments" ON "public"."comments" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to insert page_views" ON "public"."page_views" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow insert for authenticated users" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert for authenticated users on scammer_reports" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read based on job type for scammer_reports" ON "public"."scammer_reports" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((("public"."get_user_job_type"() = '사업자'::"text") AND ("category" = ANY (ARRAY['불법사금융'::"text", '노쇼 대리구매 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text"]))) OR ((("public"."get_user_job_type"() = '일반'::"text") OR ("public"."get_user_job_type"() IS NULL)) AND (NOT ("category" = ANY (ARRAY['불법사금융'::"text", '노쇼 대리구매 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text"])))))));



CREATE POLICY "Allow users to delete their own comments" ON "public"."comments" FOR DELETE USING (("public"."get_current_user_id"() = "user_id"));



CREATE POLICY "Allow users to insert their own questions" ON "public"."help_questions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to update their own comments" ON "public"."comments" FOR UPDATE USING (("public"."get_current_user_id"() = "user_id"));



CREATE POLICY "Authenticated users can create cases." ON "public"."new_crime_cases" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create community posts." ON "public"."community_posts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create reviews." ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Authenticated users can list other users for chat" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Deny ALL access" ON "public"."phone_verifications" USING (false) WITH CHECK (false);



CREATE POLICY "Enable read access for all authenticated users" ON "public"."help_questions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable select for users based on question ownership" ON "public"."help_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."help_questions"
  WHERE (("help_questions"."id" = "help_answers"."question_id") AND ("help_questions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Public can view published arrest news." ON "public"."arrest_news" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public can view published cases." ON "public"."new_crime_cases" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public community posts are viewable by everyone." ON "public"."community_posts" FOR SELECT USING (true);



CREATE POLICY "Public incident photos are viewable by everyone." ON "public"."incident_photos" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public notices are viewable by everyone." ON "public"."notices" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public reviews are viewable by everyone." ON "public"."reviews" FOR SELECT USING (("is_published" = true));



CREATE POLICY "TEST Allow all authenticated to insert chat rooms" ON "public"."chat_rooms" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can delete their own cases." ON "public"."new_crime_cases" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own community posts." ON "public"."community_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own participation." ON "public"."chat_room_participants" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own questions." ON "public"."help_questions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own reviews." ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own analysis requests." ON "public"."audio_analysis_results" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own participation." ON "public"."chat_room_participants" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own profile." ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can insert their own questions." ON "public"."help_questions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can send messages in rooms they are part of." ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_messages"."room_id") AND ("crp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update their own community posts." ON "public"."community_posts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own questions." ON "public"."help_questions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own reviews." ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view chat rooms they are part of." ON "public"."chat_rooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_rooms"."id") AND ("crp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view messages in rooms they are part of." ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_messages"."room_id") AND ("crp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own analysis results." ON "public"."audio_analysis_results" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own participation." ON "public"."chat_room_participants" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."arrest_news" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audio_analysis_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_room_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."help_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."help_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."new_crime_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."phone_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scammer_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_login_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audio_analysis_results";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comments";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrypt_secret_array"("encrypted_array" "bytea"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_secret_array"("encrypted_array" "bytea"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_secret_array"("encrypted_array" "bytea"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_email_by_profile"("p_name" "text", "p_phone_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_email_by_profile"("p_name" "text", "p_phone_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_email_by_profile"("p_name" "text", "p_phone_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."scammer_reports" TO "anon";
GRANT ALL ON TABLE "public"."scammer_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."scammer_reports" TO "service_role";



GRANT INSERT("phone_numbers"),UPDATE("phone_numbers") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("category"),UPDATE("category") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("description"),UPDATE("description") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bank_account_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_bank_account_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bank_account_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_crime_summary_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_crime_summary_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_crime_summary_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_phone_number_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_phone_number_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_phone_number_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_question_ids"("p_question_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_question_ids"("p_question_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_question_ids"("p_question_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_login"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_new_crime_case_view"("case_id_input" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_new_crime_case_view"("case_id_input" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_new_crime_case_view"("case_id_input" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_view"("post_id_input" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_view"("post_id_input" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_view"("post_id_input" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mask_damage_accounts"("damage_accounts_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."mask_damage_accounts"("damage_accounts_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mask_damage_accounts"("damage_accounts_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mask_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mask_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mask_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mask_phone_number"("p_phone_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mask_phone_number"("p_phone_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mask_phone_number"("p_phone_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mask_string"("p_string" "text", "p_start_visible" integer, "p_end_visible" integer, "p_mask_char" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mask_string"("p_string" "text", "p_start_visible" integer, "p_end_visible" integer, "p_mask_char" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mask_string"("p_string" "text", "p_start_visible" integer, "p_end_visible" integer, "p_mask_char" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_reports"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_reports"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_reports"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "service_role";



























GRANT ALL ON TABLE "public"."decrypted_scammer_reports" TO "anon";
GRANT ALL ON TABLE "public"."decrypted_scammer_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."decrypted_scammer_reports" TO "service_role";



GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "anon";
GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "service_role";



GRANT ALL ON TABLE "public"."arrest_news" TO "anon";
GRANT ALL ON TABLE "public"."arrest_news" TO "authenticated";
GRANT ALL ON TABLE "public"."arrest_news" TO "service_role";



GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."audio_analysis_results" TO "anon";
GRANT ALL ON TABLE "public"."audio_analysis_results" TO "authenticated";
GRANT ALL ON TABLE "public"."audio_analysis_results" TO "service_role";
GRANT SELECT ON TABLE "public"."audio_analysis_results" TO "supabase_realtime_admin";



GRANT ALL ON SEQUENCE "public"."audio_analysis_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audio_analysis_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audio_analysis_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chat_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chat_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chat_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages_with_sender_profile" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages_with_sender_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages_with_sender_profile" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_participants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chat_room_participants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chat_room_participants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chat_room_participants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_participants_with_profile" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_participants_with_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_participants_with_profile" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "anon";
GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "service_role";



GRANT ALL ON TABLE "public"."help_answers" TO "anon";
GRANT ALL ON TABLE "public"."help_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."help_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."help_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."help_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."help_answers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."help_questions" TO "anon";
GRANT ALL ON TABLE "public"."help_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."help_questions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."help_questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."help_questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."help_questions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."help_questions_with_author" TO "anon";
GRANT ALL ON TABLE "public"."help_questions_with_author" TO "authenticated";
GRANT ALL ON TABLE "public"."help_questions_with_author" TO "service_role";



GRANT ALL ON TABLE "public"."incident_photos" TO "anon";
GRANT ALL ON TABLE "public"."incident_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_photos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."incident_photos_with_author_profile" TO "anon";
GRANT ALL ON TABLE "public"."incident_photos_with_author_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_photos_with_author_profile" TO "service_role";



GRANT ALL ON TABLE "public"."masked_scammer_reports" TO "anon";
GRANT ALL ON TABLE "public"."masked_scammer_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."masked_scammer_reports" TO "service_role";



GRANT ALL ON TABLE "public"."new_crime_cases" TO "anon";
GRANT ALL ON TABLE "public"."new_crime_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."new_crime_cases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."new_crime_cases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."new_crime_cases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."new_crime_cases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notices" TO "anon";
GRANT ALL ON TABLE "public"."notices" TO "authenticated";
GRANT ALL ON TABLE "public"."notices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."page_views" TO "anon";
GRANT ALL ON TABLE "public"."page_views" TO "authenticated";
GRANT ALL ON TABLE "public"."page_views" TO "service_role";



GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."phone_verifications" TO "anon";
GRANT ALL ON TABLE "public"."phone_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_verifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."phone_verifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."phone_verifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."phone_verifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reviews_with_author_profile" TO "anon";
GRANT ALL ON TABLE "public"."reviews_with_author_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews_with_author_profile" TO "service_role";



GRANT ALL ON SEQUENCE "public"."scammer_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."scammer_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."scammer_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_login_logs" TO "anon";
GRANT ALL ON TABLE "public"."user_login_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_login_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_login_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_login_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_login_logs_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
