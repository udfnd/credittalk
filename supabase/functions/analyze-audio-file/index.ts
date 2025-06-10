// supabase/functions/analyze-audio-file/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PHISHING_KEYWORDS = [
  "검찰",
  "경찰",
  "수사관",
  "금융감독원",
  "금감원",
  "대출",
  "상환",
  "명의도용",
  "계좌이체",
  "송금",
  "개인정보",
  "사건",
  "연루",
];

// 동기 방식으로 STT 분석 및 키워드 분석까지 완료하는 함수
async function analyzeAudioSync(filePath: string) {
  console.log(`Starting SYNC transcription for: ${filePath}`);

  const gcpProjectId = Deno.env.get("GCP_PROJECT_ID");
  const gcpApiKey = Deno.env.get("GCP_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const location = "asia-northeast1";
  const recognizerId = "creditalk-recognizer";

  if (!gcpProjectId || !gcpApiKey || !supabaseUrl) {
    throw new Error("Missing critical environment variables");
  }

  const fileUrl = `${supabaseUrl}/storage/v1/object/public/${filePath}`;

  // ## 수정된 부분 1: 요청 본문에서 recognizer 필드 제거 ##
  // URL에서 Recognizer를 직접 지정하므로, 본문에서는 불필요합니다.
  const requestBody = {
    // recognizer 필드 제거
    uri: fileUrl,
    config: {
      features: {
        enableAutomaticPunctuation: true,
      },
    },
  };

  // ## 수정된 부분 2: API 엔드포인트를 리전별 엔드포인트로 변경 ##
  // 'asia-northeast1' 리전의 Recognizer를 사용하므로, API 호스트네임에 해당 리전을 명시해야 합니다.
  const apiUrl = `https://${location}-speech.googleapis.com/v2/projects/${gcpProjectId}/locations/${location}/recognizers/${recognizerId}:recognize`;

  console.log(`Sending SYNC request to Google STT API: ${apiUrl}`);
  const response = await fetch(`${apiUrl}?key=${gcpApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  console.log(`Received SYNC response from Google. Status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("STT API SYNC Error Response:", errorText);
    throw new Error(`Google STT API V2 Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const transcribedText =
    data.results
      ?.map((result: any) => result.alternatives[0].transcript)
      .join("\n") || "";

  console.log("Transcription complete. Analyzing keywords...");

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey) {
    await fetch(`${supabaseUrl}/storage/v1/object/${filePath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      },
    });
    console.log(`Deleted file from storage: ${filePath}`);
  }

  const detectedKeywords = PHISHING_KEYWORDS.filter((keyword) =>
    transcribedText.includes(keyword),
  );
  const isDetected = detectedKeywords.length > 0;

  return {
    detected: isDetected,
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
    if (!filePath) {
      throw new Error("Missing 'filePath' in request body");
    }

    const analysisResult = await analyzeAudioSync(filePath);

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
