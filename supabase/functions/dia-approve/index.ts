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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { transactionIds, action, reason }: ApproveRequest = await req.json();

    if (!transactionIds || transactionIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No transactions specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get DIA session for potential API calls
    const { data: profile } = await supabase
      .from("profiles")
      .select("dia_sunucu_adi, dia_session_id, dia_firma_kodu, dia_donem_kodu")
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

      // If we have a valid DIA session and the transaction has raw data,
      // we could call DIA API to update the record status
      // For now, we just update our local database
      let diaResponse = null;

      if (profile?.dia_session_id && transaction.dia_raw_data) {
        // In a production system, you would call DIA API here to mark the record
        // For example, calling a custom approval field update
        console.log(`[dia-approve] Would update DIA record for ${transaction.dia_record_id}`);
        diaResponse = { simulated: true, message: "DIA update would happen here" };
      }

      // Update transaction status
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

      // Record in approval history
      await supabase.from("approval_history").insert({
        transaction_id: txId,
        user_id: userId,
        action: action === "approve" ? "approved" : "rejected",
        notes: reason,
        dia_response: diaResponse,
      });

      results.push({ id: txId, success: true, action });
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
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
