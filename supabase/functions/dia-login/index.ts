import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DiaLoginRequest {
  sunucuAdi: string;
  apiKey: string;
  wsKullanici: string;
  wsSifre: string;
  firmaKodu: number;
  donemKodu: number;
}

interface DiaLoginResponse {
  success: boolean;
  session_id?: string;
  expires?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const body: DiaLoginRequest = await req.json();
    const { sunucuAdi, apiKey, wsKullanici, wsSifre, firmaKodu, donemKodu } = body;

    // Validate required fields
    if (!sunucuAdi || !apiKey || !wsKullanici || !wsSifre) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build DIA API URL
    const diaBaseUrl = `https://${sunucuAdi}.dia.com.tr/api/sis/json`;

    // Create DIA login request
    const diaLoginPayload = {
      login: {
        api_key: apiKey,
        kullanici: wsKullanici,
        sifre: wsSifre,
        firma_kodu: firmaKodu,
        donem_kodu: donemKodu,
      },
    };

    console.log(`[dia-login] Attempting login to ${diaBaseUrl}`);

    // Call DIA API
    const diaResponse = await fetch(diaBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(diaLoginPayload),
    });

    const diaResult = await diaResponse.json();
    console.log("[dia-login] DIA response:", JSON.stringify(diaResult));

    // Check for successful login
    if (diaResult.login?.session_id) {
      const sessionId = diaResult.login.session_id;
      // DIA sessions typically expire in 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Save session to profiles
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          dia_sunucu_adi: sunucuAdi,
          dia_api_key: apiKey,
          dia_ws_kullanici: wsKullanici,
          dia_ws_sifre: wsSifre,
          dia_session_id: sessionId,
          dia_session_expires: expiresAt,
          dia_firma_kodu: firmaKodu,
          dia_donem_kodu: donemKodu,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("[dia-login] Failed to save session:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to save session", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const response: DiaLoginResponse = {
        success: true,
        session_id: sessionId,
        expires: expiresAt,
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Login failed
      const errorMessage = diaResult.error?.message || diaResult.login?.error || "DIA login failed";
      console.error("[dia-login] DIA login failed:", errorMessage);
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[dia-login] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
