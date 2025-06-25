// supabase/functions/check-email-availability/index.ts
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

    const trimmedEmail = email.trim();

    // 4) `listUsers`의 `query` 파라미터를 사용하여 사용자 검색
    const {
      data: { users },
      error: listError,
    } = await supabaseAdmin.auth.admin.listUsers({
      query: trimmedEmail,
    });

    if (listError) {
      throw listError;
    }

    // 5) `query`는 부분 일치 검색이므로, 결과에서 정확히 일치하는 이메일이 있는지 확인
    const existingUser = users.find((u) => u.email === trimmedEmail);

    // 6) `existingUser`가 존재하지 않아야 사용 가능
    const available = !existingUser;

    // 7) 결과 반환
    return new Response(JSON.stringify({ available }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    // 8) 예기치 못한 서버 에러 처리
    return new Response(
      JSON.stringify({ error: err.message ?? "서버 오류가 발생했습니다." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
