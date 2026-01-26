import axios, { AxiosInstance } from 'axios';
import { query } from '../config/database';
import { User, DiaLoginParams, DiaLoginResponse, DiaApiParams } from '../types';
import { AppError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

// DIA API Session interface
interface DiaSession {
  session_id: string;
  sunucu_adi: string;
  firma_kodu: number;
  donem_kodu: number;
  api_key: string;
  ws_kullanici: string;
  ws_sifre: string;
}

// Module mappings for different transaction types
interface ModuleMapping {
  method: string;
  endpoint: string;
  keyField: string;
  docField: string;
  amountField: string;
  dateField: string;
  counterpartyField: string;
  codeField: string | null;
  groupField?: string;
}

const MODULE_MAPPINGS: Record<string, ModuleMapping> = {
  invoice: { 
    method: "scf_fatura_listele",
    endpoint: "scf/json",
    keyField: "_key", 
    docField: "belgeno2",
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
    groupField: "_key_scf_carihesap_fisi"
  },
  bank: { 
    method: "bcs_banka_fisi_listele_ayrintili",
    endpoint: "bcs/json",
    keyField: "_key", 
    docField: "fisno", 
    amountField: "tutar", 
    dateField: "tarih", 
    counterpartyField: "aciklama",
    codeField: null,
    groupField: "_key_bcs_banka_fisi"
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
};

// Detail method mapping for fetching transaction details
const DETAIL_METHOD_MAPPING: Record<string, { method: string; endpoint: string; useKeyParam?: boolean }> = {
  order: { method: "scf_siparis_getir", endpoint: "scf", useKeyParam: true },
  invoice: { method: "scf_fatura_getir", endpoint: "scf", useKeyParam: true },
  bank: { method: "bcs_banka_fisi_getir", endpoint: "bcs", useKeyParam: true },
  current_account: { method: "scf_carihesap_fisi_getir", endpoint: "scf", useKeyParam: true },
  cash: { method: "scf_kasa_fisi_getir", endpoint: "scf", useKeyParam: true },
  check_note: { method: "bcs_ceksenet_getir", endpoint: "bcs", useKeyParam: true }
};

// Parent receipt mappings
const PARENT_RECEIPT_MAPPINGS: Record<string, { method: string; endpoint: string }> = {
  current_account: { method: "scf_carihesap_fisi_listele", endpoint: "scf/json" },
  bank: { method: "bcs_banka_fisi_listele", endpoint: "bcs/json" }
};

export class DiaService {
  /**
   * Login to DIA ERP and save session
   */
  async login(userId: string, params: DiaLoginParams): Promise<DiaLoginResponse> {
    const { sunucuAdi, apiKey, wsKullanici, wsSifre, firmaKodu, donemKodu } = params;

    // Build DIA API URL
    const diaBaseUrl = `https://${sunucuAdi}.ws.dia.com.tr/api/v3/sis/json`;

    // Create DIA login request
    const diaLoginPayload = {
      login: {
        username: wsKullanici,
        password: wsSifre,
        disconnect_same_user: true,
        lang: "tr",
        params: {
          apikey: apiKey,
          firma_kodu: firmaKodu,
          donem_kodu: donemKodu,
        },
      },
    };

    console.log(`[dia-service] Attempting login to ${diaBaseUrl}`);

    try {
      const response = await axios.post(diaBaseUrl, diaLoginPayload, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });

      const diaResult = response.data;
      console.log("[dia-service] DIA login response:", JSON.stringify(diaResult));

      // Check for successful login - DIA returns: { code: "200", msg: "session_id", warnings: [] }
      if (diaResult.code === "200" && diaResult.msg) {
        const sessionId = diaResult.msg;
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        // Save session to users table
        await query(
          `UPDATE users SET 
            dia_sunucu_adi = ?, dia_api_key = ?, dia_ws_kullanici = ?, dia_ws_sifre = ?,
            dia_session_id = ?, dia_session_expires = ?, dia_firma_kodu = ?, dia_donem_kodu = ?
           WHERE id = ?`,
          [sunucuAdi, apiKey, wsKullanici, wsSifre, sessionId, expiresAt, firmaKodu, donemKodu, userId]
        );

        return { success: true, session_id: sessionId, expires: expiresAt };
      } else {
        const errorMessage = diaResult.msg || diaResult.error?.message || "DIA login failed";
        console.error("[dia-service] DIA login failed:", errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error("[dia-service] DIA login error:", error);
      const errorMessage = error instanceof Error ? error.message : "DIA API connection error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get valid DIA session, auto-refresh if expired
   */
  async getValidSession(userId: string): Promise<DiaSession | null> {
    const users = await query<User[]>(
      `SELECT dia_sunucu_adi, dia_api_key, dia_ws_kullanici, dia_ws_sifre, 
              dia_session_id, dia_session_expires, dia_firma_kodu, dia_donem_kodu
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      console.log("[dia-service] User not found");
      return null;
    }

    const user = users[0];

    if (!user.dia_sunucu_adi || !user.dia_ws_kullanici || !user.dia_ws_sifre || !user.dia_api_key) {
      console.log("[dia-service] DIA connection not configured");
      return null;
    }

    // Check if session exists and is valid (with 2 min buffer)
    const hasSession = user.dia_session_id && user.dia_session_expires;
    const bufferTime = 2 * 60 * 1000;
    const sessionExpired = hasSession && 
      new Date(user.dia_session_expires!).getTime() - bufferTime < Date.now();

    // If no session or expired, create/refresh
    if (!hasSession || sessionExpired) {
      console.log(`[dia-service] ${!hasSession ? 'No session' : 'Session expired'}, refreshing...`);
      
      const refreshResult = await this.login(userId, {
        sunucuAdi: user.dia_sunucu_adi,
        apiKey: user.dia_api_key,
        wsKullanici: user.dia_ws_kullanici,
        wsSifre: user.dia_ws_sifre,
        firmaKodu: user.dia_firma_kodu,
        donemKodu: user.dia_donem_kodu,
      });

      if (!refreshResult.success) {
        return null;
      }

      return {
        session_id: refreshResult.session_id!,
        sunucu_adi: user.dia_sunucu_adi,
        firma_kodu: user.dia_firma_kodu,
        donem_kodu: user.dia_donem_kodu,
        api_key: user.dia_api_key,
        ws_kullanici: user.dia_ws_kullanici,
        ws_sifre: user.dia_ws_sifre,
      };
    }

    return {
      session_id: user.dia_session_id!,
      sunucu_adi: user.dia_sunucu_adi,
      firma_kodu: user.dia_firma_kodu,
      donem_kodu: user.dia_donem_kodu,
      api_key: user.dia_api_key,
      ws_kullanici: user.dia_ws_kullanici,
      ws_sifre: user.dia_ws_sifre,
    };
  }

  /**
   * Fetch data from DIA API
   */
  async fetchDiaData(session: DiaSession, method: string, endpoint: string, filters: any[] = []): Promise<any> {
    const diaBaseUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/${endpoint}`;

    // Add _level1 filter for firma_kodu
    const allFilters = [
      { field: "_level1", operator: "", value: String(session.firma_kodu) },
      ...filters
    ];

    const payload = {
      [method]: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        filters: allFilters,
        sorts: "",
        params: "",
        limit: 500,
        offset: 0,
      },
    };

    console.log(`[dia-service] Calling ${diaBaseUrl} with method: ${method}`);

    const response = await axios.post(diaBaseUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
  }

  /**
   * Fetch user list from DIA
   */
  async fetchUserList(userId: string): Promise<Record<number, string>> {
    const session = await this.getValidSession(userId);
    if (!session) {
      throw new AppError("No valid DIA session", 401);
    }

    const diaUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
    
    const payload = {
      sis_kullanici_listele: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        filters: [],
        sorts: "",
        params: "",
        limit: 500,
        offset: 0,
      },
    };

    const response = await axios.post(diaUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const result = response.data;
    const users: Record<number, string> = {};
    const userList = result.result || [];

    for (const user of userList) {
      if (user._key && user.gercekadi) {
        users[user._key] = user.gercekadi;
      } else if (user._key && user.kullaniciadi) {
        users[user._key] = user.kullaniciadi;
      }
    }

    return users;
  }

  /**
   * Fetch üst işlem türleri from DIA
   */
  async fetchUstIslemTurleri(userId: string): Promise<Array<{ _key: number; aciklama: string }>> {
    const session = await this.getValidSession(userId);
    if (!session) {
      throw new AppError("No valid DIA session", 401);
    }

    const diaUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/sis/json`;
    
    const payload = {
      sis_ust_islem_turu_listele: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        filters: [{ field: "durum", value: "A", operator: "=" }],
        sorts: [],
        params: {},
        limit: 100,
        offset: 0,
      },
    };

    const response = await axios.post(diaUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const result = response.data.result || [];
    return result.map((item: any) => ({
      _key: item._key,
      aciklama: item.aciklama || item.ack || `Tür ${item._key}`,
    }));
  }

  /**
   * Fetch transaction detail from DIA
   */
  async fetchDetail(userId: string, transactionType: string, recordKey: string): Promise<any> {
    const session = await this.getValidSession(userId);
    if (!session) {
      throw new AppError("No valid DIA session", 401);
    }

    const detailConfig = DETAIL_METHOD_MAPPING[transactionType];
    if (!detailConfig) {
      throw new AppError(`Unknown transaction type: ${transactionType}`, 400);
    }

    const numericKey = parseInt(recordKey, 10);
    if (isNaN(numericKey)) {
      throw new AppError(`Invalid recordKey: ${recordKey} - must be numeric`, 400);
    }

    const diaUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/${detailConfig.endpoint}/json`;
    
    let payload: Record<string, unknown>;
    
    if (detailConfig.useKeyParam) {
      payload = {
        [detailConfig.method]: {
          session_id: session.session_id,
          firma_kodu: session.firma_kodu,
          donem_kodu: session.donem_kodu,
          key: numericKey,
          params: "",
        },
      };
    } else {
      payload = {
        [detailConfig.method]: {
          session_id: session.session_id,
          firma_kodu: session.firma_kodu,
          donem_kodu: session.donem_kodu,
          filters: [{ field: "_key", operator: "", value: numericKey }],
          sorts: "",
          params: "",
          limit: 1,
          offset: 0,
        },
      };
    }

    const response = await axios.post(diaUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data;
  }

  /**
   * Get module mappings
   */
  getModuleMappings() {
    return MODULE_MAPPINGS;
  }

  /**
   * Get parent receipt mappings
   */
  getParentReceiptMappings() {
    return PARENT_RECEIPT_MAPPINGS;
  }
}

export const diaService = new DiaService();
