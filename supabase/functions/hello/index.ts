// supabase/functions/hello/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve((req) => {
  return new Response("Hello from the edge!", {
    headers: { "Content-Type": "application/json" },
  });
});
