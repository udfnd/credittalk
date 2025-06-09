

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


CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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
    "name" "bytea",
    "phone_number" "bytea",
    "account_number" "bytea",
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
    "bank_name" "text",
    "site_name" "text",
    CONSTRAINT "scammer_reports_category_check" CHECK (("category" = ANY (ARRAY['보이스피싱, 전기통신금융사기, 로맨스 스캠 사기'::"text", '불법사금융'::"text", '중고물품 사기'::"text", '투자 사기, 전세 사기'::"text", '게임 비실물'::"text", '암호화폐'::"text", '노쇼'::"text", '노쇼 대리구매 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text", '기타'::"text"]))),
    CONSTRAINT "scammer_reports_company_type_check" CHECK (("company_type" = ANY (ARRAY['사업자'::"text", '개인'::"text"]))),
    CONSTRAINT "scammer_reports_gender_check" CHECK (("gender" = ANY (ARRAY['남성'::"text", '여성'::"text", '모름'::"text"]))),
    CONSTRAINT "scammer_reports_scam_report_source_check" CHECK (("scam_report_source" = ANY (ARRAY['지인소개'::"text", '포털사이트'::"text", '문자'::"text", '카톡'::"text", '텔레그램'::"text"])))
);

ALTER TABLE ONLY "public"."scammer_reports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."scammer_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."scammer_reports" IS '사기꾼 신고 정보 (민감 정보 암호화 및 RLS 적용)';



COMMENT ON COLUMN "public"."scammer_reports"."name" IS '신고 대상 이름 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."phone_number" IS '신고 대상 연락처 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."account_number" IS '신고 대상 계좌번호 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."analysis_result" IS '관리자 분석 결과';



COMMENT ON COLUMN "public"."scammer_reports"."analysis_message" IS '관리자 분석 상세 메시지';



COMMENT ON COLUMN "public"."scammer_reports"."analyzed_at" IS '분석 완료 시간';



COMMENT ON COLUMN "public"."scammer_reports"."analyzer_id" IS '분석 수행 관리자 ID';



COMMENT ON COLUMN "public"."scammer_reports"."reporter_id" IS '신고를 작성한 사용자의 ID (auth.users.id)';



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


CREATE OR REPLACE FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result RECORD;
BEGIN
  -- !!! 중요: 여기에 호출자가 관리자인지 확인하는 로직 필수 !!!
  -- 예: IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: Admin privileges required.'; END IF;

  SELECT
    r.id, r.user_id, r.created_at,
    decrypt_secret(r.name) AS name,
    decrypt_secret(r.phone_number) AS phone_number,
    decrypt_secret(r.national_id) AS national_id, -- !!! 극도의 주의 !!!
    decrypt_secret(r.account_number) AS account_number,
    r.category, r.description, r.ip_address
  INTO result
  FROM public.scammer_reports r
  WHERE r.id = report_id_input;

  RETURN row_to_json(result);
END;
$$;


ALTER FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) OWNER TO "postgres";


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


CREATE OR REPLACE VIEW "public"."admin_scammer_reports_view" AS
 SELECT "r"."id",
    "public"."decrypt_secret"("r"."name") AS "name",
    "public"."decrypt_secret"("r"."phone_number") AS "phone_number",
    "public"."decrypt_secret"("r"."account_number") AS "account_number",
    "r"."bank_name",
    "r"."site_name",
    "r"."category",
    "r"."description",
    "r"."ip_address",
    "r"."company_type",
    "r"."scam_report_source",
    "r"."nickname",
    "r"."gender",
    "r"."perpetrator_identified",
    "r"."created_at"
   FROM "public"."scammer_reports" "r";


ALTER TABLE "public"."admin_scammer_reports_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arrest_news" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "author_name" "text",
    "image_url" "text",
    "is_published" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."arrest_news" OWNER TO "postgres";


COMMENT ON TABLE "public"."arrest_news" IS '검거소식 게시물';



COMMENT ON COLUMN "public"."arrest_news"."title" IS '게시물 제목';



COMMENT ON COLUMN "public"."arrest_news"."content" IS '게시물 본문';



COMMENT ON COLUMN "public"."arrest_news"."author_name" IS '작성자 (관리자)';



COMMENT ON COLUMN "public"."arrest_news"."image_url" IS '대표 이미지 URL';



COMMENT ON COLUMN "public"."arrest_news"."is_published" IS '게시 여부';



ALTER TABLE "public"."arrest_news" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."arrest_news_id_seq"
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
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "national_id" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "auth_user_id" "uuid",
    "is_admin" boolean DEFAULT false,
    CONSTRAINT "users_job_type_check" CHECK (("job_type" = ANY (ARRAY['일반'::"text", '사업자'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


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



CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "user_id" "uuid" NOT NULL,
    "category" "text",
    "views" bigint DEFAULT 0
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
 SELECT "cp"."id",
    "cp"."created_at",
    "cp"."updated_at",
    "cp"."title",
    "cp"."content",
    "cp"."user_id" AS "author_auth_id",
    "cp"."category",
    "cp"."views",
    "u"."name" AS "author_name",
    "u"."phone_number" AS "author_phone_number",
    "u"."job_type" AS "author_job_type"
   FROM ("public"."community_posts" "cp"
     LEFT JOIN "public"."users" "u" ON (("cp"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."community_posts_with_author_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_photos" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "category" "text",
    "uploader_id" "uuid",
    "is_published" boolean DEFAULT true
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



CREATE OR REPLACE VIEW "public"."masked_scammer_reports" AS
 SELECT "sr"."id",
    "public"."decrypt_secret"("sr"."name") AS "name",
    "sr"."nickname",
    "public"."decrypt_secret"("sr"."phone_number") AS "phone_number",
    "public"."decrypt_secret"("sr"."account_number") AS "account_number",
    "sr"."bank_name",
    "sr"."site_name",
    "sr"."category",
    "sr"."description",
    "sr"."impersonated_person",
    "sr"."victim_circumstances",
    "sr"."ip_address",
    "sr"."created_at",
    "sr"."company_type",
    "sr"."scam_report_source"
   FROM "public"."get_allowed_scammer_reports_for_user"() "sr"("id", "created_at", "name", "phone_number", "account_number", "category", "description", "ip_address", "company_type", "scam_report_source", "nickname", "victim_circumstances", "traded_item_category", "perpetrator_identified", "analysis_result", "analysis_message", "analyzed_at", "analyzer_id", "gender", "reporter_id", "attempted_fraud", "damage_path", "damaged_item", "impersonated_person", "nickname_evidence_url", "illegal_collection_evidence_urls", "bank_name", "site_name");


ALTER TABLE "public"."masked_scammer_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."new_crime_cases" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "method" "text" NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "views" bigint DEFAULT 0
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
    "views" bigint DEFAULT 0
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



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "user_id" "uuid" NOT NULL,
    "rating" smallint,
    "is_published" boolean DEFAULT true,
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
    "r"."updated_at",
    "r"."title",
    "r"."content",
    "r"."user_id" AS "author_auth_id",
    "r"."rating",
    "r"."is_published",
    "u"."name" AS "author_name",
    "u"."job_type" AS "author_job_type"
   FROM ("public"."reviews" "r"
     LEFT JOIN "public"."users" "u" ON (("r"."user_id" = "u"."auth_user_id")));


ALTER TABLE "public"."reviews_with_author_profile" OWNER TO "postgres";


ALTER TABLE "public"."scammer_reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."scammer_reports_id_seq"
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



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_room_id_key" UNIQUE ("user_id", "room_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "new_crime_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "handle_arrest_news_updated_at" BEFORE UPDATE ON "public"."arrest_news" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_chat_rooms_updated_at" BEFORE UPDATE ON "public"."chat_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_community_posts_updated" BEFORE UPDATE ON "public"."community_posts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_incident_photos_updated" BEFORE UPDATE ON "public"."incident_photos" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_new_message_update_room_timestamp" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_room_last_message_at"();



CREATE OR REPLACE TRIGGER "on_reviews_updated" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_participants"
    ADD CONSTRAINT "chat_room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."new_crime_cases"
    ADD CONSTRAINT "new_crime_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_analyzer_id_fkey" FOREIGN KEY ("analyzer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scammer_reports"
    ADD CONSTRAINT "scammer_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can manage arrest news." ON "public"."arrest_news" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admins can manage incident photos." ON "public"."incident_photos" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admins can manage notices" ON "public"."notices" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Allow insert for authenticated users" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert for authenticated users on scammer_reports" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read based on job type for scammer_reports" ON "public"."scammer_reports" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((("public"."get_user_job_type"() = '사업자'::"text") AND ("category" = ANY (ARRAY['불법사금융'::"text", '노쇼 대리구매 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text"]))) OR ((("public"."get_user_job_type"() = '일반'::"text") OR ("public"."get_user_job_type"() IS NULL)) AND (NOT ("category" = ANY (ARRAY['불법사금융'::"text", '노쇼 대리구매 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text"])))))));



CREATE POLICY "Authenticated users can create cases." ON "public"."new_crime_cases" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create community posts." ON "public"."community_posts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create reviews." ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Authenticated users can list other users for chat" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



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



CREATE POLICY "Users can delete their own reviews." ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own participation." ON "public"."chat_room_participants" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own profile." ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can send messages in rooms they are part of." ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_messages"."room_id") AND ("crp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update their own community posts." ON "public"."community_posts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own reviews." ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view chat rooms they are part of." ON "public"."chat_rooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_rooms"."id") AND ("crp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view messages in rooms they are part of." ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_participants" "crp"
  WHERE (("crp"."room_id" = "chat_messages"."room_id") AND ("crp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own participation." ON "public"."chat_room_participants" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."arrest_news" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_room_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."new_crime_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scammer_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_secret"("encrypted_data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_secret"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_existing_dm_room"("user1_id" "uuid", "user2_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."scammer_reports" TO "anon";
GRANT ALL ON TABLE "public"."scammer_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."scammer_reports" TO "service_role";



GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("phone_number"),UPDATE("phone_number") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("account_number"),UPDATE("account_number") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("category"),UPDATE("category") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("description"),UPDATE("description") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allowed_scammer_reports_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_decrypted_report_for_admin"("report_id_input" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_job_type"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_room_last_message_at"() TO "service_role";



























GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "anon";
GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_scammer_reports_view" TO "service_role";



GRANT ALL ON TABLE "public"."arrest_news" TO "anon";
GRANT ALL ON TABLE "public"."arrest_news" TO "authenticated";
GRANT ALL ON TABLE "public"."arrest_news" TO "service_role";



GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."arrest_news_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "anon";
GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts_with_author_profile" TO "service_role";



GRANT ALL ON TABLE "public"."incident_photos" TO "anon";
GRANT ALL ON TABLE "public"."incident_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_photos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."incident_photos_id_seq" TO "service_role";



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
