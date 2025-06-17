import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// 6자리 숫자 OTP 생성
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// OTP 해싱 (SHA-256 사용)
async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    if (!phone || !/^\d{10,11}$/.test(phone)) {
      throw new Error("올바른 휴대폰 번호를 입력해주세요.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. 이미 가입된 번호인지 확인
    const { data: existingUser, error: userCheckError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("phone_number", phone)
      .single();

    if (userCheckError && userCheckError.code !== "PGRST116")
      throw userCheckError;
    if (existingUser) throw new Error("이미 가입된 휴대폰 번호입니다.");

    // 2. OTP 생성 및 해싱
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

    // 3. 이전 OTP 무효화 (선택적이지만 권장)
    await supabaseAdmin.from("phone_verifications").delete().eq("phone", phone);

    // 4. DB에 해시된 OTP 저장
    const { error: dbError } = await supabaseAdmin
      .from("phone_verifications")
      .insert({
        phone,
        hashed_otp: hashedOtp,
        expires_at: expiresAt.toISOString(),
      });

    if (dbError) throw dbError;

    // 5. Twilio를 통해 SMS 발송
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioMessagingServiceSid = Deno.env.get(
      "TWILIO_MESSAGING_SERVICE_SID",
    );

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authHeader =
      "Basic " + btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `+82${phone.substring(1)}`, // 국가 코드 +82로 변환
        MessagingServiceSid: twilioMessagingServiceSid!,
        Body: `[CreditTalk] 인증번호: ${otp}`,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error("Twilio Error:", errorBody);
      throw new Error("SMS 발송에 실패했습니다.");
    }

    return new Response(
      JSON.stringify({ success: true, message: "인증번호가 발송되었습니다." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
