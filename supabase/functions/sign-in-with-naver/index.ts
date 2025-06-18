import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.2/mod.ts";

// CryptoKey 생성을 위한 헬퍼 함수
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const keyBuf = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { naver_token } = await req.json();
    if (!naver_token) {
      throw new Error("Naver access token is required.");
    }

    // 1. 네이버 API를 호출하여 사용자 정보 가져오기
    const naverUserRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: {
        Authorization: `Bearer ${naver_token}`,
      },
    });

    if (!naverUserRes.ok) {
      throw new Error(
        `Failed to fetch Naver user profile: ${await naverUserRes.text()}`,
      );
    }

    const naverUser = await naverUserRes.json();

    // 네이버 응답에서 필수 정보 추출
    const { id: naverId, email, name } = naverUser.response;
    if (!naverId) {
      throw new Error("Naver user ID not found in the response.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2. Supabase에서 기존 사용자 찾기 (auth.users의 메타데이터 기준)
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("auth_user_id")
      .eq("naver_id", naverId) // public.users 테이블에 naver_id 컬럼이 필요합니다.
      .single();

    let supabaseUserId: string;

    if (userError && userError.code !== "PGRST116") {
      throw userError;
    }

    if (existingUser) {
      supabaseUserId = existingUser.auth_user_id;
    } else {
      // 3. 신규 사용자 생성
      const { data: newUser, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true, // 네이버에서 이미 이메일 인증을 완료했다고 가정
          user_metadata: {
            full_name: name,
            provider: "naver",
            // raw_user_meta_data에 provider 정보를 저장하는 것이 더 표준적일 수 있습니다.
          },
        });

      if (signUpError) {
        // 이미 이메일이 존재하지만 네이버 연동이 안된 경우 처리
        if (
          signUpError.message.includes(
            "duplicate key value violates unique constraint",
          )
        ) {
          return new Response(
            JSON.stringify({
              error:
                "이미 가입된 이메일입니다. 이메일로 로그인 후 계정을 연동해주세요.",
            }),
            {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        throw signUpError;
      }

      if (!newUser?.user) throw new Error("Failed to create Supabase user.");
      supabaseUserId = newUser.user.id;

      // public.users 테이블에도 프로필 정보 생성
      const { error: profileError } = await supabaseAdmin.from("users").insert({
        auth_user_id: supabaseUserId,
        name: name,
        naver_id: naverId, // 계정 연결을 위해 네이버 ID 저장
        // 소셜 로그인이므로 나머지 필수값은 기본값 또는 빈 값으로 처리
        phone_number: "social_login",
        national_id: "social_login",
        job_type: "일반", // 기본값
      });
      if (profileError) {
        // 롤백: auth.users에서 방금 생성한 유저 삭제
        await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
        throw profileError;
      }
    }

    // 4. Custom Supabase JWT 생성
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not set in environment variables.");
    }
    const key = await getCryptoKey(jwtSecret);

    const customToken = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: supabaseUserId,
        aud: "authenticated",
        role: "authenticated",
        exp: getNumericDate(60 * 60), // 1시간 후 만료
      },
      key,
    );

    return new Response(JSON.stringify({ access_token: customToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
