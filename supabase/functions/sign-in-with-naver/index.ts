// supabase/functions/sign-in-with-naver/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// 서버사이드에서 인증을 완료하고 완전한 세션을 반환하는 함수
serve(async (req) => {
  // CORS preflight 요청 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { naver_token } = await req.json();
    if (!naver_token) {
      throw new Error("Naver access token is required.");
    }

    // 1. 네이버 API 호출하여 사용자 정보 가져오기
    const naverUserRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${naver_token}` },
    });
    if (!naverUserRes.ok)
      throw new Error("Failed to fetch Naver user profile.");
    const naverUser = (await naverUserRes.json()).response;
    if (!naverUser || !naverUser.id) throw new Error("Invalid Naver profile.");

    const { id: naverId, email, name } = naverUser;
    if (!email) throw new Error("Naver account must have a valid email.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2. 사용자 찾기 또는 생성
    let supabaseUser: User;
    const {
      data: { users },
      error: listError,
    } = await supabaseAdmin.auth.admin.listUsers({ query: email });
    if (listError) throw listError;

    const existingUser = users.find((u) => u.email === email);

    if (existingUser) {
      supabaseUser = existingUser;
      // 기존 사용자의 경우, 프로필에 naver_id가 없으면 연결해줍니다.
      const { data: userProfile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id, naver_id")
        .eq("auth_user_id", supabaseUser.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") throw profileError;

      if (userProfile && !userProfile.naver_id) {
        await supabaseAdmin
          .from("users")
          .update({ naver_id: naverId })
          .eq("auth_user_id", supabaseUser.id);
      }
    } else {
      // 신규 사용자의 경우, auth.users에만 생성합니다.
      // naverId를 user_metadata에 포함시켜 클라이언트로 전달합니다.
      const { data: newUser, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: {
            full_name: name,
            provider: "naver",
            provider_id: naverId, // 이 부분이 중요합니다.
          },
        });

      if (signUpError) throw signUpError;
      supabaseUser = newUser.user;
    }

    // 3. Magic Link를 사용하여 세션 생성
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: supabaseUser.email!,
      });
    if (linkError) throw linkError;

    const tokenHash =
      linkData.properties.hashed_token ??
      new URL(linkData.properties.action_link).searchParams.get("token_hash");
    if (!tokenHash) throw new Error("Could not extract magic link token hash.");

    // 4. 서버에서 즉시 토큰 해시로 세션 교환
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const {
      data: { session },
      error: verifyError,
    } = await supabaseClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (verifyError) throw verifyError;

    // 5. 클라이언트에 세션 반환
    return new Response(JSON.stringify(session), {
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
