import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Transaction type mappings - Updated with correct DIA API v3 field names from actual responses
interface ModuleMapping {
  method: string;
  endpoint: string;
  keyField: string;
  docField: string;
  amountField: string;
  dateField: string;
  counterpartyField: string;
  codeField: string | null;
  approvalField?: string;
  groupField?: string;  // Aynı değere sahip kayıtları gruplandırmak için
}

const MODULE_MAPPINGS: Record<string, ModuleMapping> = {
  invoice: { 
    method: "scf_fatura_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "belgeno2",  // belgeno2 alanını kullan (resmi fatura numarası)
    amountField: "net",
    dateField: "tarih", 
    counterpartyField: "unvan",
    codeField: "__carikartkodu"
  },
  current_account: { 
    method: "scf_carihesap_fisi_listele_ayrintili",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "borc", 
    dateField: "tarih", 
    counterpartyField: "cariunvan",
    codeField: "carikodu",
    groupField: "_key_scf_carihesap_fisi"  // Aynı fiş key'ine sahip satırları grupla
  },
  bank: { 
    method: "bcs_banka_fisi_listele_ayrintili",  // Ayrıntılı listele - her hareket ayrı satır
    endpoint: "bcs/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "tutar", 
    dateField: "tarih", 
    counterpartyField: "aciklama",
    codeField: null
  },
  cash: { 
    method: "scf_kasaislemleri_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "tutar", 
    dateField: "tarih", 
    counterpartyField: "aciklama",
    codeField: null
  },
  order: { 
    method: "scf_siparis_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "siparisno", 
    amountField: "net",  // net tutarı kullan
    dateField: "tarih", 
    counterpartyField: "unvan",  // unvan alanından al
    codeField: "__carikodu",
    approvalField: "onay_txt"
  },
};

async function getValidSession(supabase: any, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("dia_sunucu_adi, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_id, dia_session_expires, dia_firma_kodu, dia_donem_kodu, dia_ust_islem_analyze_key, dia_ust_islem_approve_key, dia_ust_islem_reject_key")
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

async function fetchDiaData(profile: any, method: string, endpoint: string, sessionId: string) {
  // Using correct DIA API v3 URL structure
  const diaBaseUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/${endpoint}`;

  // Add _level1 filter with firma_kodu for multi-company filtering
  // No üst işlem filter - fetch all documents
  const filters: Array<{field: string, operator: string, value: string}> = [
    { field: "_level1", operator: "", value: String(profile.dia_firma_kodu) }
  ];

  const payload = {
    [method]: {
      session_id: sessionId,
      firma_kodu: profile.dia_firma_kodu,
      donem_kodu: profile.dia_donem_kodu,
      filters,
      sorts: "",
      params: "",
      limit: 500,
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

// Determine transaction status based on üst işlem türü
function determineStatus(record: any, profile: any): "pending" | "approved" | "rejected" {
  const ustIslemKey = record._key_sis_ust_islem_turu;
  
  if (!ustIslemKey) {
    return "pending";
  }
  
  const keyNum = typeof ustIslemKey === "number" ? ustIslemKey : parseInt(ustIslemKey);
  
  if (profile.dia_ust_islem_approve_key && keyNum === profile.dia_ust_islem_approve_key) {
    return "approved";
  }
  
  if (profile.dia_ust_islem_reject_key && keyNum === profile.dia_ust_islem_reject_key) {
    return "rejected";
  }
  
  // Default to pending (includes analyze key and unknown keys)
  return "pending";
}

// Force refresh DIA session
async function forceRefreshSession(supabase: any, userId: string, profile: any): Promise<string | null> {
  console.log("[dia-sync] Force refreshing DIA session...");
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
    if (loginResult.code === "200" && loginResult.msg) {
      await supabase
        .from("profiles")
        .update({
          dia_session_id: loginResult.msg,
          dia_session_expires: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
        })
        .eq("id", userId);

      console.log("[dia-sync] Session refreshed successfully:", loginResult.msg);
      return loginResult.msg;
    }
    console.error("[dia-sync] Session refresh failed:", loginResult);
    return null;
  } catch (e) {
    console.error("[dia-sync] Session refresh error:", e);
    return null;
  }
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

    // First attempt with current session
    let currentSessionId = profile.dia_session_id;
    
    // Log üst işlem keys for debugging
    console.log(`[dia-sync] Üst İşlem Keys - Approve: ${profile.dia_ust_islem_approve_key}, Reject: ${profile.dia_ust_islem_reject_key}, Analyze: ${profile.dia_ust_islem_analyze_key}`);

    // Fetch data for each transaction type IN PARALLEL for speed (no filter - fetch all)
    console.log("[dia-sync] Starting parallel fetch for all transaction types");
    let fetchPromises = Object.entries(MODULE_MAPPINGS).map(async ([txType, mapping]) => {
      try {
        console.log(`[dia-sync] Fetching ${txType} using ${mapping.method}`);
        const result = await fetchDiaData(profile, mapping.method, mapping.endpoint, currentSessionId);
        
        // Check for invalid session
        if (result.code === "401" && result.msg === "INVALID_SESSION") {
          return { txType, mapping, records: [], success: false, error: "INVALID_SESSION", needsRetry: true };
        }
        
        const records = result.result || [];
        console.log(`[dia-sync] ${txType}: Found ${records.length} records`);
        return { txType, mapping, records, success: true, needsRetry: false };
      } catch (err) {
        console.error(`[dia-sync] Error fetching ${txType}:`, err);
        const errMessage = err instanceof Error ? err.message : "Unknown error";
        return { txType, mapping, records: [], success: false, error: errMessage, needsRetry: false };
      }
    });

    let fetchResults = await Promise.all(fetchPromises);
    console.log("[dia-sync] All parallel fetches completed");
    
    // Check if any request needs session refresh
    const needsRefresh = fetchResults.some(r => r.needsRetry);
    if (needsRefresh) {
      console.log("[dia-sync] Session invalid, refreshing and retrying...");
      const newSessionId = await forceRefreshSession(supabase, userId, profile);
      
      if (newSessionId) {
        currentSessionId = newSessionId;
        
        // Retry all failed fetches
        fetchPromises = Object.entries(MODULE_MAPPINGS).map(async ([txType, mapping]) => {
          try {
            console.log(`[dia-sync] Retrying ${txType} using ${mapping.method}`);
            const result = await fetchDiaData(profile, mapping.method, mapping.endpoint, currentSessionId);
            const records = result.result || [];
            console.log(`[dia-sync] ${txType}: Found ${records.length} records`);
            return { txType, mapping, records, success: true, needsRetry: false };
          } catch (err) {
            console.error(`[dia-sync] Retry error fetching ${txType}:`, err);
            const errMessage = err instanceof Error ? err.message : "Unknown error";
            return { txType, mapping, records: [], success: false, error: errMessage, needsRetry: false };
          }
        });
        
        fetchResults = await Promise.all(fetchPromises);
        console.log("[dia-sync] Retry fetches completed");
      }
    }

    // Process results and build transactions
    for (const { txType, mapping, records, success, error } of fetchResults) {
      if (!success) {
        syncResults[txType] = { count: 0, success: false, error };
        continue;
      }
      
      // Filter out current_account records with turu = 'AF'
      let filteredRecords = records;
      if (txType === "current_account") {
        filteredRecords = records.filter((r: any) => r.turu !== "AF");
        console.log(`[dia-sync] current_account: Filtered ${records.length - filteredRecords.length} AF records, ${filteredRecords.length} remaining`);
      }
      
      syncResults[txType] = { count: filteredRecords.length, success: true };

      // Transform and prepare for upsert
      for (const record of filteredRecords) {
        const diaKey = String(record[mapping.keyField] || record._key);
        
        // Get counterparty name - use same flattened field approach for all types
        // DIA API returns flattened fields like __carifirma, __cariunvan in list responses
        let counterparty: string = record.__carifirma || record.__cariunvan || record.cariunvan || record.unvan || record[mapping.counterpartyField] || "";
        
        // If still empty, try nested objects (for some response formats)
        if (!counterparty && record._key_scf_carikart && typeof record._key_scf_carikart === "object") {
          counterparty = record._key_scf_carikart.unvan || "";
        }
        
        // Handle case where counterparty might still be an object
        if (typeof counterparty === "object" && counterparty !== null) {
          const cpObj = counterparty as Record<string, string>;
          counterparty = cpObj.__carifirma || cpObj.cariunvan || cpObj.unvan || cpObj.aciklama || "";
        }
        
        counterparty = counterparty || "Bilinmiyor";
        
        // Get amount - prefer net field for invoice/order, handle borc/alacak for current_account and bank
        // For foreign currency invoices/orders, use netdvz field directly
        let amount = 0;
        const exchangeRate = parseFloat(record.dovizkuru) || 1;
        const isForeignCurrency = exchangeRate > 1;
        
        if (txType === "invoice" || txType === "order") {
          // For foreign currency: use netdvz field directly
          if (isForeignCurrency && record.netdvz !== undefined && record.netdvz !== null) {
            amount = parseFloat(record.netdvz) || 0;
          } else {
            amount = parseFloat(record.net) || parseFloat(record[mapping.amountField]) || 0;
          }
        } else if (txType === "current_account") {
          const borc = parseFloat(record.borc) || 0;
          const alacak = parseFloat(record.alacak) || 0;
          amount = borc - alacak;
        } else if (txType === "bank") {
          const borc = parseFloat(record.borc) || 0;
          const alacak = parseFloat(record.alacak) || 0;
          if (borc > 0) {
            amount = borc;
          } else if (alacak > 0) {
            amount = -alacak;
          }
        } else {
          amount = parseFloat(record[mapping.amountField]) || 0;
        }
        
        // Normalize currency code: TL -> TRY
        let currency = record.dovizturu || record.doviz || "TRY";
        if (currency === "TL") {
          currency = "TRY";
        }
        const docType = record.turu || record.turuack || null;
        const approvalStatus = mapping.approvalField ? record[mapping.approvalField] : null;
        
        let attachmentUrl = null;
        if (txType === "invoice") {
          attachmentUrl = record.efaturalinki || record.earsivlinki || record.efatura_link || record.earsiv_link || null;
        }

        // Determine status based on üst işlem türü from DIA
        const status = determineStatus(record, profile);
        console.log(`[dia-sync] Record ${diaKey} - _key_sis_ust_islem_turu: ${record._key_sis_ust_islem_turu} -> status: ${status}`);

        transactionsToUpsert.push({
          user_id: userId,
          dia_record_id: `${mapping.method}-${diaKey}`,
          transaction_type: txType,
          document_no: record[mapping.docField] || diaKey,
          description: record.aciklama || record.not || docType || `${txType} işlemi`,
          counterparty,
          amount,
          currency,
          transaction_date: record[mapping.dateField] || new Date().toISOString().split("T")[0],
          status,
          attachment_url: attachmentUrl,
          dia_raw_data: record,
          dia_firma_kodu: profile.dia_firma_kodu,
        });
      }
    }

    // Upsert transactions in batches for better performance
    if (transactionsToUpsert.length > 0) {
      const BATCH_SIZE = 50;
      console.log(`[dia-sync] Upserting ${transactionsToUpsert.length} transactions in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < transactionsToUpsert.length; i += BATCH_SIZE) {
        const batch = transactionsToUpsert.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from("pending_transactions")
          .upsert(batch, {
            onConflict: "user_id,dia_record_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`[dia-sync] Upsert error for batch ${i / BATCH_SIZE + 1}:`, upsertError);
        }
      }
      console.log("[dia-sync] All batches upserted");
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
