import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // CORS preflight 요청을 처리합니다.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 앱에서 보낸 인증 헤더를 사용해 Supabase 클라이언트를 생성합니다.
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // 현재 로그인된 사용자 정보를 가져옵니다.
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: '인증된 사용자가 아닙니다.' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // 요청 본문에서 검색어를 추출합니다.
    const { searchTerm } = await req.json();

    // 'search_logs' 테이블에 새로운 검색 기록을 삽입합니다.
    const { error } = await supabaseClient
      .from("search_logs")
      .insert({
        user_id: user.id,
        search_term: searchTerm,
      });

    if (error) throw error;

    return new Response(JSON.stringify({ message: "검색이 성공적으로 기록되었습니다." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 201, // 201 Created
    });
  } catch (error) {
    console.error("Log Search Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
