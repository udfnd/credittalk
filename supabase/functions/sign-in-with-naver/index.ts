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

    const { id: naverId, email, name, mobile: phoneNumber } = naverUser;
    if (!email) throw new Error("Naver account must have a valid email.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2. 사용자 찾기 또는 생성
    let supabaseUser: User;
    // 이메일로 기존 사용자가 있는지 먼저 확인
    const {
      data: { users },
      error: listError,
    } = await supabaseAdmin.auth.admin.listUsers({ query: email });
    if (listError) throw listError;

    const existingUser = users.find((u) => u.email === email);

    if (existingUser) {
      supabaseUser = existingUser;
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
      const { data: newUser, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true, // 소셜 로그인이므로 이메일은 인증된 것으로 간주
          user_metadata: { full_name: name, provider: "naver" },
        });

      if (signUpError) throw signUpError;

      supabaseUser = newUser.user;

      const { error: profileError } = await supabaseAdmin.from("users").insert({
        auth_user_id: supabaseUser.id,
        name,
        naver_id: naverId,
        // NOT NULL 제약조건을 만족시키기 위한 기본값 삽입
        phone_number: phoneNumber || "social_login",
        national_id: "social_login",
        job_type: "일반",
      });

      if (profileError) {
        // 프로필 생성 실패 시 auth.users에 생성된 유저 롤백
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
        throw profileError;
      }
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: supabaseUser.email!,
      });
    if (linkError) throw linkError;

    // 3-1. 토큰 해시 바로 꺼내기
    const tokenHash =
      linkData.properties.hashed_token ??
      linkData.properties.tokenHash ??
      new URL(linkData.properties.action_link).searchParams.get("token_hash") ??
      new URL(linkData.properties.action_link).searchParams.get("token");
    if (!tokenHash) throw new Error("Could not extract magic link token hash.");

    // 4. (핵심) 서버에서 즉시 토큰 해시로 세션 교환
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
