-- arrest_news 테이블에 scammer_bank_name 컬럼 추가
ALTER TABLE arrest_news
  ADD COLUMN IF NOT EXISTS scammer_bank_name text;
