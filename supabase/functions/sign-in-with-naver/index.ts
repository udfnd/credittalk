import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Supabase Edge Function: Naver 로그인 처리 함수
serve(async (req) => {
  // CORS preflight 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { naver_token } = await req.json();
    if (!naver_token) throw new Error("Naver access token is required.");

    // 1. 네이버 API 호출하여 사용자 정보 가져오기
    const naverUserRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${naver_token}` },
    });
    if (!naverUserRes.ok) throw new Error("Failed to fetch Naver user profile.");

    const naverUser = (await naverUserRes.json()).response;
    if (!naverUser?.id) throw new Error("Invalid Naver profile.");

    const { id: naverId, email, name } = naverUser;
    if (!email) throw new Error("Naver account must have a valid email.");

    // Supabase Admin 클라이언트 생성
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. 전체 페이지 순회하여 기존 사용자 검색
    let existingUser: User | null = null;
    const perPage = 1000;
    let page = 1;
    do {
      const { data: pageData, error: listError } =
        await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (listError) throw listError;

      const { users } = pageData;
      existingUser = users.find((u) => u.email === email) || null;
      if (existingUser || users.length < perPage) break;
      page += 1;
    } while (true);

    let supabaseUser: User;
    if (existingUser) {
      supabaseUser = existingUser;
      // 프로필 테이블에 네이버 ID 미존재 시 업데이트
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id, naver_id")
        .eq("auth_user_id", supabaseUser.id)
        .single();
      if (profileError && profileError.code !== "PGRST116") throw profileError;
      if (profile && !profile.naver_id) {
        await supabaseAdmin
          .from("users")
          .update({ naver_id: naverId })
          .eq("auth_user_id", supabaseUser.id);
      }
    } else {
      // 신규 사용자 생성
      const { data: newUser, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: name, provider: "naver", provider_id: naverId },
        });
      if (signUpError) throw signUpError;
      supabaseUser = newUser.user;
    }

    // 3. Magic Link 생성 및 세션 발행
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: supabaseUser.email!,
      });
    if (linkError) throw linkError;

    const tokenHash =
      linkData.properties.hashed_token ||
      new URL(linkData.properties.action_link).searchParams.get("token_hash");
    if (!tokenHash) throw new Error("Could not extract magic link token hash.");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: otpData, error: verifyError } =
      await supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (verifyError) throw verifyError;

    // 4. 클라이언트에 세션 반환
    return new Response(JSON.stringify(otpData.session), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Sign-in with Naver Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
