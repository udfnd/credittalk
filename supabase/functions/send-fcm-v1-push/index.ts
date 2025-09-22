// supabase/functions/send-fcm-v1-push/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const SERVICE_ACCOUNT = JSON.parse(
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!,
);
const ANDROID_CHANNEL_ID = 'push_default_v2';
const CHUNK_SIZE = 100;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    global: {
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

async function importPrivateKey(pkcs8Pem: string) {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = pkcs8Pem
    .substring(pemHeader.length, pkcs8Pem.length - pemFooter.length - 1)
    .replace(/\s/g, '');
  const binaryDer = new Uint8Array(
    atob(pemContents)
      .split('')
      .map(c => c.charCodeAt(0)),
  );
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign'],
  );
}

async function getAccessToken() {
  const key = await importPrivateKey(SERVICE_ACCOUNT.private_key);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: SERVICE_ACCOUNT.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    key,
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  return data.access_token;
}

function normalizeDataPayload(
  data?: Record<string, unknown> | null,
): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

Deno.serve(async req => {
  const { user_ids, title, body, data, notification } = await req.json();

  if (!user_ids || !user_ids.length) {
    return new Response(JSON.stringify({ error: 'Missing user_ids' }), {
      status: 400,
    });
  }

  const allDeviceTokens: { token: string; platform: string }[] = [];

  for (let i = 0; i < user_ids.length; i += CHUNK_SIZE) {
    const chunk = user_ids.slice(i, i + CHUNK_SIZE);

    const { data: deviceTokensChunk, error } = await supabaseAdmin
      .from('device_push_tokens')
      .select('token, platform')
      .in('user_id', chunk)
      .eq('enabled', true);

    if (error) {
      console.error(
        `Error fetching push tokens for chunk ${i / CHUNK_SIZE}:`,
        error.message,
      );
      continue;
    }

    if (deviceTokensChunk) {
      allDeviceTokens.push(...deviceTokensChunk);
    }
  }

  if (allDeviceTokens.length === 0) {
    console.log(
      `No valid push tokens found for any of the ${user_ids.length} users.`,
    );
    return new Response(JSON.stringify({ message: 'No valid tokens found' }), {
      status: 200,
    });
  }

  try {
    const accessToken = await getAccessToken();
    const FCM_API_URL = `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`;
    const deadTokens: string[] = [];
    const fcmResults = [];

    const isDataOnly = !notification && !title && !body;

    for (const { token, platform } of allDeviceTokens) {
      const messagePayload: any = {
        token,
        data: normalizeDataPayload(data),
        android: {
          priority: 'HIGH' as const,
        },
        apns: {
          payload: {
            aps: {
              'content-available': 1,
            },
          },
        },
      };

      if (!isDataOnly) {
        messagePayload.notification = { title, body };
        messagePayload.android.notification = {
          channel_id: ANDROID_CHANNEL_ID,
        };
        delete messagePayload.apns.payload.aps['content-available'];
      }

      const res = await fetch(FCM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: messagePayload }),
      });

      const resultBody = await res.json();
      fcmResults.push({ token, status: res.status, body: resultBody });
      if (!res.ok) {
        const errorCode = resultBody?.error?.status;
        if (
          errorCode === 'UNREGISTERED' ||
          res.status === 404 ||
          errorCode === 'INVALID_ARGUMENT'
        )
          deadTokens.push(token);
      }
    }

    console.log(
      'FCM Send Results (first 5):',
      JSON.stringify(fcmResults.slice(0, 5), null, 2),
    );

    if (deadTokens.length > 0) {
      await supabaseAdmin
        .from('device_push_tokens')
        .update({ enabled: false })
        .in('token', deadTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_tokens_found: allDeviceTokens.length,
        results_count: fcmResults.length,
        dead_tokens_count: deadTokens.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('FCM Main Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
