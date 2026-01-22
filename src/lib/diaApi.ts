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
  action: "list" | "list_detail" | "list_users" | "create" | "update" | "delete" | "approve" | "reject";
  module: string;
  filters?: Array<{ field: string; operator: string; value: string }>;
  sorts?: Array<{ field: string; sorttype: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  data?: Record<string, unknown>;
  recordKey?: string;
  transactionType?: string;
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

export async function diaFetchDetail(transactionType: string, recordKey: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const response = await supabase.functions.invoke("dia-api", {
    body: {
      action: "list_detail",
      module: "", // Not used for list_detail
      transactionType,
      recordKey,
    },
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

// User list cache - stored in memory
let userListCache: Record<number, string> | null = null;
let userListLoading = false;
let userListPromise: Promise<Record<number, string>> | null = null;

export async function diaFetchUserList(): Promise<Record<number, string>> {
  // Return from cache if available
  if (userListCache) {
    return userListCache;
  }

  // If already loading, wait for the existing promise
  if (userListLoading && userListPromise) {
    return userListPromise;
  }

  userListLoading = true;

  userListPromise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("dia-api", {
        body: {
          action: "list_users",
          module: "sis",
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Build user map from response
      const users: Record<number, string> = {};
      const userList = response.data?.result || [];
      for (const user of userList) {
        if (user._key && user.gercekadi) {
          users[user._key] = user.gercekadi;
        } else if (user._key && user.kullaniciadi) {
          users[user._key] = user.kullaniciadi;
        }
      }

      userListCache = users;
      return users;
    } finally {
      userListLoading = false;
    }
  })();

  return userListPromise;
}

export function getCachedUserName(userId: number): string | null {
  return userListCache?.[userId] || null;
}
