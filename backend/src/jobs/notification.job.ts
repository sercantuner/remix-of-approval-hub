import cron from 'node-cron';
import { query } from '../config/database';
import { mailService } from '../services/mail.service';
import { NotificationSettings, PendingTransaction } from '../types';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  invoice: 'Fatura',
  current_account: 'Cari Hareket',
  bank: 'Banka Hareketi',
  cash: 'Kasa Hareketi',
  check_note: 'Çek/Senet',
  order: 'Sipariş',
};

/**
 * Process and send notification emails
 */
async function processNotifications(): Promise<void> {
  console.log('[notification-job] Starting notification job...');

  try {
    // Get all users with notifications enabled
    const settings = await query<(NotificationSettings & { user_id: string })[]>(
      `SELECT * FROM notification_settings WHERE is_enabled = TRUE`
    );

    console.log(`[notification-job] Found ${settings.length} users with notifications enabled`);

    const currentHour = new Date().getHours();

    for (const setting of settings) {
      try {
        // Parse notification hours
        const hours = typeof setting.notification_hours === 'string'
          ? JSON.parse(setting.notification_hours)
          : setting.notification_hours || [];

        // Check if current hour is in notification hours
        if (!hours.includes(currentHour)) {
          continue;
        }

        // Check if notification was already sent this hour
        if (setting.last_notification_sent) {
          const lastSent = new Date(setting.last_notification_sent);
          const hoursSinceLastSent = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceLastSent < 1) {
            console.log(`[notification-job] Skipping user ${setting.user_id} - already notified this hour`);
            continue;
          }
        }

        // Get pending transaction counts by type
        const counts = await query<{ transaction_type: string; count: number }[]>(
          `SELECT transaction_type, COUNT(*) as count 
           FROM pending_transactions 
           WHERE user_id = ? AND status = 'pending'
           GROUP BY transaction_type`,
          [setting.user_id]
        );

        if (counts.length === 0) {
          console.log(`[notification-job] No pending transactions for user ${setting.user_id}`);
          continue;
        }

        // Parse email lists
        const emailLists: Record<string, string[]> = {
          invoice: typeof setting.invoice_emails === 'string' 
            ? JSON.parse(setting.invoice_emails) 
            : setting.invoice_emails || [],
          order: typeof setting.order_emails === 'string' 
            ? JSON.parse(setting.order_emails) 
            : setting.order_emails || [],
          current_account: typeof setting.current_account_emails === 'string' 
            ? JSON.parse(setting.current_account_emails) 
            : setting.current_account_emails || [],
          bank: typeof setting.bank_emails === 'string' 
            ? JSON.parse(setting.bank_emails) 
            : setting.bank_emails || [],
          cash: typeof setting.cash_emails === 'string' 
            ? JSON.parse(setting.cash_emails) 
            : setting.cash_emails || [],
          check_note: typeof setting.check_note_emails === 'string' 
            ? JSON.parse(setting.check_note_emails) 
            : setting.check_note_emails || [],
        };

        // Send notifications for each transaction type
        for (const { transaction_type, count } of counts) {
          const emails = emailLists[transaction_type] || [];
          
          if (emails.length === 0) {
            continue;
          }

          const category = {
            type: transaction_type,
            label: TRANSACTION_TYPE_LABELS[transaction_type] || transaction_type,
            count,
          };

          for (const email of emails) {
            try {
              await mailService.sendNotificationEmail(setting.user_id, email, category);
              console.log(`[notification-job] Sent notification to ${email} for ${count} ${transaction_type}`);
            } catch (err) {
              console.error(`[notification-job] Failed to send to ${email}:`, err);
            }
          }
        }

        // Update last notification sent time
        await query(
          'UPDATE notification_settings SET last_notification_sent = CURRENT_TIMESTAMP WHERE user_id = ?',
          [setting.user_id]
        );

      } catch (err) {
        console.error(`[notification-job] Error processing user ${setting.user_id}:`, err);
      }
    }

    console.log('[notification-job] Notification job completed');
  } catch (err) {
    console.error('[notification-job] Fatal error:', err);
  }
}

/**
 * Start the notification cron job
 */
export function startNotificationJob(): void {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[notification-job] Cron triggered');
    await processNotifications();
  });

  console.log('✅ Notification cron job scheduled (runs every hour at :00)');
}

// Export for manual testing
export { processNotifications };
