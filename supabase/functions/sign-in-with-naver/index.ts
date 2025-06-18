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

    // 2. 사용자 찾기 또는 생성 (이전 로직과 유사)
    let supabaseUser: User;
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("auth_user_id")
      .eq("naver_id", naverId)
      .single();

    if (userProfile) {
      const { data: userResult, error } =
        await supabaseAdmin.auth.admin.getUserById(userProfile.auth_user_id);
      if (error) throw error;
      supabaseUser = userResult.user;
    } else {
      const { data: newUser, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: { full_name: name, provider: "naver" },
        });

      if (signUpError) {
        if (signUpError.message.includes("duplicate key value")) {
          const {
            data: { users },
            error: listError,
          } = await supabaseAdmin.auth.admin.listUsers({ query: email });
          if (listError) throw listError;
          const foundUser = users.find((u) => u.email === email);
          if (!foundUser) throw new Error("User exists but not found.");
          supabaseUser = foundUser;
          await supabaseAdmin
            .from("users")
            .update({ naver_id: naverId })
            .eq("auth_user_id", supabaseUser.id);
        } else {
          throw signUpError;
        }
      } else {
        supabaseUser = newUser.user;
        const { error: profileError } = await supabaseAdmin
          .from("users")
          .insert({
            auth_user_id: supabaseUser.id,
            name,
            naver_id: naverId,
            phone_number: "social_login",
            national_id: "social_login",
            job_type: "일반",
          });
        if (profileError) {
          await supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
          throw profileError;
        }
      }
    }

    // 3. Magic Link 생성
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: supabaseUser.email!,
      });
    if (linkError) throw linkError;

    const magicToken = new URL(
      linkData.properties.action_link,
    ).searchParams.get("token");
    if (!magicToken) throw new Error("Could not extract magic link token.");

    // 4. (핵심) 서버에서 즉시 토큰을 세션으로 교환
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!, // ANONYMOUS KEY 사용
    );

    const { data: sessionData, error: verifyError } =
      await supabaseClient.auth.verifyOtp({
        email: supabaseUser.email!,
        token: magicToken,
        type: "magiclink",
      });
    if (verifyError) throw verifyError;

    // 5. 클라이언트에게 완전한 세션(access_token, refresh_token 포함) 반환
    return new Response(JSON.stringify(sessionData.session), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
