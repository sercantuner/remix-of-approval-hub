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
    // Use _key_sis_ust_islem_turu if approveKey is set, otherwise fallback to ustislemturuack
    if (approveKey) {
      kart._key_sis_ust_islem_turu = approveKey;
    } else {
      kart.ustislemturuack = "MUHASEBELEŞİR";
    }
    kart.ekalan5 = "Onaylandı";
  } else if (action === "reject") {
    // Reject - use _key_sis_ust_islem_turu if rejectKey is set
    if (rejectKey) {
      kart._key_sis_ust_islem_turu = rejectKey;
    }
    kart.ekalan5 = `RED : ${reason || "Belirtilmedi"}`;
  } else if (action === "analyze") {
    // Analyze - set to analyze key and clear ekalan5
    if (analyzeKey) {
      kart._key_sis_ust_islem_turu = analyzeKey;
    }
    kart.ekalan5 = ""; // Clear ekalan5 for analyze
  }

  const payload = {
    scf_fatura_guncelle: {
      session_id: session.session_id,
      firma_kodu: session.firma_kodu,
      donem_kodu: session.donem_kodu,
      kart,
    },
  };

  console.log("[dia-approve] Sending DIA update request:", JSON.stringify(payload));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[dia-approve] DIA response:", JSON.stringify(result));

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

// Update with retry on INVALID_SESSION
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

      // Only update DIA for invoice type transactions
      if (diaSession && profile && transaction.transaction_type === "invoice" && transaction.dia_raw_data?._key) {
        const diaKey = parseInt(transaction.dia_raw_data._key, 10);
        console.log(`[dia-approve] Updating DIA invoice with _key: ${diaKey}`);
        
        // Use retry wrapper for INVALID_SESSION handling
        diaResponse = await updateDiaInvoiceWithRetry(supabase, userId, profile, diaSession, diaKey, action, reason);
        
        if (!diaResponse.success) {
          console.error(`[dia-approve] DIA update failed for transaction ${txId}:`, diaResponse.message);
          // Continue with local update even if DIA fails
        }
      } else if (transaction.transaction_type === "invoice" && !transaction.dia_raw_data?._key) {
        console.log(`[dia-approve] No _key found in dia_raw_data for transaction ${txId}`);
      } else if (transaction.transaction_type !== "invoice") {
        console.log(`[dia-approve] Skipping DIA update for non-invoice transaction: ${transaction.transaction_type}`);
      }

      // Update transaction status locally
      let updateData: Record<string, unknown>;
      if (action === "approve") {
        updateData = { status: "approved", approved_at: now, approved_by: userId };
      } else if (action === "reject") {
        updateData = { status: "rejected", rejected_at: now, rejected_by: userId, rejection_reason: reason };
      } else {
        // analyze - back to pending
        updateData = { status: "pending", approved_at: null, approved_by: null, rejected_at: null, rejected_by: null, rejection_reason: null };
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
