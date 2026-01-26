import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database';
import { mailService } from '../services/mail.service';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { NotificationSettings, User } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Validation middleware
 */
const handleValidation = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validasyon hatası',
      details: errors.array(),
    });
    return;
  }
  next();
};

// ==================== MAIL SETTINGS ====================

/**
 * GET /api/settings/mail
 * Get mail settings
 */
router.get(
  '/mail',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const settings = await mailService.getSettings(req.user.sub);

    res.json({
      success: true,
      data: settings ? {
        ...settings,
        smtp_password: '********', // Hide password
      } : null,
    });
  })
);

/**
 * PUT /api/settings/mail
 * Save mail settings
 */
router.put(
  '/mail',
  [
    body('smtp_host').notEmpty().withMessage('SMTP host gereklidir'),
    body('smtp_port').isInt({ min: 1 }).withMessage('Geçerli bir port numarası girin'),
    body('smtp_user').notEmpty().withMessage('SMTP kullanıcı adı gereklidir'),
    body('smtp_password').notEmpty().withMessage('SMTP şifresi gereklidir'),
    body('sender_email').isEmail().withMessage('Geçerli bir e-posta adresi girin'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const settings = await mailService.saveSettings(req.user.sub, req.body);

    res.json({
      success: true,
      data: {
        ...settings,
        smtp_password: '********',
      },
      message: 'Mail ayarları kaydedildi',
    });
  })
);

/**
 * POST /api/settings/mail/test
 * Test mail settings
 */
router.post(
  '/mail/test',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const result = await mailService.testConnection(req.user.sub);

    res.json({
      success: result.success,
      message: result.message,
    });
  })
);

// ==================== NOTIFICATION SETTINGS ====================

/**
 * GET /api/settings/notifications
 * Get notification settings
 */
router.get(
  '/notifications',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const settings = await query<NotificationSettings[]>(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [req.user.sub]
    );

    if (settings.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    // Parse JSON fields
    const data = settings[0];
    res.json({
      success: true,
      data: {
        ...data,
        notification_hours: typeof data.notification_hours === 'string' 
          ? JSON.parse(data.notification_hours) 
          : data.notification_hours,
        invoice_emails: typeof data.invoice_emails === 'string' 
          ? JSON.parse(data.invoice_emails) 
          : data.invoice_emails,
        order_emails: typeof data.order_emails === 'string' 
          ? JSON.parse(data.order_emails) 
          : data.order_emails,
        current_account_emails: typeof data.current_account_emails === 'string' 
          ? JSON.parse(data.current_account_emails) 
          : data.current_account_emails,
        bank_emails: typeof data.bank_emails === 'string' 
          ? JSON.parse(data.bank_emails) 
          : data.bank_emails,
        cash_emails: typeof data.cash_emails === 'string' 
          ? JSON.parse(data.cash_emails) 
          : data.cash_emails,
        check_note_emails: typeof data.check_note_emails === 'string' 
          ? JSON.parse(data.check_note_emails) 
          : data.check_note_emails,
      },
    });
  })
);

/**
 * PUT /api/settings/notifications
 * Save notification settings
 */
router.put(
  '/notifications',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const existing = await query<NotificationSettings[]>(
      'SELECT id FROM notification_settings WHERE user_id = ?',
      [req.user.sub]
    );

    const {
      is_enabled,
      notification_hours,
      invoice_emails,
      order_emails,
      current_account_emails,
      bank_emails,
      cash_emails,
      check_note_emails,
    } = req.body;

    if (existing.length > 0) {
      await query(
        `UPDATE notification_settings SET 
          is_enabled = ?, notification_hours = ?,
          invoice_emails = ?, order_emails = ?, current_account_emails = ?,
          bank_emails = ?, cash_emails = ?, check_note_emails = ?
         WHERE user_id = ?`,
        [
          is_enabled,
          JSON.stringify(notification_hours || []),
          JSON.stringify(invoice_emails || []),
          JSON.stringify(order_emails || []),
          JSON.stringify(current_account_emails || []),
          JSON.stringify(bank_emails || []),
          JSON.stringify(cash_emails || []),
          JSON.stringify(check_note_emails || []),
          req.user.sub,
        ]
      );
    } else {
      await query(
        `INSERT INTO notification_settings 
          (id, user_id, is_enabled, notification_hours, invoice_emails, order_emails,
           current_account_emails, bank_emails, cash_emails, check_note_emails)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.user.sub,
          is_enabled,
          JSON.stringify(notification_hours || []),
          JSON.stringify(invoice_emails || []),
          JSON.stringify(order_emails || []),
          JSON.stringify(current_account_emails || []),
          JSON.stringify(bank_emails || []),
          JSON.stringify(cash_emails || []),
          JSON.stringify(check_note_emails || []),
        ]
      );
    }

    res.json({
      success: true,
      message: 'Bildirim ayarları kaydedildi',
    });
  })
);

// ==================== DIA SETTINGS ====================

/**
 * GET /api/settings/dia
 * Get DIA connection settings
 */
router.get(
  '/dia',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const users = await query<User[]>(
      `SELECT dia_sunucu_adi, dia_firma_kodu, dia_donem_kodu, 
              dia_session_id, dia_session_expires,
              dia_ust_islem_approve_key, dia_ust_islem_reject_key, dia_ust_islem_analyze_key
       FROM users WHERE id = ?`,
      [req.user.sub]
    );

    if (users.length === 0) {
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    const user = users[0];
    const isConnected = !!user.dia_session_id && 
      new Date(user.dia_session_expires!).getTime() > Date.now();

    res.json({
      success: true,
      data: {
        sunucuAdi: user.dia_sunucu_adi,
        firmaKodu: user.dia_firma_kodu,
        donemKodu: user.dia_donem_kodu,
        isConnected,
        sessionExpires: user.dia_session_expires,
        ustIslemApproveKey: user.dia_ust_islem_approve_key,
        ustIslemRejectKey: user.dia_ust_islem_reject_key,
        ustIslemAnalyzeKey: user.dia_ust_islem_analyze_key,
      },
    });
  })
);

/**
 * PUT /api/settings/dia/ust-islem
 * Save üst işlem türü keys
 */
router.put(
  '/dia/ust-islem',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const { approveKey, rejectKey, analyzeKey } = req.body;

    await query(
      `UPDATE users SET 
        dia_ust_islem_approve_key = ?,
        dia_ust_islem_reject_key = ?,
        dia_ust_islem_analyze_key = ?
       WHERE id = ?`,
      [approveKey || null, rejectKey || null, analyzeKey || null, req.user.sub]
    );

    res.json({
      success: true,
      message: 'Üst işlem türü ayarları kaydedildi',
    });
  })
);

export default router;
