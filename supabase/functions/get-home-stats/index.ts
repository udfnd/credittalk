import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (_req) => {
  // OPTIONS 요청은 CORS 처리를 위해 바로 응답합니다.
  if (_req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 관리자 클라이언트를 생성하여 RLS를 우회하고 직접 데이터를 조회합니다.
    const supabaseAdminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // KST (UTC+9) 기준 '오늘'의 시작과 끝을 계산합니다.
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstToday = new Date(now.getTime() + kstOffset);
    const todayStartUTC = new Date(kstToday.setUTCHours(0, 0, 0, 0) - kstOffset).toISOString();
    const todayEndUTC = new Date(kstToday.setUTCHours(23, 59, 59, 999) - kstOffset).toISOString();

    // 3가지 통계를 병렬로 조회하여 성능을 최적화합니다.
    const [
      { count: todayHelpCount },
      { count: totalHelpCount },
      { count: totalScamCount },
    ] = await Promise.all([
      supabaseAdminClient
        .from("help_questions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStartUTC)
        .lt("created_at", todayEndUTC),
      supabaseAdminClient
        .from("help_questions")
        .select("*", { count: "exact", head: true }),
      supabaseAdminClient
        .from("scammer_reports")
        .select("*", { count: "exact", head: true }),
    ]);

    // 조회된 데이터를 JSON 형태로 반환합니다.
    const stats = {
      todayHelpCount: todayHelpCount ?? 0,
      totalHelpCount: totalHelpCount ?? 0,
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
