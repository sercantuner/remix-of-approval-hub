import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { User, PendingTransaction, TransactionStatus, ApprovalHistory } from '../types';
import { AppError } from '../middleware/errorHandler';
import { diaService } from './dia.service';

interface DiaUpdateResponse {
  success: boolean;
  code?: string;
  message?: string;
  result?: unknown;
}

interface ApproveResult {
  transactionId: string;
  success: boolean;
  error?: string;
}

export class DiaApproveService {
  /**
   * Approve, reject or analyze transactions
   */
  async processTransactions(
    userId: string,
    transactionIds: string[],
    action: "approve" | "reject" | "analyze",
    reason?: string
  ): Promise<{ success: boolean; results: ApproveResult[]; message: string }> {
    // Get valid session
    const session = await diaService.getValidSession(userId);
    if (!session) {
      throw new AppError("No valid DIA session. Please login to DIA first.", 401);
    }

    // Get user profile for üst işlem keys
    const users = await query<User[]>(
      `SELECT dia_ust_islem_approve_key, dia_ust_islem_reject_key, dia_ust_islem_analyze_key
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      throw new AppError("User not found", 404);
    }

    const profile = users[0];

    // Get transactions from database
    const placeholders = transactionIds.map(() => '?').join(',');
    const transactions = await query<PendingTransaction[]>(
      `SELECT * FROM pending_transactions WHERE id IN (${placeholders}) AND user_id = ?`,
      [...transactionIds, userId]
    );

    if (transactions.length === 0) {
      throw new AppError("No transactions found", 404);
    }

    const results: ApproveResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process each transaction
    for (const tx of transactions) {
      try {
        // Extract transaction type and key from dia_record_id
        const [txType, keyStr] = tx.dia_record_id.split('_');
        const key = parseInt(keyStr, 10);

        if (isNaN(key)) {
          results.push({ transactionId: tx.id, success: false, error: "Invalid record key" });
          failCount++;
          continue;
        }

        let diaResult: DiaUpdateResponse;

        // Get parent key for grouped transactions
        let parentKey = key;
        if (tx.dia_raw_data) {
          const rawData = typeof tx.dia_raw_data === 'string' 
            ? JSON.parse(tx.dia_raw_data) 
            : tx.dia_raw_data;
          
          if (txType === "current_account" && rawData._key_scf_carihesap_fisi) {
            parentKey = rawData._key_scf_carihesap_fisi;
          } else if (txType === "bank" && rawData._key_bcs_banka_fisi) {
            parentKey = rawData._key_bcs_banka_fisi;
          }
        }

        // Call appropriate DIA update method based on transaction type
        switch (txType) {
          case "invoice":
            diaResult = await this.updateDiaInvoice(session, key, action, reason, profile);
            break;
          case "current_account":
            diaResult = await this.updateDiaCurrentAccount(session, parentKey, action, reason, profile);
            break;
          case "bank":
            diaResult = await this.updateDiaBank(session, parentKey, action, reason, profile);
            break;
          case "cash":
            diaResult = await this.updateDiaCash(session, key, action, reason, profile);
            break;
          default:
            results.push({ transactionId: tx.id, success: false, error: `Unsupported transaction type: ${txType}` });
            failCount++;
            continue;
        }

        if (diaResult.success) {
          // Update local transaction status
          const newStatus: TransactionStatus = action === "approve" ? "approved" 
            : action === "reject" ? "rejected" 
            : "analyzing";

          const updateFields = action === "approve" 
            ? `status = ?, approved_at = CURRENT_TIMESTAMP, approved_by = ?`
            : action === "reject"
            ? `status = ?, rejected_at = CURRENT_TIMESTAMP, rejected_by = ?, rejection_reason = ?`
            : `status = ?`;

          const updateParams = action === "approve"
            ? [newStatus, userId, tx.id]
            : action === "reject"
            ? [newStatus, userId, reason || null, tx.id]
            : [newStatus, tx.id];

          await query(
            `UPDATE pending_transactions SET ${updateFields} WHERE id = ?`,
            updateParams
          );

          // Record in approval history
          await query(
            `INSERT INTO approval_history (id, transaction_id, user_id, action, notes, dia_response)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), tx.id, userId, action, reason || null, JSON.stringify(diaResult)]
          );

          results.push({ transactionId: tx.id, success: true });
          successCount++;
        } else {
          results.push({ transactionId: tx.id, success: false, error: diaResult.message });
          failCount++;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        results.push({ transactionId: tx.id, success: false, error: errorMessage });
        failCount++;
      }
    }

    return {
      success: failCount === 0,
      results,
      message: `${successCount} başarılı, ${failCount} başarısız`,
    };
  }

  /**
   * Update invoice in DIA
   */
  private async updateDiaInvoice(
    session: any,
    key: number,
    action: "approve" | "reject" | "analyze",
    reason?: string,
    profile?: User
  ): Promise<DiaUpdateResponse> {
    const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

    const kart: Record<string, unknown> = { _key: key };

    if (action === "approve") {
      if (profile?.dia_ust_islem_approve_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_approve_key;
      }
      kart.ekalan5 = "Onaylandı";
    } else if (action === "reject") {
      if (profile?.dia_ust_islem_reject_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_reject_key;
      }
      kart.ekalan5 = `RED : ${reason || "Belirtilmedi"}`;
    } else if (action === "analyze") {
      if (profile?.dia_ust_islem_analyze_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_analyze_key;
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

    return this.callDiaApi(apiUrl, payload);
  }

  /**
   * Update current account receipt in DIA
   */
  private async updateDiaCurrentAccount(
    session: any,
    parentKey: number,
    action: "approve" | "reject" | "analyze",
    reason?: string,
    profile?: User
  ): Promise<DiaUpdateResponse> {
    const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

    const kart: Record<string, unknown> = { 
      _key: parentKey,
      m_kalemler: [], // Required empty array
    };

    if (action === "approve") {
      if (profile?.dia_ust_islem_approve_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_approve_key;
      }
      kart.aciklama3 = "Onaylandı";
    } else if (action === "reject") {
      if (profile?.dia_ust_islem_reject_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_reject_key;
      }
      kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
    } else if (action === "analyze") {
      if (profile?.dia_ust_islem_analyze_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_analyze_key;
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

    return this.callDiaApi(apiUrl, payload);
  }

  /**
   * Update bank receipt in DIA
   */
  private async updateDiaBank(
    session: any,
    parentKey: number,
    action: "approve" | "reject" | "analyze",
    reason?: string,
    profile?: User
  ): Promise<DiaUpdateResponse> {
    const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/bcs/json`;

    const kart: Record<string, unknown> = { 
      _key: parentKey,
      m_kalemler: [], // Required empty array
    };

    if (action === "approve") {
      if (profile?.dia_ust_islem_approve_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_approve_key;
      }
      kart.aciklama3 = "Onaylandı";
    } else if (action === "reject") {
      if (profile?.dia_ust_islem_reject_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_reject_key;
      }
      kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
    } else if (action === "analyze") {
      if (profile?.dia_ust_islem_analyze_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_analyze_key;
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

    return this.callDiaApi(apiUrl, payload);
  }

  /**
   * Update cash receipt in DIA
   */
  private async updateDiaCash(
    session: any,
    key: number,
    action: "approve" | "reject" | "analyze",
    reason?: string,
    profile?: User
  ): Promise<DiaUpdateResponse> {
    const apiUrl = `https://${session.sunucu_adi}.ws.dia.com.tr/api/v3/scf/json`;

    const kart: Record<string, unknown> = { 
      _key: key,
      m_kalemler: [],
    };

    if (action === "approve") {
      if (profile?.dia_ust_islem_approve_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_approve_key;
      }
      kart.aciklama3 = "Onaylandı";
    } else if (action === "reject") {
      if (profile?.dia_ust_islem_reject_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_reject_key;
      }
      kart.aciklama3 = `RED : ${reason || "Belirtilmedi"}`;
    } else if (action === "analyze") {
      if (profile?.dia_ust_islem_analyze_key) {
        kart._key_sis_ust_islem_turu = profile.dia_ust_islem_analyze_key;
      }
      kart.aciklama3 = "";
    }

    const payload = {
      scf_kasa_fisi_guncelle: {
        session_id: session.session_id,
        firma_kodu: session.firma_kodu,
        donem_kodu: session.donem_kodu,
        kart,
      },
    };

    return this.callDiaApi(apiUrl, payload);
  }

  /**
   * Call DIA API and handle response
   */
  private async callDiaApi(url: string, payload: any): Promise<DiaUpdateResponse> {
    try {
      console.log("[dia-approve] Sending DIA request:", JSON.stringify(payload));

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const result = response.data;
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
}

export const diaApproveService = new DiaApproveService();
