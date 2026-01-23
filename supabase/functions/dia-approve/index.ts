import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApproveRequest {
  transactionIds: string[];
  action: "approve" | "reject" | "analyze";
  reason?: string;
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

interface DiaUpdateResponse {
  success: boolean;
  code?: string;
  message?: string;
  result?: unknown;
}

interface ProfileWithUstIslemKeys {
  dia_sunucu_adi: string;
  dia_session_id: string;
  dia_firma_kodu: number;
  dia_donem_kodu: number;
  dia_api_key: string;
  dia_ws_kullanici: string;
  dia_ws_sifre: string;
  dia_session_expires: string;
  dia_ust_islem_approve_key: number | null;
  dia_ust_islem_reject_key: number | null;
  dia_ust_islem_analyze_key: number | null;
}

// Get valid DIA session, auto-refresh if expired
async function getValidDiaSession(supabase: any, userId: string): Promise<DiaSession | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("dia_sunucu_adi, dia_session_id, dia_firma_kodu, dia_donem_kodu, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_expires")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile?.dia_session_id) {
    console.log("[dia-approve] No DIA session found for user");
    return null;
  }

  // Check if session is expired
  const now = new Date();
  const expiry = profile.dia_session_expires ? new Date(profile.dia_session_expires) : null;
  
  if (expiry && expiry > now) {
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

  // Session expired, try to refresh
  console.log("[dia-approve] Session expired, attempting refresh...");
  
  try {
    const loginUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
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

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(loginPayload),
    });

    const result = await response.json();

    if (result.code === "200" && result.msg) {
      const newSessionId = result.msg;
      const newExpiry = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes

      await supabase
        .from("profiles")
        .update({
          dia_session_id: newSessionId,
          dia_session_expires: newExpiry.toISOString(),
        })
        .eq("id", userId);

      console.log("[dia-approve] Session refreshed successfully");

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

    console.error("[dia-approve] Failed to refresh session:", result);
    return null;
  } catch (err) {
    console.error("[dia-approve] Session refresh error:", err);
    return null;
  }
}

// Update invoice in DIA ERP
async function updateDiaInvoice(
  session: DiaSession,
  key: number,
  action: "approve" | "reject" | "analyze",
  reason?: string,
  approveKey?: number | null,
  rejectKey?: number | null,
  analyzeKey?: number | null
): Promise<DiaUpdateResponse> {
  const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

  // Build the kart object based on action
  const kart: Record<string, unknown> = {
    _key: key,
  };

  if (action === "approve") {
    if (approveKey) {
      kart._key_sis_ust_islem_turu = approveKey;
    } else {
      kart.ustislemturuack = "MUHASEBELEŞİR";
    }
    kart.ekalan5 = "Onaylandı";
  } else if (action === "reject") {
    if (rejectKey) {
      kart._key_sis_ust_islem_turu = rejectKey;
    }
    kart.ekalan5 = `RED : ${reason || "Belirtilmedi"}`;
  } else if (action === "analyze") {
    if (analyzeKey) {
      kart._key_sis_ust_islem_turu = analyzeKey;
    }
    kart.ekalan5 = "";
  }

  const payload = {
    scf_fatura_guncelle: {
      session_id: session.session_id,
      firma_kodu: session.firma_kodu,
      donem_kodu: session.donem_kodu,
      kart,
    },
  };

  console.log("[dia-approve] Sending DIA invoice update request:", JSON.stringify(payload));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[dia-approve] DIA invoice response:", JSON.stringify(result));

    if (result.code === "200") {
      return {
        success: true,
        code: result.code,
        message: result.msg,
        result: result.result,
      };
    }

    return {
      success: false,
      code: result.code,
      message: result.msg || "DIA update failed",
    };
  } catch (err) {
    console.error("[dia-approve] DIA API error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "DIA API connection error",
    };
  }
}

// Update current account receipt in DIA ERP using scf_carihesap_fisi_guncelle
async function updateDiaCurrentAccount(
  session: DiaSession,
  parentKey: number,  // _key_scf_carihesap_fisi - the main receipt key
  action: "approve" | "reject" | "analyze",
  reason?: string,
  approveKey?: number | null,
  rejectKey?: number | null,
  analyzeKey?: number | null
): Promise<DiaUpdateResponse> {
  const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

  // Build the kart object based on action
  // For current account, we use _key_scf_carihesap_fisi (numeric parent key) and aciklama3 for status text
  // IMPORTANT: scf_carihesap_fisi_guncelle requires m_kalemler array (even if empty) to avoid "m_kalemler" key error
  const kart: Record<string, unknown> = {
    _key: parentKey, // Use the numeric parent key (_key_scf_carihesap_fisi)
    m_kalemler: [], // Required empty array - API expects this field
  };

  if (action === "approve") {
    if (approveKey) {
      kart._key_sis_ust_islem_turu = approveKey;
    }
    kart.aciklama3 = "Onaylandı";
  } else if (action === "reject") {
    if (rejectKey) {
      kart._key_sis_ust_islem_turu = rejectKey;
    }
    kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
  } else if (action === "analyze") {
    if (analyzeKey) {
      kart._key_sis_ust_islem_turu = analyzeKey;
    }
    kart.aciklama3 = "";
  }

  const payload = {
    scf_carihesap_fisi_guncelle: {
      session_id: session.session_id,
      firma_kodu: session.firma_kodu,
      donem_kodu: session.donem_kodu,
      kart,
    },
  };

  console.log("[dia-approve] Sending DIA current account update request:", JSON.stringify(payload));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[dia-approve] DIA current account response:", JSON.stringify(result));

    if (result.code === "200") {
      return {
        success: true,
        code: result.code,
        message: result.msg,
        result: result.result,
      };
    }

    return {
      success: false,
      code: result.code,
      message: result.msg || "DIA update failed",
    };
  } catch (err) {
    console.error("[dia-approve] DIA current account API error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "DIA API connection error",
    };
  }
}

// Force refresh DIA session and return new session
async function forceRefreshDiaSession(supabase: any, userId: string, profile: any): Promise<DiaSession | null> {
  console.log("[dia-approve] Force refreshing DIA session...");
  const loginUrl = `https://${profile.dia_sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
  
  try {
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

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(loginPayload),
    });

    const result = await response.json();

    if (result.code === "200" && result.msg) {
      const newSessionId = result.msg;
      const newExpiry = new Date(Date.now() + 55 * 60 * 1000);

      await supabase
        .from("profiles")
        .update({
          dia_session_id: newSessionId,
          dia_session_expires: newExpiry.toISOString(),
        })
        .eq("id", userId);

      console.log("[dia-approve] Session force refreshed successfully");

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

    console.error("[dia-approve] Force refresh failed:", result);
    return null;
  } catch (err) {
    console.error("[dia-approve] Force refresh error:", err);
    return null;
  }
}

// Update invoice with retry on INVALID_SESSION
async function updateDiaInvoiceWithRetry(
  supabase: any,
  userId: string,
  profile: ProfileWithUstIslemKeys,
  session: DiaSession,
  key: number,
  action: "approve" | "reject" | "analyze",
  reason?: string
): Promise<DiaUpdateResponse> {
  const approveKey = profile.dia_ust_islem_approve_key;
  const rejectKey = profile.dia_ust_islem_reject_key;
  const analyzeKey = profile.dia_ust_islem_analyze_key;
  
  // First attempt
  let response = await updateDiaInvoice(session, key, action, reason, approveKey, rejectKey, analyzeKey);
  
  // If INVALID_SESSION, refresh and retry once
  if (!response.success && response.code === "401") {
    console.log("[dia-approve] Got INVALID_SESSION, refreshing and retrying...");
    const newSession = await forceRefreshDiaSession(supabase, userId, profile);
    
    if (newSession) {
      response = await updateDiaInvoice(newSession, key, action, reason, approveKey, rejectKey, analyzeKey);
    }
  }
  
  return response;
}

// Update current account with retry on INVALID_SESSION
async function updateDiaCurrentAccountWithRetry(
  supabase: any,
  userId: string,
  profile: ProfileWithUstIslemKeys,
  session: DiaSession,
  parentKey: number,  // _key_scf_carihesap_fisi
  action: "approve" | "reject" | "analyze",
  reason?: string
): Promise<DiaUpdateResponse> {
  const approveKey = profile.dia_ust_islem_approve_key;
  const rejectKey = profile.dia_ust_islem_reject_key;
  const analyzeKey = profile.dia_ust_islem_analyze_key;
  
  // First attempt
  let response = await updateDiaCurrentAccount(session, parentKey, action, reason, approveKey, rejectKey, analyzeKey);
  
  // If INVALID_SESSION, refresh and retry once
  if (!response.success && response.code === "401") {
    console.log("[dia-approve] Got INVALID_SESSION for current_account, refreshing and retrying...");
    const newSession = await forceRefreshDiaSession(supabase, userId, profile);
    
    if (newSession) {
      response = await updateDiaCurrentAccount(newSession, parentKey, action, reason, approveKey, rejectKey, analyzeKey);
    }
  }
  
  return response;
}

// Update bank receipt in DIA ERP using bcs_banka_fisi_guncelle
// Same logic as current account - uses _key_bcs_banka_fisi as parent key
async function updateDiaBank(
  session: DiaSession,
  parentKey: number,  // _key_bcs_banka_fisi - the main receipt key
  action: "approve" | "reject" | "analyze",
  reason?: string,
  approveKey?: number | null,
  rejectKey?: number | null,
  analyzeKey?: number | null
): Promise<DiaUpdateResponse> {
  const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/bcs/json`;

  // Build the kart object based on action
  // For bank, we use _key_bcs_banka_fisi (numeric parent key) and aciklama3 for status text
  // IMPORTANT: bcs_banka_fisi_guncelle requires m_kalemler array (even if empty) to avoid key error
  const kart: Record<string, unknown> = {
    _key: parentKey, // Use the numeric parent key (_key_bcs_banka_fisi)
    m_kalemler: [], // Required empty array - API expects this field
  };

  if (action === "approve") {
    if (approveKey) {
      kart._key_sis_ust_islem_turu = approveKey;
    }
    kart.aciklama3 = "Onaylandı";
  } else if (action === "reject") {
    if (rejectKey) {
      kart._key_sis_ust_islem_turu = rejectKey;
    }
    kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
  } else if (action === "analyze") {
    if (analyzeKey) {
      kart._key_sis_ust_islem_turu = analyzeKey;
    }
    kart.aciklama3 = "";
  }

  const payload = {
    bcs_banka_fisi_guncelle: {
      session_id: session.session_id,
      firma_kodu: session.firma_kodu,
      donem_kodu: session.donem_kodu,
      kart,
    },
  };

  console.log("[dia-approve] Sending DIA bank update request:", JSON.stringify(payload));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[dia-approve] DIA bank response:", JSON.stringify(result));

    if (result.code === "200") {
      return {
        success: true,
        code: result.code,
        message: result.msg,
        result: result.result,
      };
    }

    return {
      success: false,
      code: result.code,
      message: result.msg || "DIA update failed",
    };
  } catch (err) {
    console.error("[dia-approve] DIA bank API error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "DIA API connection error",
    };
  }
}

// Update bank with retry on INVALID_SESSION
async function updateDiaBankWithRetry(
  supabase: any,
  userId: string,
  profile: ProfileWithUstIslemKeys,
  session: DiaSession,
  parentKey: number,  // _key_bcs_banka_fisi
  action: "approve" | "reject" | "analyze",
  reason?: string
): Promise<DiaUpdateResponse> {
  const approveKey = profile.dia_ust_islem_approve_key;
  const rejectKey = profile.dia_ust_islem_reject_key;
  const analyzeKey = profile.dia_ust_islem_analyze_key;
  
  // First attempt
  let response = await updateDiaBank(session, parentKey, action, reason, approveKey, rejectKey, analyzeKey);
  
  // If INVALID_SESSION, refresh and retry once
  if (!response.success && response.code === "401") {
    console.log("[dia-approve] Got INVALID_SESSION for bank, refreshing and retrying...");
    const newSession = await forceRefreshDiaSession(supabase, userId, profile);
    
    if (newSession) {
      response = await updateDiaBank(newSession, parentKey, action, reason, approveKey, rejectKey, analyzeKey);
    }
  }
  
  return response;
}

// Update cash receipt in DIA ERP using scf_kasaislemleri_guncelle
// Similar logic to bank - uses _key and aciklama3 for status text
async function updateDiaCash(
  session: DiaSession,
  key: number,  // _key - the main receipt key
  action: "approve" | "reject" | "analyze",
  reason?: string,
  approveKey?: number | null,
  rejectKey?: number | null,
  analyzeKey?: number | null
): Promise<DiaUpdateResponse> {
  const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

  // Build the kart object based on action
  // For cash, we use _key and aciklama3 for status text (same as bank/current_account)
  const kart: Record<string, unknown> = {
    _key: key,
  };

  if (action === "approve") {
    if (approveKey) {
      kart._key_sis_ust_islem_turu = approveKey;
    }
    kart.aciklama3 = "Onaylandı";
  } else if (action === "reject") {
    if (rejectKey) {
      kart._key_sis_ust_islem_turu = rejectKey;
    }
    kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
  } else if (action === "analyze") {
    if (analyzeKey) {
      kart._key_sis_ust_islem_turu = analyzeKey;
    }
    kart.aciklama3 = "";
  }

  const payload = {
    scf_kasaislemleri_guncelle: {
      session_id: session.session_id,
      firma_kodu: session.firma_kodu,
      donem_kodu: session.donem_kodu,
      kart,
    },
  };

  console.log("[dia-approve] Sending DIA cash update request:", JSON.stringify(payload));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[dia-approve] DIA cash response:", JSON.stringify(result));

    if (result.code === "200") {
      return {
        success: true,
        code: result.code,
        message: result.msg,
        result: result.result,
      };
    }

    return {
      success: false,
      code: result.code,
      message: result.msg || "DIA update failed",
    };
  } catch (err) {
    console.error("[dia-approve] DIA cash API error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "DIA API connection error",
    };
  }
}

// Update cash with retry on INVALID_SESSION
async function updateDiaCashWithRetry(
  supabase: any,
  userId: string,
  profile: ProfileWithUstIslemKeys,
  session: DiaSession,
  key: number,  // _key
  action: "approve" | "reject" | "analyze",
  reason?: string
): Promise<DiaUpdateResponse> {
  const approveKey = profile.dia_ust_islem_approve_key;
  const rejectKey = profile.dia_ust_islem_reject_key;
  const analyzeKey = profile.dia_ust_islem_analyze_key;
  
  // First attempt
  let response = await updateDiaCash(session, key, action, reason, approveKey, rejectKey, analyzeKey);
  
  // If INVALID_SESSION, refresh and retry once
  if (!response.success && response.code === "401") {
    console.log("[dia-approve] Got INVALID_SESSION for cash, refreshing and retrying...");
    const newSession = await forceRefreshDiaSession(supabase, userId, profile);
    
    if (newSession) {
      response = await updateDiaCash(newSession, key, action, reason, approveKey, rejectKey, analyzeKey);
    }
  }
  
  return response;
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
    const { transactionIds, action, reason }: ApproveRequest = await req.json();

    if (!transactionIds || transactionIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No transactions specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get DIA session and profile for API calls
    const diaSession = await getValidDiaSession(supabase, userId);
    
    // Get profile for retry functionality and üst işlem keys
    const { data: profile } = await supabase
      .from("profiles")
      .select("dia_sunucu_adi, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_firma_kodu, dia_donem_kodu, dia_session_id, dia_session_expires, dia_ust_islem_approve_key, dia_ust_islem_reject_key, dia_ust_islem_analyze_key")
      .eq("id", userId)
      .maybeSingle();

    const results: any[] = [];
    const now = new Date().toISOString();

    for (const txId of transactionIds) {
      // Get transaction details
      const { data: transaction, error: txError } = await supabase
        .from("pending_transactions")
        .select("*")
        .eq("id", txId)
        .eq("user_id", userId)
        .maybeSingle();

      if (txError || !transaction) {
        results.push({ id: txId, success: false, error: "Transaction not found" });
        continue;
      }

      let diaResponse: DiaUpdateResponse | null = null;

      // Update DIA based on transaction type
      if (diaSession && profile && transaction.transaction_type === "invoice" && transaction.dia_raw_data?._key) {
        const diaKey = parseInt(transaction.dia_raw_data._key, 10);
        console.log(`[dia-approve] Updating DIA invoice with _key: ${diaKey}`);
        
        // Use retry wrapper for INVALID_SESSION handling
        diaResponse = await updateDiaInvoiceWithRetry(supabase, userId, profile, diaSession, diaKey, action, reason);
        
        if (!diaResponse.success) {
          console.error(`[dia-approve] DIA invoice update failed for transaction ${txId}:`, diaResponse.message);
        }
      } else if (diaSession && profile && transaction.transaction_type === "current_account" && transaction.dia_raw_data?._key_scf_carihesap_fisi) {
        // Current account uses _key_scf_carihesap_fisi (parent key) for updates
        const parentKey = parseInt(transaction.dia_raw_data._key_scf_carihesap_fisi, 10);
        console.log(`[dia-approve] Updating DIA current account with _key_scf_carihesap_fisi: ${parentKey}`);
        
        // Use retry wrapper for INVALID_SESSION handling
        diaResponse = await updateDiaCurrentAccountWithRetry(supabase, userId, profile, diaSession, parentKey, action, reason);
        
        if (!diaResponse.success) {
          console.error(`[dia-approve] DIA current account update failed for transaction ${txId}:`, diaResponse.message);
        }
      } else if (diaSession && profile && transaction.transaction_type === "bank" && transaction.dia_raw_data?._key_bcs_banka_fisi) {
        // Bank uses _key_bcs_banka_fisi (parent key) for updates - same logic as current_account
        const parentKey = parseInt(transaction.dia_raw_data._key_bcs_banka_fisi, 10);
        console.log(`[dia-approve] Updating DIA bank with _key_bcs_banka_fisi: ${parentKey}`);
        
        // Use retry wrapper for INVALID_SESSION handling
        diaResponse = await updateDiaBankWithRetry(supabase, userId, profile, diaSession, parentKey, action, reason);
        
        if (!diaResponse.success) {
          console.error(`[dia-approve] DIA bank update failed for transaction ${txId}:`, diaResponse.message);
        }
      } else if (diaSession && profile && transaction.transaction_type === "cash" && transaction.dia_raw_data?._key) {
        // Cash uses _key for updates - similar logic to invoice but with scf_kasaislemleri_guncelle
        const diaKey = parseInt(transaction.dia_raw_data._key, 10);
        console.log(`[dia-approve] Updating DIA cash with _key: ${diaKey}`);
        
        // Use retry wrapper for INVALID_SESSION handling
        diaResponse = await updateDiaCashWithRetry(supabase, userId, profile, diaSession, diaKey, action, reason);
        
        if (!diaResponse.success) {
          console.error(`[dia-approve] DIA cash update failed for transaction ${txId}:`, diaResponse.message);
        }
      } else if (transaction.transaction_type === "invoice" && !transaction.dia_raw_data?._key) {
        console.log(`[dia-approve] No _key found in dia_raw_data for invoice ${txId}`);
      } else if (transaction.transaction_type === "current_account" && !transaction.dia_raw_data?._key_scf_carihesap_fisi) {
        console.log(`[dia-approve] No _key_scf_carihesap_fisi found for current_account ${txId}`);
      } else if (transaction.transaction_type === "bank" && !transaction.dia_raw_data?._key_bcs_banka_fisi) {
        console.log(`[dia-approve] No _key_bcs_banka_fisi found for bank ${txId}`);
      } else if (transaction.transaction_type === "cash" && !transaction.dia_raw_data?._key) {
        console.log(`[dia-approve] No _key found in dia_raw_data for cash ${txId}`);
      } else {
        console.log(`[dia-approve] Skipping DIA update for transaction type: ${transaction.transaction_type}`);
      }

      // Update transaction status locally
      let updateData: Record<string, unknown>;
      if (action === "approve") {
        updateData = { status: "approved", approved_at: now, approved_by: userId };
      } else if (action === "reject") {
        updateData = { status: "rejected", rejected_at: now, rejected_by: userId, rejection_reason: reason };
      } else {
        // analyze - set to analyzing status
        updateData = { status: "analyzing", approved_at: null, approved_by: null, rejected_at: null, rejected_by: null, rejection_reason: null };
      }

      const { error: updateError } = await supabase
        .from("pending_transactions")
        .update(updateData)
        .eq("id", txId);

      if (updateError) {
        results.push({ id: txId, success: false, error: updateError.message });
        continue;
      }

      // Record in approval history with DIA response
      const actionName = action === "approve" ? "approved" : action === "reject" ? "rejected" : "analyzed";
      await supabase.from("approval_history").insert({
        transaction_id: txId,
        user_id: userId,
        action: actionName,
        notes: reason,
        dia_response: diaResponse,
      });

      results.push({ 
        id: txId, 
        success: true, 
        action,
        diaUpdated: diaResponse?.success || false,
        diaMessage: diaResponse?.message,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const diaUpdatedCount = results.filter(r => r.diaUpdated).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
        diaUpdated: diaUpdatedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[dia-approve] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
