-- Migration: SPEC-SEARCH-FIX-001
-- Date: 2026-04-20
-- Description: search_reports RPC가 perpetrator_id (가해자 SNS/플랫폼 아이디) 필드를
--              검색 조건에 포함하지 않아 등록된 신고가 검색에서 누락되는 문제 수정.
--
-- Before: nickname, phone, account, accountHolderName 만 검색 가능
-- After : 위 항목 + perpetrator_id (ILIKE 부분 일치)
--
-- 영향:
-- 1) 사기피해사례 검색: perpetrator_id 입력 신고가 정상 노출됨
-- 2) log-search Edge Function: exact_match 판정 정확도 향상
-- 3) get-home-stats: '오늘의 사기 예방' 누적 카운트 과소 집계 해소

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
      -- Nickname search: ILIKE partial match
      (term_lower <> '' AND lower(coalesce(dr.nickname, '')) ILIKE '%' || term_lower || '%')
      OR
      -- Perpetrator ID search: ILIKE partial match (가해자 SNS/플랫폼 아이디)
      -- Telegram ID, KakaoTalk ID, URL 등을 포함하므로 ILIKE 사용
      (term_lower <> '' AND lower(coalesce(dr.perpetrator_id, '')) ILIKE '%' || term_lower || '%')
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
