-- ============================================
-- 이벤트 응모 인원 도달 시 자동 마감 + 우선순위 사용자 응모 허용
-- 작성일: 2026-04-12
--
-- 수정 내용:
-- 1. 응모 인원 도달 시 events.status를 'closed'로 자동 변경
-- 2. status='closed'여도 우선순위 보유자는 응모 가능
-- 3. 일반 사용자는 마감 후 응모 시 우선순위 부여
-- ============================================

-- enter_event 함수 재작성
CREATE OR REPLACE FUNCTION public.enter_event(p_event_id bigint)
RETURNS TABLE(success boolean, entry_number integer, message text, priority_granted boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id bigint;
    v_event events%ROWTYPE;
    v_next_entry_number integer;
    v_existing_entry integer;
    v_current_entry_count bigint;
    v_priority_id bigint;
BEGIN
    -- 현재 사용자의 users.id 조회
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.auth_user_id = auth.uid();

    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::integer, '로그인이 필요합니다.'::text, false;
        RETURN;
    END IF;

    -- 이벤트별 Advisory Lock 획득 (동시 응모 시 race condition 방지)
    PERFORM pg_advisory_xact_lock(p_event_id);

    -- 이벤트 정보 조회
    SELECT * INTO v_event
    FROM public.events e
    WHERE e.id = p_event_id AND e.is_published = true;

    IF v_event IS NULL THEN
        RETURN QUERY SELECT false, NULL::integer, '이벤트를 찾을 수 없습니다.'::text, false;
        RETURN;
    END IF;

    -- 응모 기간 확인
    IF NOW() < v_event.entry_start_at THEN
        RETURN QUERY SELECT false, NULL::integer, '응모 기간이 아직 시작되지 않았습니다.'::text, false;
        RETURN;
    END IF;

    IF NOW() > v_event.entry_end_at THEN
        RETURN QUERY SELECT false, NULL::integer, '응모 기간이 종료되었습니다.'::text, false;
        RETURN;
    END IF;

    -- status 확인: 'closed'인 경우 우선순위 보유자만 통과
    IF v_event.status = 'closed' THEN
        SELECT epu.id INTO v_priority_id
        FROM public.event_priority_users epu
        WHERE epu.user_id = v_user_id AND epu.is_used = false
        LIMIT 1;

        IF v_priority_id IS NULL THEN
            -- 우선순위 없는 일반 사용자: 우선순위 부여 후 거절
            INSERT INTO public.event_priority_users (user_id, source_event_id)
            VALUES (v_user_id, p_event_id)
            ON CONFLICT (user_id, source_event_id) DO NOTHING;

            RETURN QUERY SELECT false, NULL::integer,
                '응모 인원이 마감되었습니다. 다음 이벤트에서 우선 응모 권한이 부여됩니다!'::text, true;
            RETURN;
        END IF;

        -- 우선순위 보유자: 우선순위 소진 후 응모 진행
        UPDATE public.event_priority_users
        SET is_used = true, used_at = NOW(), used_event_id = p_event_id
        WHERE id = v_priority_id;

    ELSIF v_event.status != 'active' THEN
        -- announced 등 기타 상태
        RETURN QUERY SELECT false, NULL::integer, '현재 응모할 수 없는 이벤트입니다.'::text, false;
        RETURN;
    END IF;

    -- 이미 응모했는지 확인
    SELECT ee.entry_number INTO v_existing_entry
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id AND ee.user_id = v_user_id;

    IF v_existing_entry IS NOT NULL THEN
        RETURN QUERY SELECT false, v_existing_entry, '이미 응모하셨습니다.'::text, false;
        RETURN;
    END IF;

    -- 다음 응모 번호 계산 (Advisory Lock으로 보호됨)
    SELECT COALESCE(MAX(ee.entry_number), 0) + 1 INTO v_next_entry_number
    FROM public.event_entries ee
    WHERE ee.event_id = p_event_id;

    -- 응모 등록
    INSERT INTO public.event_entries (event_id, user_id, entry_number)
    VALUES (p_event_id, v_user_id, v_next_entry_number);

    -- 응모 인원이 max_entry_count에 도달하면 자동으로 마감 처리
    IF v_event.max_entry_count IS NOT NULL AND v_event.status = 'active'
       AND v_next_entry_number >= v_event.max_entry_count THEN
        UPDATE public.events
        SET status = 'closed', updated_at = NOW()
        WHERE id = p_event_id;
    END IF;

    RETURN QUERY SELECT true, v_next_entry_number, '응모가 완료되었습니다.'::text, false;
END;
$$;
