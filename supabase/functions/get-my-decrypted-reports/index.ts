import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

async function decrypt(
  supabaseAdminClient: SupabaseClient,
  value?: string | null,
): Promise<string | null> {
  if (!value) return null;
  try {
    const { data, error } = await supabaseAdminClient.rpc("decrypt_secret", {
      encrypted_data: value,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error("Decryption failed for a value.", e.message);
    return "[복호화 실패]";
  }
}

async function decryptArray(
  supabaseAdminClient: SupabaseClient,
  values?: (string | null)[] | null,
): Promise<(string | null)[]> {
  if (!values || values.length === 0) return [];
  return Promise.all(values.map((v) => decrypt(supabaseAdminClient, v)));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      throw new Error("Forbidden: Missing Authorization header.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration error.");
    }

    const userSupabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error: userError,
    } = await userSupabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: reports, error: fetchError } = await supabaseAdminClient
      .from("scammer_reports")
      .select("*")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch reports: ${fetchError.message}`);
    }

    const decryptedReports = await Promise.all(
      reports.map(async (report) => ({
        ...report,
        name: await decrypt(supabaseAdminClient, report.name),
        phone_numbers: await decryptArray(
          supabaseAdminClient,
          report.phone_numbers,
        ),
        account_number: await decrypt(
          supabaseAdminClient,
          report.account_number,
        ),
      })),
    );

    return new Response(JSON.stringify(decryptedReports), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error.message.includes("Forbidden") ? 403 : 500,
    });
  }
});
