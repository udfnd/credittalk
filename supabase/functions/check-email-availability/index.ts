import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // 1) CORS preflight 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2) 요청 바디에서 email 파싱 및 유효성 검사
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "유효한 이메일을 제공해야 합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3) Supabase Admin 클라이언트 초기화 (서비스 역할 키 사용)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 4) auth.users 테이블에서 email로 조회
    //    maybeSingle(): 레코드가 하나만 있으면 객체, 없으면 null 리턴
    const { data: user, error: queryError } = await supabaseAdmin
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (queryError) {
      // PostgREST 쿼리 에러 처리
      throw queryError;
    }

    // 5) user가 null 이면 사용 가능, 아니면 중복
    const available = user === null;

    // 6) 결과 반환
    return new Response(JSON.stringify({ available }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    // 7) 예기치 못한 서버 에러 처리
    return new Response(
      JSON.stringify({ error: err.message ?? "서버 오류가 발생했습니다." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
