// supabase/functions/get-home-stats/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayRange(now = new Date()) {
  // 오늘(KST)의 00:00~23:59:59.999을 UTC로 변환
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();

  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - KST_OFFSET_MS);
  const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - KST_OFFSET_MS);

  return {
    startUtcISO: startUtc.toISOString(),
    endUtcISO: endUtc.toISOString(),
  };
}

/** KST 기준 특정 날짜의 '자정 직전(=해당일 23:59:59.999 KST)'을 UTC ISO로 변환
 *  month는 Date.UTC와 동일하게 0-기반(0=1월)입니다. 예: 2025-08-30 → (2025, 7, 30)
 */
function kstEndOfDayUtcISO(year: number, monthZeroBased: number, day: number) {
  const utc = new Date(
    Date.UTC(year, monthZeroBased, day, 23, 59, 59, 999) - KST_OFFSET_MS,
  );
  return utc.toISOString();
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getSupabaseSecretKey(),
      { auth: { persistSession: false } },
    );

    const { startUtcISO, endUtcISO } = kstDayRange();

    // ✅ 누적 집계 컷오프: 2025-08-30 23:59:59.999 (KST) 까지는 exact_match 무시
    //   → UTC로는 2025-08-30 14:59:59.999Z
    const CUTOFF_END_UTC_ISO = kstEndOfDayUtcISO(2025, 7, 30); // 7=8월

    const [
      // 오늘의 사기 예방: 항상 exact_match=true 만 카운트
      { count: todayPreventionExact },

      // 누적(과거 구간): 컷오프 이전은 exact_match 무시하고 전부
      { count: beforeCutoffAll },

      // 누적(최근 구간): 컷오프 이후는 exact_match=true 만
      { count: afterCutoffExact },

      // 참고용: 헬프데스크 문의 (그대로 유지)
      { count: todayHelpQuestions },
      { count: totalHelpQuestions },

      // 전체 피해 사례 수
      { count: totalScamCount },
    ] = await Promise.all([
      supabase
        .from('search_logs')
        .select('*', { count: 'exact', head: true })
        .eq('exact_match', true)
        .gte('created_at', startUtcISO)
        .lt('created_at', endUtcISO),

      supabase
        .from('search_logs')
        .select('*', { count: 'exact', head: true })
        .lte('created_at', CUTOFF_END_UTC_ISO), // 👈 exact_match 필터 없음

      supabase
        .from('search_logs')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', CUTOFF_END_UTC_ISO) // 컷오프 '이후'
        .eq('exact_match', true),

      supabase
        .from('help_questions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startUtcISO)
        .lt('created_at', endUtcISO),

      supabase
        .from('help_questions')
        .select('*', { count: 'exact', head: true }),

      supabase
        .from('scammer_reports')
        .select('*', { count: 'exact', head: true }),
    ]);

    // 누적 사기 예방(하이브리드): [컷오프 이전 전체] + [컷오프 이후 exact만]
    const totalPreventionHybrid =
      (beforeCutoffAll ?? 0) + (afterCutoffExact ?? 0);

    // API 호환 필드 유지 + 보조 필드 제공
    const payload = {
      // 화면에서 쓰는 기존 키(= 사기 예방 수): 오늘은 exact만, 누적은 하이브리드
      todayHelpCount: todayPreventionExact ?? 0,
      totalHelpCount: totalPreventionHybrid,

      totalScamCount: totalScamCount ?? 0,

      // 참고용 세부 필드
      todayPreventionCountExact: todayPreventionExact ?? 0,
      totalPreventionCountBeforeCutoffAll: beforeCutoffAll ?? 0,
      totalPreventionCountAfterCutoffExact: afterCutoffExact ?? 0,
      todayHelpQuestionsCount: todayHelpQuestions ?? 0,
      totalHelpQuestionsCount: totalHelpQuestions ?? 0,
      cutoffEndUtcISO: CUTOFF_END_UTC_ISO, // 디버그/검증용
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('get-home-stats error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
