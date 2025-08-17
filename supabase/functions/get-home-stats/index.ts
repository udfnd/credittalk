import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (_req) => {
  if (_req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // KST (UTC+9) 기준 '오늘'의 시작과 끝을 계산합니다.
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstToday = new Date(now.getTime() + kstOffset);
    const todayStartUTC = new Date(kstToday.setUTCHours(0, 0, 0, 0) - kstOffset).toISOString();
    const todayEndUTC = new Date(kstToday.setUTCHours(23, 59, 59, 999) - kstOffset).toISOString();

    // 5개의 통계를 병렬로 조회하여 성능을 최적화합니다.
    const [
      { count: todayHelpCountRaw },
      { count: totalHelpCountRaw },
      { count: totalScamCount },
      { count: todayPreventionCount },
      { count: totalPreventionCount }
    ] = await Promise.all([
      supabaseAdminClient.from("help_questions").select("*", { count: "exact", head: true }).gte("created_at", todayStartUTC).lt("created_at", todayEndUTC),
      supabaseAdminClient.from("help_questions").select("*", { count: "exact", head: true }),
      supabaseAdminClient.from("scammer_reports").select("*", { count: "exact", head: true }),
      supabaseAdminClient.from("search_logs").select("*", { count: "exact", head: true }).gte("created_at", todayStartUTC).lt("created_at", todayEndUTC),
      supabaseAdminClient.from("search_logs").select("*", { count: "exact", head: true })
    ]);

    // --- 핵심 수정: 헬프센터 문의 수와 검색 수를 합산 ---
    const finalTodayHelpCount = (todayHelpCountRaw ?? 0) + (todayPreventionCount ?? 0);
    const finalTotalHelpCount = (totalHelpCountRaw ?? 0) + (totalPreventionCount ?? 0);

    // 합산된 최종 통계 데이터를 반환합니다.
    const stats = {
      todayHelpCount: finalTodayHelpCount,
      totalHelpCount: finalTotalHelpCount,
      totalScamCount: totalScamCount ?? 0,
    };

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
