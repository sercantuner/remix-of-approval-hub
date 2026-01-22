import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DiaApiRequest {
  action: "list" | "list_detail" | "create" | "update" | "delete" | "approve" | "reject";
  module: string; // e.g., "scf_fatura", "scf_carihesap_fisi", "bcs_bankahesap_fisi"
  filters?: Array<{ field: string; operator: string; value: string }>;
  sorts?: Array<{ field: string; sorttype: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  data?: Record<string, unknown>;
  recordKey?: string;
  transactionType?: string; // For list_detail action
}

interface DiaSession {
  session_id: string;
  sunucu_adi: string;
  firma_kodu: number;
  donem_kodu: number;
  api_key: string;
  ws_kullanici: string;
  ws_sifre: string;
}

// Operator mapping from frontend to DIA
const operatorMap: Record<string, string> = {
  equals: "",
  not_equals: "!",
  contains: "*",
  starts_with: "...%",
  greater_than: ">",
  less_than: "<",
  greater_equal: ">=",
  less_equal: "<=",
  is_null: "NULL",
  is_not_null: "!NULL",
};

// Detail method mapping for each transaction type
interface DetailMethodConfig {
  method: string;
  endpoint: string;
  useKeyParam?: boolean; // Use "key" param instead of filters
  params?: Record<string, unknown>;
}

const DETAIL_METHOD_MAPPING: Record<string, DetailMethodConfig> = {
  order: { method: "scf_siparis_listele_ayrintili", endpoint: "scf" },
  invoice: { method: "scf_fatura_getir", endpoint: "scf", useKeyParam: true },
  bank: { method: "bcs_banka_fisi_listele", endpoint: "bcs" },
  current_account: { method: "scf_carihesap_fisi_listele", endpoint: "scf" },
  cash: { 
    method: "scf_kasakart_hareket_listele", 
    endpoint: "scf",
    params: { 
      cari: "True", 
      banka: "False", 
      kasa: "False", 
      otel: "False", 
      fatura: "False", 
      ceksenet: "False" 
    }
  },
  check_note: { method: "bcs_ceksenet_listele", endpoint: "bcs" }
};

async function getValidSession(supabase: any, userId: string): Promise<DiaSession | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("dia_sunucu_adi, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_id, dia_session_expires, dia_firma_kodu, dia_donem_kodu")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    console.error("[dia-api] Failed to get profile:", error);
    return null;
  }

  if (!profile.dia_session_id || !profile.dia_sunucu_adi) {
    return null;
  }

  // Check if session is expired (with 2 min buffer)
  const expiresAt = new Date(profile.dia_session_expires);
  const bufferTime = 2 * 60 * 1000; // 2 minutes
  
  if (expiresAt.getTime() - bufferTime < Date.now()) {
    console.log("[dia-api] Session expired or expiring soon, need to refresh");
    
    // Auto-login to get new session - Using correct DIA API v3 URL and format
    const diaBaseUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
    const loginPayload = {
      login: {
        username: profile.dia_ws_kullanici,
        password: profile.dia_ws_sifre,
        disconnect_same_user: true,
        lang: "tr",
        params: {
          apikey: profile.dia_api_key,
          firma_kodu: profile.dia_firma_kodu,
          donem_kodu: profile.dia_donem_kodu,
        },
      },
    };

    try {
      const loginResponse = await fetch(diaBaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginPayload),
      });

      const loginResult = await loginResponse.json();
      
      // DIA returns: { code: "200", msg: "session_id", warnings: [] }
      if (loginResult.code === "200" && loginResult.msg) {
        const newSessionId = loginResult.msg;
        const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        await supabase
          .from("profiles")
          .update({
            dia_session_id: newSessionId,
            dia_session_expires: newExpiresAt,
          })
          .eq("id", userId);

        return {
          session_id: newSessionId,
          sunucu_adi: profile.dia_sunucu_adi,
          firma_kodu: profile.dia_firma_kodu,
          donem_kodu: profile.dia_donem_kodu,
          api_key: profile.dia_api_key,
          ws_kullanici: profile.dia_ws_kullanici,
          ws_sifre: profile.dia_ws_sifre,
        };
      }
    } catch (e) {
      console.error("[dia-api] Auto-login failed:", e);
      return null;
    }

    return null;
  }

  return {
    session_id: profile.dia_session_id,
    sunucu_adi: profile.dia_sunucu_adi,
    firma_kodu: profile.dia_firma_kodu,
    donem_kodu: profile.dia_donem_kodu,
    api_key: profile.dia_api_key,
    ws_kullanici: profile.dia_ws_kullanici,
    ws_sifre: profile.dia_ws_sifre,
  };
}

function buildDiaPayload(
  action: string,
  module: string,
  session: DiaSession,
  request: DiaApiRequest
): Record<string, unknown> {
  const methodSuffix = action === "list" ? "_listele" : 
                       action === "create" ? "_ekle" :
                       action === "update" ? "_guncelle" :
                       action === "delete" ? "_sil" : "_listele";

  const methodName = `${module}${methodSuffix}`;

  if (action === "list") {
    const filters = request.filters?.map(f => ({
      field: f.field,
      operator: operatorMap[f.operator] || f.operator,
      value: f.value,
    })) || [];

    return {
      [methodName]: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        filters,
        sorts: request.sorts || [],
        limit: request.limit || 100,
        offset: request.offset || 0,
      },
    };
  }

  if (action === "create" || action === "update") {
    return {
      [methodName]: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        kart: request.data,
      },
    };
  }

  if (action === "delete") {
    return {
      [methodName]: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        _key: request.recordKey,
      },
    };
  }

  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const request: DiaApiRequest = await req.json();

    // Get valid session
    const session = await getValidSession(supabase, userId);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "No valid DIA session. Please login to DIA first." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle list_detail action separately
    if (request.action === "list_detail") {
      const transactionType = request.transactionType;
      const recordKey = request.recordKey;

      if (!transactionType || !recordKey) {
        return new Response(
          JSON.stringify({ error: "transactionType and recordKey are required for list_detail" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const detailConfig = DETAIL_METHOD_MAPPING[transactionType];
      if (!detailConfig) {
        return new Response(
          JSON.stringify({ error: `Unknown transaction type: ${transactionType}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const diaDetailUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/${detailConfig.endpoint}/json`;
      
      // Build detail payload - use key param for some methods, filters for others
      let detailPayload: Record<string, unknown>;
      
      if (detailConfig.useKeyParam) {
        // Use key parameter directly (e.g., scf_fatura_getir)
        detailPayload = {
          [detailConfig.method]: {
            session_id: session.session_id,
            firma_kodu: session.firma_kodu,
            donem_kodu: session.donem_kodu,
            key: recordKey,
            params: detailConfig.params || "",
          },
        };
      } else {
        // Use filters with _key field
        detailPayload = {
          [detailConfig.method]: {
            session_id: session.session_id,
            firma_kodu: session.firma_kodu,
            donem_kodu: session.donem_kodu,
            filters: [{ field: "_key", operator: "", value: recordKey }],
            sorts: "",
            params: detailConfig.params || "",
            limit: 1,
            offset: 0,
          },
        };
      }

      console.log(`[dia-api] Fetching detail from ${diaDetailUrl} for ${transactionType}, key: ${recordKey}`);

      const detailResponse = await fetch(diaDetailUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailPayload),
      });

      const detailResult = await detailResponse.json();
      
      return new Response(JSON.stringify(detailResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine the correct API endpoint based on module - Using DIA API v3
    const moduleParts = request.module.split("_");
    const modulePrefix = moduleParts[0]; // e.g., "scf", "bcs", "sis"
    const diaBaseUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/${modulePrefix}/json`;

    // Build DIA payload
    const diaPayload = buildDiaPayload(request.action, request.module, session, request);
    
    console.log(`[dia-api] Calling ${diaBaseUrl} with action: ${request.action}, module: ${request.module}`);

    // Call DIA API
    const diaResponse = await fetch(diaBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(diaPayload),
    });

    const diaResult = await diaResponse.json();
    
    // Check for INVALID_SESSION error and retry once
    if (diaResult.error?.code === "INVALID_SESSION") {
      console.log("[dia-api] Got INVALID_SESSION, clearing session and retrying...");
      
      // Clear session
      await supabase
        .from("profiles")
        .update({ dia_session_id: null, dia_session_expires: null })
        .eq("id", userId);

      // Try to get new session
      const newSession = await getValidSession(supabase, userId);
      if (newSession) {
        const retryPayload = buildDiaPayload(request.action, request.module, newSession, request);
        const retryResponse = await fetch(diaBaseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retryPayload),
        });
        const retryResult = await retryResponse.json();
        return new Response(JSON.stringify(retryResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: "Session expired. Please login again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(diaResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dia-api] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
