import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Transaction type mappings - Updated with correct DIA API v3 specifications
const MODULE_MAPPINGS = {
  invoice: { 
    method: "scf_fatura_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "toplam_tutar", 
    dateField: "tarih", 
    counterpartyField: "_key_scf_carikart" 
  },
  current_account: { 
    method: "scf_carihesap_fisi_listele_ayrintili",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "borc", 
    dateField: "tarih", 
    counterpartyField: "_key_scf_carikart" 
  },
  bank: { 
    method: "bcs_banka_fisi_listele_ayrintili",
    endpoint: "bcs/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "tutar", 
    dateField: "tarih", 
    counterpartyField: "aciklama" 
  },
  cash: { 
    method: "scf_kasaislemleri_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "tutar", 
    dateField: "tarih", 
    counterpartyField: "aciklama" 
  },
  order: { 
    method: "scf_siparis_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "siparisno", 
    amountField: "toplam_tutar", 
    dateField: "tarih", 
    counterpartyField: "_key_scf_carikart" 
  },
};

async function getValidSession(supabase: any, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("dia_sunucu_adi, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_id, dia_session_expires, dia_firma_kodu, dia_donem_kodu")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile || !profile.dia_session_id) {
    return null;
  }

  const expiresAt = new Date(profile.dia_session_expires);
  if (expiresAt.getTime() - 2 * 60 * 1000 < Date.now()) {
    // Auto refresh session - Using correct DIA API v3 URL and format
    const diaBaseUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
    try {
      const loginResponse = await fetch(diaBaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      const loginResult = await loginResponse.json();
      // DIA returns: { code: "200", msg: "session_id", warnings: [] }
      if (loginResult.code === "200" && loginResult.msg) {
        await supabase
          .from("profiles")
          .update({
            dia_session_id: loginResult.msg,
            dia_session_expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          })
          .eq("id", userId);

        return {
          ...profile,
          dia_session_id: loginResult.msg,
        };
      }
    } catch (e) {
      console.error("[dia-sync] Auto-login failed:", e);
    }
    return null;
  }

  return profile;
}

async function fetchDiaData(profile: any, method: string, endpoint: string) {
  // Using correct DIA API v3 URL structure
  const diaBaseUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/${endpoint}`;

  const payload = {
    [method]: {
      session_id: profile.dia_session_id,
      firma_kodu: profile.dia_firma_kodu,
      donem_kodu: profile.dia_donem_kodu,
      filters: "",
      sorts: "",
      params: "",
      limit: 100,
      offset: 0,
    },
  };

  console.log(`[dia-sync] Calling ${diaBaseUrl} with method: ${method}`);

  const response = await fetch(diaBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log(`[dia-sync] ${method} raw response:`, JSON.stringify(result).substring(0, 500));
  
  return result;
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
    const profile = await getValidSession(supabase, userId);

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "No valid DIA session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncResults: Record<string, any> = {};
    const transactionsToUpsert: any[] = [];

    // Fetch data for each transaction type
    for (const [txType, mapping] of Object.entries(MODULE_MAPPINGS)) {
      try {
        console.log(`[dia-sync] Fetching ${txType} using ${mapping.method}`);
        const result = await fetchDiaData(profile, mapping.method, mapping.endpoint);
        
        // DIA response structure: { method_name: { kayitlar: [...] } } or { method_name: { records: [...] } }
        const methodKey = mapping.method;
        const records = result[methodKey]?.kayitlar || result[methodKey]?.records || result[methodKey]?.data || [];
        
        syncResults[txType] = { count: records.length, success: true };

        // Transform and prepare for upsert
        for (const record of records) {
          const diaKey = String(record[mapping.keyField] || record._key);
          const counterparty = typeof record[mapping.counterpartyField] === "object" 
            ? record[mapping.counterpartyField]?.unvan || record[mapping.counterpartyField]?.aciklama || "Bilinmiyor"
            : record[mapping.counterpartyField] || "Bilinmiyor";

          transactionsToUpsert.push({
            user_id: userId,
            dia_record_id: `${mapping.method}-${diaKey}`,
            transaction_type: txType,
            document_no: record[mapping.docField] || diaKey,
            description: record.aciklama || record.not || `${txType} işlemi`,
            counterparty,
            amount: parseFloat(record[mapping.amountField]) || 0,
            currency: "TRY",
            transaction_date: record[mapping.dateField] || new Date().toISOString().split("T")[0],
            status: "pending",
            dia_raw_data: record,
          });
        }
      } catch (err) {
        console.error(`[dia-sync] Error fetching ${txType}:`, err);
        const errMessage = err instanceof Error ? err.message : "Unknown error";
        syncResults[txType] = { count: 0, success: false, error: errMessage };
      }
    }

    // Upsert all transactions
    if (transactionsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from("pending_transactions")
        .upsert(transactionsToUpsert, {
          onConflict: "user_id,dia_record_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error("[dia-sync] Upsert error:", upsertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: transactionsToUpsert.length,
        details: syncResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[dia-sync] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
