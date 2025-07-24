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

    // 1) 입력 검증
    if (!phone || !/^\d{10,11}$/.test(phone)) {
      throw new Error("올바른 휴대폰 번호를 입력해주세요.");
    }

    // 2) DB 클라이언트 생성
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3) 이미 가입된 번호인지 확인
    const { data: existingUser, error: userCheckError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("phone_number", phone)
      .single();

    if (userCheckError && userCheckError.code !== "PGRST116") {
      // DB 에러 로깅
      console.error("DB 사용자 조회 실패:", userCheckError);
      throw userCheckError;
    }
    if (existingUser) {
      console.error("이미 가입된 번호 요청:", phone);
      throw new Error("이미 가입된 휴대폰 번호입니다.");
    }

    // 4) OTP 생성·해싱
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 5) 이전 OTP 무효화
    const { error: deleteError } = await supabaseAdmin
      .from("phone_verifications")
      .delete()
      .eq("phone", phone);
    if (deleteError) {
      console.error("이전 OTP 삭제 실패:", deleteError);
      // 실패해도 계속 진행
    }

    // 6) 새 OTP 저장
    const { error: insertError } = await supabaseAdmin
      .from("phone_verifications")
      .insert({ phone, hashed_otp: hashedOtp, expires_at: expiresAt });
    if (insertError) {
      console.error("OTP 저장 실패:", insertError);
      throw insertError;
    }

    // 7) Twilio 발송
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioMessagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID")!;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authHeader = "Basic " + btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `+82${phone.replace(/[^0-9]/g, "").substring(1)}`,
        MessagingServiceSid: twilioMessagingServiceSid,
        Body: `[CreditTalk] 인증번호: ${otp}`,
      }),
    });

    if (!response.ok) {
      // 8) Twilio 에러 페이로드 로깅
      const errorBody = await response.json();
      console.error("Twilio Error:", errorBody);
      throw new Error(errorBody.message || "SMS 발송에 실패했습니다.");
    }

    // 9) 성공 응답
    return new Response(
      JSON.stringify({ success: true, message: "인증번호가 발송되었습니다." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    // 10) 최종 에러 로깅 & 상세 메시지 반환
    console.error("❌ send-verification-otp failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
