import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Transaction type mappings
const MODULE_MAPPINGS = {
  invoice: { module: "scf_fatura", keyField: "_key", docField: "fisno", amountField: "toplam_tutar", dateField: "tarih", counterpartyField: "_key_scf_carikart" },
  current_account: { module: "scf_carihesap_fisi", keyField: "_key", docField: "fisno", amountField: "borc", dateField: "tarih", counterpartyField: "_key_scf_carikart" },
  bank: { module: "bcs_bankahesap_fisi", keyField: "_key", docField: "fisno", amountField: "tutar", dateField: "tarih", counterpartyField: "aciklama" },
  cash: { module: "bcs_kasahesap_fisi", keyField: "_key", docField: "fisno", amountField: "tutar", dateField: "tarih", counterpartyField: "aciklama" },
  check_note: { module: "bcs_cek", keyField: "_key", docField: "cekno", amountField: "tutar", dateField: "vade", counterpartyField: "_key_scf_carikart" },
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
    // Auto refresh session
    const diaBaseUrl = `https://${profile.dia_sunucu_adi}.dia.com.tr/api/sis/json`;
    try {
      const loginResponse = await fetch(diaBaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: {
            api_key: profile.dia_api_key,
            kullanici: profile.dia_ws_kullanici,
            sifre: profile.dia_ws_sifre,
            firma_kodu: profile.dia_firma_kodu,
            donem_kodu: profile.dia_donem_kodu,
          },
        }),
      });

      const loginResult = await loginResponse.json();
      if (loginResult.login?.session_id) {
        await supabase
          .from("profiles")
          .update({
            dia_session_id: loginResult.login.session_id,
            dia_session_expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          })
          .eq("id", userId);

        return {
          ...profile,
          dia_session_id: loginResult.login.session_id,
        };
      }
    } catch (e) {
      console.error("[dia-sync] Auto-login failed:", e);
    }
    return null;
  }

  return profile;
}

async function fetchDiaData(profile: any, module: string, filters: any[] = []) {
  const moduleParts = module.split("_");
  const modulePrefix = moduleParts[0];
  const diaBaseUrl = `https://${profile.dia_sunucu_adi}.dia.com.tr/api/${modulePrefix}/json`;

  const payload = {
    [`${module}_listele`]: {
      session_id: profile.dia_session_id,
      firma_kodu: profile.dia_firma_kodu,
      donem_kodu: profile.dia_donem_kodu,
      filters,
      sorts: [{ field: "tarih", sorttype: "DESC" }],
      limit: 100,
      offset: 0,
    },
  };

  const response = await fetch(diaBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.json();
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
        console.log(`[dia-sync] Fetching ${txType} from ${mapping.module}`);
        const result = await fetchDiaData(profile, mapping.module);
        
        const methodKey = `${mapping.module}_listele`;
        const records = result[methodKey]?.kayitlar || result[methodKey]?.records || [];
        
        syncResults[txType] = { count: records.length, success: true };

        // Transform and prepare for upsert
        for (const record of records) {
          const diaKey = String(record[mapping.keyField] || record._key);
          const counterparty = typeof record[mapping.counterpartyField] === "object" 
            ? record[mapping.counterpartyField]?.unvan || record[mapping.counterpartyField]?.aciklama || "Bilinmiyor"
            : record[mapping.counterpartyField] || "Bilinmiyor";

          transactionsToUpsert.push({
            user_id: userId,
            dia_record_id: `${mapping.module}-${diaKey}`,
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
