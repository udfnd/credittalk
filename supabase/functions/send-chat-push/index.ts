/**
 * Chat is disabled in the current Android application and its database trigger
 * has been removed. Keep this legacy slug fail-closed so it can never bypass
 * the canonical durable push pipeline if deployed accidentally.
 */

Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: 'Chat push is disabled. Use the canonical push outbox if chat is re-enabled.',
    }),
    {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    },
  )
);
