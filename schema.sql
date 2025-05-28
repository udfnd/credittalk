

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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."scammer_reports" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "bytea",
    "phone_number" "bytea",
    "national_id" "bytea",
    "account_number" "bytea",
    "category" "text" NOT NULL,
    "description" "text",
    "ip_address" "inet",
    "address" "bytea",
    "company_type" "text",
    "scam_report_source" "text",
    "nickname" "text",
    "perpetrator_dialogue_trigger" "text",
    "perpetrator_contact_path" "text",
    "victim_circumstances" "text",
    "traded_item_category" "text",
    "perpetrator_identified" boolean,
    CONSTRAINT "scammer_reports_category_check" CHECK (("category" = ANY (ARRAY['노쇼'::"text", '불법 사채'::"text", '보이스피싱'::"text", '중고나라 사기'::"text", '사기'::"text", '전세 사기'::"text", '알바 사기'::"text", '절도'::"text", '보이스피싱, 전기통신금융사기, 로맨스 스캠 사기'::"text", '불법사금융 대리구매'::"text", '중고나라 사기'::"text", '투자 사기, 전세 사기'::"text", '게임 비실물'::"text", '암호화폐'::"text", '노쇼, 대리구매, 사기'::"text", '공갈 협박 범죄'::"text", '알바 범죄'::"text", '렌탈 사업'::"text", '기타'::"text"]))),
    CONSTRAINT "scammer_reports_company_type_check" CHECK (("company_type" = ANY (ARRAY['법인'::"text", '개인'::"text"]))),
    CONSTRAINT "scammer_reports_scam_report_source_check" CHECK (("scam_report_source" = ANY (ARRAY['지인소개'::"text", '포털사이트'::"text", '문자'::"text", '카톡'::"text", '텔레그램'::"text"])))
);

ALTER TABLE ONLY "public"."scammer_reports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."scammer_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."scammer_reports" IS '사기꾼 신고 정보 (민감 정보 암호화 및 RLS 적용)';



COMMENT ON COLUMN "public"."scammer_reports"."name" IS '신고 대상 이름 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."phone_number" IS '신고 대상 연락처 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."national_id" IS '!!! 극도의 주의 필요 !!! 신고 대상 주민등록번호 (pgcrypto AES-256 암호화)';



COMMENT ON COLUMN "public"."scammer_reports"."account_number" IS '신고 대상 계좌번호 (pgcrypto AES-256 암호화)';



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



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "national_id" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "auth_user_id" "uuid",
    CONSTRAINT "users_job_type_check" CHECK (("job_type" = ANY (ARRAY['일반'::"text", '대부업 종사자'::"text", '자영업 종사자'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


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
    "public"."decrypt_secret"("sr"."national_id") AS "national_id",
    "public"."decrypt_secret"("sr"."address") AS "address",
    "sr"."category",
    "sr"."description",
    "sr"."ip_address",
    "sr"."created_at",
    "sr"."company_type",
    "sr"."scam_report_source"
   FROM "public"."get_allowed_scammer_reports_for_user"() "sr"("id", "created_at", "name", "phone_number", "national_id", "account_number", "category", "description", "ip_address", "address", "company_type", "scam_report_source", "nickname");


ALTER TABLE "public"."masked_scammer_reports" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id");



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



CREATE OR REPLACE TRIGGER "on_community_posts_updated" BEFORE UPDATE ON "public"."community_posts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_incident_photos_updated" BEFORE UPDATE ON "public"."incident_photos" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_reviews_updated" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_photos"
    ADD CONSTRAINT "incident_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage incident photos." ON "public"."incident_photos" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Allow insert for authenticated users" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert for authenticated users on scammer_reports" ON "public"."scammer_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read based on job type for scammer_reports" ON "public"."scammer_reports" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((("public"."get_user_job_type"() = '대부업 종사자'::"text") AND ("category" = '불법사금융 대리구매'::"text")) OR (("public"."get_user_job_type"() = '자영업 종사자'::"text") AND ("category" = ANY (ARRAY['알바 범죄'::"text", '노쇼 대리구매 사기'::"text"]))) OR ((("public"."get_user_job_type"() = '일반'::"text") OR ("public"."get_user_job_type"() IS NULL)) AND ("category" <> ALL (ARRAY['불법사금융 대리구매'::"text", '알바 범죄'::"text", '노쇼 대리구매 사기'::"text"]))))));



CREATE POLICY "Authenticated users can create community posts." ON "public"."community_posts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create reviews." ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Public community posts are viewable by everyone." ON "public"."community_posts" FOR SELECT USING (true);



CREATE POLICY "Public incident photos are viewable by everyone." ON "public"."incident_photos" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public notices are viewable by everyone." ON "public"."notices" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public reviews are viewable by everyone." ON "public"."reviews" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Users can delete their own community posts." ON "public"."community_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own reviews." ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can update their own community posts." ON "public"."community_posts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own reviews." ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile." ON "public"."users" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_photos" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON TABLE "public"."scammer_reports" TO "anon";
GRANT ALL ON TABLE "public"."scammer_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."scammer_reports" TO "service_role";



GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("phone_number"),UPDATE("phone_number") ON TABLE "public"."scammer_reports" TO "authenticated";



GRANT INSERT("national_id"),UPDATE("national_id") ON TABLE "public"."scammer_reports" TO "authenticated";



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



























GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."community_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



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
