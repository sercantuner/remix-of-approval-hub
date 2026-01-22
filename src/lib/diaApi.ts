import { supabase } from "@/integrations/supabase/client";

interface DiaLoginParams {
  sunucuAdi: string;
  apiKey: string;
  wsKullanici: string;
  wsSifre: string;
  firmaKodu: number;
  donemKodu: number;
}

interface DiaApiParams {
  action: "list" | "create" | "update" | "delete" | "approve" | "reject";
  module: string;
  filters?: Array<{ field: string; operator: string; value: string }>;
  sorts?: Array<{ field: string; sorttype: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  data?: Record<string, unknown>;
  recordKey?: string;
}

export async function diaLogin(params: DiaLoginParams) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("dia-login", {
    body: params,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

export async function diaApi(params: DiaApiParams) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("dia-api", {
    body: params,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

export async function diaSync() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("dia-sync", {
    body: {},
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

export async function diaApprove(transactionIds: string[], action: "approve" | "reject", reason?: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("dia-approve", {
    body: { transactionIds, action, reason },
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}
