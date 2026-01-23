import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApproveRequest {
  transactionIds: string[];
  action: "approve" | "reject";
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
      sis_kullanici_giris: {
        params: {
          kullaniciadi: profile.dia_ws_kullanici,
          sifre: profile.dia_ws_sifre,
          apikey: profile.dia_api_key,
        },
      },
    };

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  action: "approve" | "reject",
  reason?: string
): Promise<DiaUpdateResponse> {
  const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

  // Build the kart object based on action
  const kart: Record<string, unknown> = {
    _key: key,
  };

  if (action === "approve") {
    kart.ustislemack = "MUHASEBELEŞEBİLİR";
    kart.ekalan5 = "Onaylandı";
  } else {
    // Reject - only set ekalan5
    kart.ekalan5 = `RED : ${reason || "Belirtilmedi"}`;
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

    // Get DIA session for API calls
    const diaSession = await getValidDiaSession(supabase, userId);

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
      if (diaSession && transaction.transaction_type === "invoice" && transaction.dia_raw_data?._key) {
        const diaKey = transaction.dia_raw_data._key;
        console.log(`[dia-approve] Updating DIA invoice with _key: ${diaKey}`);
        
        diaResponse = await updateDiaInvoice(diaSession, diaKey, action, reason);
        
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
      const updateData = action === "approve"
        ? { status: "approved", approved_at: now, approved_by: userId }
        : { status: "rejected", rejected_at: now, rejected_by: userId, rejection_reason: reason };

      const { error: updateError } = await supabase
        .from("pending_transactions")
        .update(updateData)
        .eq("id", txId);

      if (updateError) {
        results.push({ id: txId, success: false, error: updateError.message });
        continue;
      }

      // Record in approval history with DIA response
      await supabase.from("approval_history").insert({
        transaction_id: txId,
        user_id: userId,
        action: action === "approve" ? "approved" : "rejected",
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
