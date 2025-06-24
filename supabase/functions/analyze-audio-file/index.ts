// supabase/functions/analyze-audio-file/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PHISHING_KEYWORDS = [
  "압수수색",
  "압수수색영장",
  "영장발부",
  "압수",
  "도주우려",
  "증거인멸우려",
  "긴급체포",
  "체포영장",
  "구속영장",
  "범죄수익금",
  "불법대출",
  "금감원",
  "금융위원회",
  "수사관",
  "경찰",
  "경찰청",
  "국세청",
  "캐피탈",
  "대출회사",
  "은행",
  "원금보장",
  "국가계좌",
  "안전계좌",
  "돈을 옮겨놓으세요",
  "기소중지",
  "수배자",
  "용의자",
  "아무에게도 말하면 안됩니다",
  "폰지사기",
  "투자사기",
  "코인 올라간다",
  "주식 올라간다",
  "비상장주식",
  "상장된다",
  "개인정보유출",
  "직원에게 돈 전달하세요",
  "계좌임대",
  "대출작업",
  "신용작업",
  "한도 올려서",
  "작대",
  "감금",
  "명의도용",
  "통장대여",
  "계좌대여",
  "통장양도",
  "계좌양도",
  "체크카드 만들어 주세요",
  "체크카드 보내주세요",
  "계좌 만들어주세요",
  "유심 만들어주세요",
  "유심 삽니다",
  "핸드폰 만들어주세요",
  "검거",
  "작업대출",
  "검찰청",
  "도박사이트",
  "환전",
  "바카라",
  "토토",
  "돈세탁",
  "중고나라사기검거",
  "보이스피싱검거",
  "대포통장",
  "대포폰",
  "죽인다",
  "죽여줄게",
  "개인돈",
  "일수",
  "불법사금융",
  "추심",
  "연장비",
  "저금리대출",
  "대환대출",
  "대출상환",
  "돈전달",
  "금융거래법위반",
  "전자금융거래법위반",
  "납치",
  "싼 이자",
  "범죄조직",
  "범죄활동",
  "범행계좌",
  "쇼핑몰주문서작성알바",
  "장집",
  "장주",
  "핑돈",
  "성매매",
  "영상 퍼뜨리겠다",
  "현김수거책",
  "고수익알바",
  "통장 잠군다",
  "계좌 묶는다",
  "계좌 잠궈줄게",
  "통장 잠궈줄게",
  "선불유심매입",
  "계좌매입",
  "통장매입",
  "사진뿌린다",
];

async function getAccessToken(credentialsJson: string): Promise<string> {
  const credentials = JSON.parse(credentialsJson);
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const toSign = `${btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.${btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const keyData = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const keyBuffer = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(toSign),
  );

  const signedJwt = `${toSign}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(
      `Failed to get access token: ${tokenResponse.status} ${errorBody}`,
    );
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function analyzeAudio(filePath: string) {
  console.log(
    `[DEBUG-SERVER] 1. analyzeAudio 함수 시작. filePath: ${filePath}`,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const gcpProjectId = Deno.env.get("GCP_PROJECT_ID")!;
  const googleCredentialsJson = Deno.env.get("GOOGLE_CREDENTIALS")!;
  const location = "asia-northeast1";
  const recognizerId = "creditalk-recognizer";
  const bucketName = "voice-analysis";

  // 1. Supabase Admin 클라이언트로 파일 다운로드
  console.log("[DEBUG-SERVER] 2. Supabase Storage에서 파일 다운로드 시도...");
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: blob, error: downloadError } = await supabaseAdmin.storage
    .from(bucketName)
    .download(filePath);

  if (downloadError) {
    console.error("[DEBUG-SERVER] 2-1. 파일 다운로드 에러:", downloadError);
    throw new Error(`Storage download error: ${downloadError.message}`);
  }
  if (!blob) {
    console.error("[DEBUG-SERVER] 2-1. 파일이 스토리지에 존재하지 않음.");
    throw new Error("File not found in storage.");
  }
  console.log("[DEBUG-SERVER] 2. 파일 다운로드 성공. Blob size:", blob.size);

  const audioArrayBuffer = await blob.arrayBuffer();
  const audioBase64 = arrayBufferToBase64(audioArrayBuffer);
  console.log(
    "[DEBUG-SERVER] 2-2. 오디오 파일을 Base64로 인코딩 완료. Length:",
    audioBase64.length,
  );

  // 2. 서비스 계정으로 Access Token 발급
  console.log("[DEBUG-SERVER] 3. Google Cloud Access Token 발급 시도...");
  const accessToken = await getAccessToken(googleCredentialsJson);
  console.log("[DEBUG-SERVER] 3. Access Token 발급 성공.");

  // 3. Google STT API에 요청
  const requestBody = {
    content: audioBase64,
    config: { features: { enableAutomaticPunctuation: true } },
  };

  const apiUrl = `https://${location}-speech.googleapis.com/v2/projects/${gcpProjectId}/locations/${location}/recognizers/${recognizerId}:recognize`;
  console.log(`[DEBUG-SERVER] 4. Google STT API 요청 전송. URL: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[DEBUG-SERVER] 4-1. STT API 에러 응답:", errorText);
    throw new Error(`Google STT API V2 Error: ${response.status} ${errorText}`);
  }
  console.log("[DEBUG-SERVER] 4. STT API 요청 성공. Status:", response.status);

  const data = await response.json();
  const transcribedText =
    data.results
      ?.map((result: any) => result.alternatives[0].transcript)
      .join("\n") || "";
  console.log("[DEBUG-SERVER] 5. 텍스트 변환 결과:", transcribedText);

  // 4. 분석 후 파일 삭제
  console.log(`[DEBUG-SERVER] 6. 분석 완료된 파일 삭제 시도: ${filePath}`);
  const { error: removeError } = await supabaseAdmin.storage
    .from(bucketName)
    .remove([filePath]);
  if (removeError) {
    console.error("[DEBUG-SERVER] 6-1. 파일 삭제 에러:", removeError.message);
    // 참고: 파일 삭제 실패는 치명적이지 않으므로 에러를 던지지 않고 로그만 남길 수 있습니다.
  } else {
    console.log("[DEBUG-SERVER] 6. 파일 삭제 성공.");
  }

  const detectedKeywords = PHISHING_KEYWORDS.filter((keyword) =>
    transcribedText.includes(keyword),
  );
  console.log("[DEBUG-SERVER] 7. 키워드 분석 결과:", detectedKeywords);

  return {
    detected: detectedKeywords.length > 0,
    keywords: detectedKeywords,
    text: transcribedText,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath } = await req.json();
    console.log("[DEBUG-SERVER] 함수 시작. 요청 body:", { filePath });
    if (!filePath) throw new Error("Missing 'filePath' in request body");

    const analysisResult = await analyzeAudio(filePath);

    console.log("[DEBUG-SERVER] 최종 분석 결과 반환:", analysisResult);
    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[DEBUG-SERVER] 핸들러 전체 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath } = await req.json();
    if (!filePath) throw new Error("Missing 'filePath' in request body");

    const analysisResult = await analyzeAudio(filePath);

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in main SYNC handler:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
