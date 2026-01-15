# enter_event 함수 - Race Condition 수정

## 변경 내용
- `pg_advisory_xact_lock(p_event_id)` 추가하여 동시 응모 시 응모번호 중복 방지
- 같은 이벤트에 동시 응모 시 직렬화 처리됨
- 트랜잭션 종료 시 자동으로 락 해제

## Supabase SQL Editor에서 실행할 쿼리

```sql
CREATE OR REPLACE FUNCTION "public"."enter_event"("p_event_id" bigint) RETURNS TABLE("success" boolean, "entry_number" integer, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id bigint;
    v_event events%ROWTYPE;
    v_next_entry_number integer;
    v_existing_entry integer;
BEGIN
    -- 현재 사용자의 users.id 조회
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::integer, '로그인이 필요합니다.'::text;
        RETURN;
    END IF;

    -- 이벤트별 Advisory Lock 획득 (동시 응모 시 race condition 방지)
    -- 트랜잭션 종료 시 자동 해제됨
    PERFORM pg_advisory_xact_lock(p_event_id);

    -- 이벤트 정보 조회
    SELECT * INTO v_event
    FROM public.events e
    WHERE e.id = p_event_id AND e.is_published = true;

    IF v_event IS NULL THEN
        RETURN QUERY SELECT false, NULL::integer, '이벤트를 찾을 수 없습니다.'::text;
        RETURN;
    END IF;

    -- 응모 기간 확인
    IF NOW() < v_event.entry_start_at THEN
        RETURN QUERY SELECT false, NULL::integer, '응모 기간이 아직 시작되지 않았습니다.'::text;
        RETURN;
    END IF;

    IF NOW() > v_event.entry_end_at THEN
        RETURN QUERY SELECT false, NULL::integer, '응모 기간이 종료되었습니다.'::text;
        RETURN;
    END IF;

    IF v_event.status != 'active' THEN
        RETURN QUERY SELECT false, NULL::integer, '현재 응모할 수 없는 이벤트입니다.'::text;
        RETURN;
    END IF;

    -- 이미 응모했는지 확인
    SELECT ee.entry_number INTO v_existing_entry
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id AND ee.user_id = v_user_id;

    IF v_existing_entry IS NOT NULL THEN
        RETURN QUERY SELECT false, v_existing_entry, '이미 응모하셨습니다.'::text;
        RETURN;
    END IF;

    -- 다음 응모 번호 계산 (Advisory Lock으로 보호됨)
    SELECT COALESCE(MAX(ee.entry_number), 0) + 1 INTO v_next_entry_number
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id;

    -- 응모 등록
    INSERT INTO public.event_entries (event_id, user_id, entry_number)
    VALUES (p_event_id, v_user_id, v_next_entry_number);

    RETURN QUERY SELECT true, v_next_entry_number, '응모가 완료되었습니다.'::text;
END;
$$;
```
