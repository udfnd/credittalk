import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Google Cloud 인증 및 Pub/Sub 클라이언트 라이브러리는 Deno에서 직접 지원되지 않으므로,
// REST API를 사용하여 직접 호출합니다.

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

  const keyData = atob(serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, ""));

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

  if (!response.ok) throw new Error("Failed to get Google auth token.");

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { analysisId, filePath } = await req.json();
    if (!analysisId || !filePath) throw new Error("Missing analysisId or filePath");

    const gcpProjectId = Deno.env.get("GCP_PROJECT_ID");
    const pubsubTopic = Deno.env.get("GCP_PUBSUB_TOPIC_ID");
    const googleCredentials = Deno.env.get("GOOGLE_CREDENTIALS");

    if (!gcpProjectId || !pubsubTopic || !googleCredentials) {
      throw new Error("Missing Google Cloud environment variables.");
    }

    const authToken = await getGoogleAuthToken(googleCredentials);

    const message = {
      messages: [{
        data: btoa(JSON.stringify({ analysisId, filePath })),
      }],
    };

    const pubsubUrl = `https://pubsub.googleapis.com/v1/projects/${gcpProjectId}/topics/${pubsubTopic}:publish`;

    const response = await fetch(pubsubUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pub/Sub publish error:", errorText);
      throw new Error("Failed to publish message to Pub/Sub.");
    }

    return new Response(JSON.stringify({ success: true, message: "Analysis triggered." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
