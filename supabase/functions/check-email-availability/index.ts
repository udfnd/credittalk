import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // auth.users 테이블에서 이메일로 사용자를 조회합니다.
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.admin.getUserByEmail(email);

    if (error && error.message !== "User not found") {
      // 'User not found'는 오류가 아니라 사용 가능한 상태를 의미하므로, 그 외의 오류만 처리합니다.
      throw error;
    }

    return new Response(
      JSON.stringify({ available: !user }), // user가 존재하면 available: false, 없으면 true
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
