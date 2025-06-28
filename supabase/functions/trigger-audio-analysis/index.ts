// supabase/functions/trigger-audio-analysis/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Google Cloud 인증 토큰을 생성하는 헬퍼 함수
async function getGoogleAuthToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/pubsub",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${jwtHeader}.${claimSet}`;
  const keyData = atob(serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(keyData, c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const signedJwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Google auth token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { analysisId, filePath } = await req.json();
    if (!analysisId || !filePath) {
      throw new Error("Request body must contain 'analysisId' and 'filePath'.");
    }

    console.log(`[TRIGGER] Received request for analysisId: ${analysisId}`);

    // 2. 환경 변수를 로드합니다.
    const gcpProjectId = Deno.env.get("GCP_PROJECT_ID");
    const pubsubTopic = Deno.env.get("GCP_PUBSUB_TOPIC_ID");
    const googleCredentials = Deno.env.get("GOOGLE_CREDENTIALS");

    if (!gcpProjectId || !pubsubTopic || !googleCredentials) {
      throw new Error("Missing required Google Cloud environment variables (GCP_PROJECT_ID, GCP_PUBSUB_TOPIC_ID, GOOGLE_CREDENTIALS).");
    }

    const authToken = await getGoogleAuthToken(googleCredentials);

    const messagePayload = { analysisId, filePath };
    const pubsubMessage = {
      messages: [{
        data: btoa(JSON.stringify(messagePayload)), // JSON 객체를 Base64로 인코딩
      }],
    };

    const pubsubUrl = `https://pubsub.googleapis.com/v1/projects/${gcpProjectId}/topics/${pubsubTopic}:publish`;
    console.log(`[TRIGGER] Publishing message for analysisId: ${analysisId} to ${pubsubUrl}`);

    const response = await fetch(pubsubUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pubsubMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish message to Pub/Sub: ${errorText}`);
    }

    console.log(`[TRIGGER] Successfully triggered analysis for analysisId: ${analysisId}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[TRIGGER] Critical error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
