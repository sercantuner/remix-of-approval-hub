import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../config/database';
import { User, PendingTransaction, TransactionType, TransactionStatus } from '../types';
import { AppError } from '../middleware/errorHandler';
import { diaService } from './dia.service';

// Module mappings
const MODULE_MAPPINGS: Record<string, any> = {
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

// Parent receipt mappings
const PARENT_RECEIPT_MAPPINGS: Record<string, { method: string; endpoint: string }> = {
  current_account: { method: "scf_carihesap_fisi_listele", endpoint: "scf/json" },
  bank: { method: "bcs_banka_fisi_listele", endpoint: "bcs/json" }
};

interface ParentReceiptData {
  ustIslemKey: number | null;
  userId: number | null;
}

export class DiaSyncService {
  /**
   * Sync transactions from DIA to local database
   */
  async syncTransactions(userId: string): Promise<{
    success: boolean;
    synced: Record<string, number>;
    errors: string[];
  }> {
    // Get valid session
    const session = await diaService.getValidSession(userId);
    if (!session) {
      throw new AppError("No valid DIA session. Please login to DIA first.", 401);
    }

    // Get user profile for üst işlem keys
    const users = await query<User[]>(
      `SELECT dia_firma_kodu, dia_ust_islem_approve_key, dia_ust_islem_reject_key, dia_ust_islem_analyze_key
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      throw new AppError("User not found", 404);
    }

    const profile = users[0];
    const syncResults: Record<string, number> = {};
    const errors: string[] = [];
    const transactionsToUpsert: any[] = [];

    // Fetch data for each transaction type in parallel
    console.log("[dia-sync] Starting parallel fetch for all transaction types");
    
    const fetchPromises = Object.entries(MODULE_MAPPINGS).map(async ([txType, mapping]) => {
      try {
        console.log(`[dia-sync] Fetching ${txType} using ${mapping.method}`);
        const result = await diaService.fetchDiaData(session, mapping.method, mapping.endpoint);
        
        if (result.code === "401" && result.msg === "INVALID_SESSION") {
          return { txType, mapping, records: [], success: false, error: "INVALID_SESSION" };
        }
        
        const records = result.result || [];
        console.log(`[dia-sync] ${txType}: Found ${records.length} records`);
        return { txType, mapping, records, success: true };
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`[dia-sync] Error fetching ${txType}:`, errMessage);
        return { txType, mapping, records: [], success: false, error: errMessage };
      }
    });

    const fetchResults = await Promise.all(fetchPromises);

    // Fetch parent receipt maps for current_account and bank
    const [currentAccountReceiptMap, bankReceiptMap] = await Promise.all([
      this.fetchParentReceiptMap(session, "current_account"),
      this.fetchParentReceiptMap(session, "bank")
    ]);

    // Process each transaction type
    for (const { txType, mapping, records, success, error } of fetchResults) {
      if (!success) {
        errors.push(`${txType}: ${error}`);
        continue;
      }

      let parentReceiptMap: Map<number, ParentReceiptData> | undefined;
      if (txType === "current_account") {
        parentReceiptMap = currentAccountReceiptMap;
      } else if (txType === "bank") {
        parentReceiptMap = bankReceiptMap;
      }

      for (const record of records) {
        const status = this.determineStatus(record, profile, parentReceiptMap);
        
        // Build DIA record ID
        const diaRecordId = `${txType}_${record[mapping.keyField]}`;
        
        // Extract fields
        const transaction = {
          id: uuidv4(),
          user_id: userId,
          dia_record_id: diaRecordId,
          dia_firma_kodu: profile.dia_firma_kodu,
          dia_raw_data: JSON.stringify(record),
          transaction_type: txType as TransactionType,
          document_no: String(record[mapping.docField] || ""),
          description: record.aciklama || record.fisaciklama || "",
          counterparty: record[mapping.counterpartyField] || "",
          amount: parseFloat(record[mapping.amountField]) || 0,
          currency: record.dbirimkodu || "TRY",
          transaction_date: record[mapping.dateField] || new Date().toISOString().split('T')[0],
          status,
        };

        transactionsToUpsert.push(transaction);
      }

      syncResults[txType] = records.length;
    }

    // Upsert transactions to database
    if (transactionsToUpsert.length > 0) {
      await this.upsertTransactions(transactionsToUpsert);
    }

    // Remove transactions that no longer exist in DIA
    const diaRecordIds = transactionsToUpsert.map(t => t.dia_record_id);
    if (diaRecordIds.length > 0) {
      await this.removeStaleTransactions(userId, diaRecordIds);
    }

    return {
      success: errors.length === 0,
      synced: syncResults,
      errors,
    };
  }

  /**
   * Fetch parent receipts for üst işlem türü lookup
   */
  private async fetchParentReceiptMap(
    session: any,
    txType: "current_account" | "bank"
  ): Promise<Map<number, ParentReceiptData>> {
    const mapping = PARENT_RECEIPT_MAPPINGS[txType];
    if (!mapping) {
      return new Map();
    }

    try {
      const result = await diaService.fetchDiaData(session, mapping.method, mapping.endpoint);
      const records = result.result || [];
      
      const parentMap = new Map<number, ParentReceiptData>();
      for (const record of records) {
        const key = record._key;
        if (key) {
          const keyNum = typeof key === "number" ? key : parseInt(String(key));
          const ustIslemKey = record._key_sis_ust_islem_turu;
          const userKey = record._user;
          
          parentMap.set(keyNum, {
            ustIslemKey: ustIslemKey ? (typeof ustIslemKey === "number" ? ustIslemKey : parseInt(String(ustIslemKey))) : null,
            userId: userKey ? (typeof userKey === "number" ? userKey : parseInt(String(userKey))) : null,
          });
        }
      }
      
      return parentMap;
    } catch (err) {
      console.error(`[dia-sync] Error fetching parent ${txType}:`, err);
      return new Map();
    }
  }

  /**
   * Determine transaction status based on üst işlem türü
   */
  private determineStatus(
    record: any,
    profile: User,
    parentReceiptMap?: Map<number, ParentReceiptData>
  ): TransactionStatus {
    let ustIslemKey = record._key_sis_ust_islem_turu;
    
    // If no üst işlem key on record, try from parent receipt map
    if (!ustIslemKey && parentReceiptMap) {
      const parentKey = record._key_scf_carihesap_fisi || record._key_bcs_banka_fisi;
      if (parentKey) {
        const parentKeyNum = typeof parentKey === "number" ? parentKey : parseInt(String(parentKey));
        const parentData = parentReceiptMap.get(parentKeyNum);
        ustIslemKey = parentData?.ustIslemKey;
      }
    }
    
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
    
    return "pending";
  }

  /**
   * Upsert transactions to database
   */
  private async upsertTransactions(transactions: any[]): Promise<void> {
    for (const tx of transactions) {
      await query(
        `INSERT INTO pending_transactions 
          (id, user_id, dia_record_id, dia_firma_kodu, dia_raw_data, transaction_type, 
           document_no, description, counterparty, amount, currency, transaction_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           dia_raw_data = VALUES(dia_raw_data),
           document_no = VALUES(document_no),
           description = VALUES(description),
           counterparty = VALUES(counterparty),
           amount = VALUES(amount),
           currency = VALUES(currency),
           transaction_date = VALUES(transaction_date),
           status = VALUES(status),
           updated_at = CURRENT_TIMESTAMP`,
        [
          tx.id, tx.user_id, tx.dia_record_id, tx.dia_firma_kodu, tx.dia_raw_data,
          tx.transaction_type, tx.document_no, tx.description, tx.counterparty,
          tx.amount, tx.currency, tx.transaction_date, tx.status
        ]
      );
    }
  }

  /**
   * Remove transactions that no longer exist in DIA
   */
  private async removeStaleTransactions(userId: string, existingRecordIds: string[]): Promise<void> {
    if (existingRecordIds.length === 0) return;

    // Build placeholders for IN clause
    const placeholders = existingRecordIds.map(() => '?').join(',');
    
    await query(
      `DELETE FROM pending_transactions 
       WHERE user_id = ? AND dia_record_id NOT IN (${placeholders}) AND status = 'pending'`,
      [userId, ...existingRecordIds]
    );
  }
}

export const diaSyncService = new DiaSyncService();
