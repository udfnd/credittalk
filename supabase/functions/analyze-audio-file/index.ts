// supabase/functions/analyze-audio-file/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// 분석할 키워드 목록 (동일)
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

// V2 API에 맞게 수정된 음성 텍스트 변환 함수
async function transcribeAudioWithV2(filePath: string): Promise<string> {
  const gcpProjectId = Deno.env.get("GCP_PROJECT_ID");
  const gcpApiKey = Deno.env.get("GCP_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  // V2 API는 Recognizer를 지정해야 합니다.
  const location = "asia-northeast3"; // Recognizer를 생성한 위치
  const recognizerId = "creditalk-recognizer"; // 사전 준비에서 생성한 Recognizer ID

  if (!gcpProjectId || !gcpApiKey || !supabaseUrl) {
    throw new Error(
      "Missing environment variables: GCP_PROJECT_ID, GCP_API_KEY, or SUPABASE_URL",
    );
  }

  // Storage에 있는 파일의 공개 URL
  const fileUrl = `${supabaseUrl}/storage/v1/object/public/${filePath}`;

  // V2 API 요청 본문. config는 Recognizer에 설정되어 있으므로 uri만 전달합니다.
  const requestBody = {
    audio: {
      uri: fileUrl,
    },
    // V2에서는 config를 recognizer가 대체하므로, 본문이 더 간결해집니다.
    // 필요시 여기에 recognitionFeatures, configMask 등을 추가할 수 있습니다.
  };

  // V2 API 엔드포인트
  const apiUrl = `https://speech.googleapis.com/v2/projects/${gcpProjectId}/locations/${location}/recognizers/${recognizerId}:recognize`;

  const response = await fetch(`${apiUrl}?key=${gcpApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // V2는 'X-Goog-Api-Key' 헤더를 권장하기도 합니다.
      // 'X-Goog-Api-Key': gcpApiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("STT API Error Response:", errorText);
    throw new Error(`Google STT API V2 Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // V2 API의 응답 구조에 맞게 텍스트를 추출합니다.
  const transcription = data.results
    ?.map((result: any) => result.alternatives[0].transcript)
    .join("\n");

  // 분석이 끝나면 파일을 즉시 삭제하여 개인정보를 보호합니다.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(`${supabaseUrl}/storage/v1/object/${filePath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
  });

  return transcription || "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath } = await req.json();
    if (!filePath) {
      throw new Error("Missing 'filePath' in request body");
    }

    const transcribedText = await transcribeAudioWithV2(filePath);

    const detectedKeywords = PHISHING_KEYWORDS.filter((keyword) =>
      transcribedText.includes(keyword),
    );
    const isDetected = detectedKeywords.length > 0;

    return new Response(
      JSON.stringify({
        detected: isDetected,
        keywords: detectedKeywords,
        text: transcribedText,
      }),
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
