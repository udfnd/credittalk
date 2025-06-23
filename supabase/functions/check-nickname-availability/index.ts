// supabase/functions/check-nickname-availability/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { nickname } = await req.json();
    if (
      !nickname ||
      typeof nickname !== "string" ||
      nickname.trim().length < 2
    ) {
      return new Response(
        JSON.stringify({
          error: "유효한 닉네임을 제공해야 합니다 (2자 이상).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // users 테이블에서 nickname으로 조회
    const { data: existingProfile, error: queryError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("nickname", nickname.trim())
      .maybeSingle();

    if (queryError) {
      throw queryError;
    }

    const available = existingProfile === null;

    return new Response(JSON.stringify({ available }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message ?? "서버 오류가 발생했습니다." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
