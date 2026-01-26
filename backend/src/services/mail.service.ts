import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { query } from '../config/database';
import { MailSettings } from '../types';
import { AppError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export class MailService {
  /**
   * Get mail settings for user
   */
  async getSettings(userId: string): Promise<MailSettings | null> {
    const settings = await query<MailSettings[]>(
      'SELECT * FROM mail_settings WHERE user_id = ?',
      [userId]
    );

    return settings.length > 0 ? settings[0] : null;
  }

  /**
   * Save or update mail settings
   */
  async saveSettings(userId: string, data: Partial<MailSettings>): Promise<MailSettings> {
    const existing = await this.getSettings(userId);

    if (existing) {
      // Update existing settings
      await query(
        `UPDATE mail_settings SET 
          smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_password = ?,
          sender_email = ?, sender_name = ?, is_verified = FALSE
         WHERE user_id = ?`,
        [
          data.smtp_host, data.smtp_port, data.smtp_secure, data.smtp_user, data.smtp_password,
          data.sender_email, data.sender_name, userId
        ]
      );
    } else {
      // Insert new settings
      await query(
        `INSERT INTO mail_settings 
          (id, user_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, sender_email, sender_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), userId, data.smtp_host, data.smtp_port, data.smtp_secure,
          data.smtp_user, data.smtp_password, data.sender_email, data.sender_name
        ]
      );
    }

    return (await this.getSettings(userId))!;
  }

  /**
   * Test SMTP connection
   */
  async testConnection(userId: string): Promise<{ success: boolean; message: string }> {
    const settings = await this.getSettings(userId);

    if (!settings) {
      throw new AppError("Mail ayarları bulunamadı", 404);
    }

    try {
      const transporter = this.createTransporter(settings);
      
      // Verify connection
      await transporter.verify();

      // Send test email
      await transporter.sendMail({
        from: `${settings.sender_name} <${settings.sender_email}>`,
        to: settings.sender_email,
        subject: 'Sumen - SMTP Test',
        text: 'Bu bir test e-postasıdır. SMTP ayarlarınız doğru çalışıyor.',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #10b981;">✅ SMTP Bağlantısı Başarılı</h2>
            <p>Bu bir test e-postasıdır. SMTP ayarlarınız doğru çalışıyor.</p>
            <p style="color: #666; font-size: 12px;">Sumen Onay Sistemi</p>
          </div>
        `,
      });

      // Mark as verified
      await query(
        'UPDATE mail_settings SET is_verified = TRUE WHERE user_id = ?',
        [userId]
      );

      return { success: true, message: 'SMTP bağlantısı başarılı, test e-postası gönderildi' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      return { success: false, message: `SMTP hatası: ${errorMessage}` };
    }
  }

  /**
   * Send email
   */
  async sendEmail(userId: string, params: SendEmailParams): Promise<void> {
    const settings = await this.getSettings(userId);

    if (!settings) {
      throw new AppError("Mail ayarları bulunamadı", 404);
    }

    const transporter = this.createTransporter(settings);

    await transporter.sendMail({
      from: `${settings.sender_name} <${settings.sender_email}>`,
      to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }

  /**
   * Send notification email for pending transactions
   */
  async sendNotificationEmail(
    userId: string,
    recipient: string,
    category: { type: string; label: string; count: number }
  ): Promise<void> {
    const settings = await this.getSettings(userId);

    if (!settings || !settings.is_verified) {
      console.log('[mail-service] Mail settings not found or not verified');
      return;
    }

    const html = this.buildNotificationEmailHtml(category);

    await this.sendEmail(userId, {
      to: recipient,
      subject: `Onay Bekleyen ${category.count} ${category.label} - Sumen`,
      html,
    });
  }

  /**
   * Create nodemailer transporter
   */
  private createTransporter(settings: MailSettings): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    return nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password,
      },
    });
  }

  /**
   * Build notification email HTML
   */
  private buildNotificationEmailHtml(category: { type: string; label: string; count: number }): string {
    const iconMap: Record<string, string> = {
      invoice: '📄',
      current_account: '💳',
      bank: '🏦',
      cash: '💵',
      check_note: '📝',
      order: '📦',
    };

    const icon = iconMap[category.type] || '📋';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Sumen Onay Sistemi</h1>
          </div>
          <div style="padding: 30px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 48px;">${icon}</span>
            </div>
            <h2 style="color: #333; text-align: center; margin-bottom: 20px;">
              ${category.count} Adet ${category.label}
            </h2>
            <p style="color: #666; text-align: center; margin-bottom: 30px;">
              Onayınızı bekleyen işlemler bulunmaktadır.
            </p>
            <div style="text-align: center;">
              <a href="#" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                İşlemleri Görüntüle
              </a>
            </div>
          </div>
          <div style="background-color: #f8f8f8; padding: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Bu e-posta Sumen Onay Sistemi tarafından otomatik olarak gönderilmiştir.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const mailService = new MailService();
