import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { diaService } from '../services/dia.service';
import { diaSyncService } from '../services/dia-sync.service';
import { diaApproveService } from '../services/dia-approve.service';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

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

/**
 * POST /api/dia/login
 * Login to DIA ERP
 */
router.post(
  '/login',
  [
    body('sunucuAdi').notEmpty().withMessage('Sunucu adı gereklidir'),
    body('apiKey').notEmpty().withMessage('API key gereklidir'),
    body('wsKullanici').notEmpty().withMessage('Web servis kullanıcı adı gereklidir'),
    body('wsSifre').notEmpty().withMessage('Web servis şifresi gereklidir'),
    body('firmaKodu').isInt({ min: 0 }).withMessage('Firma kodu sayı olmalıdır'),
    body('donemKodu').isInt({ min: 0 }).withMessage('Dönem kodu sayı olmalıdır'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const result = await diaService.login(req.user.sub, req.body);

    if (result.success) {
      res.json({
        success: true,
        data: {
          session_id: result.session_id,
          expires: result.expires,
        },
        message: 'DIA bağlantısı başarılı',
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error,
      });
    }
  })
);

/**
 * POST /api/dia/sync
 * Sync transactions from DIA
 */
router.post(
  '/sync',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const result = await diaSyncService.syncTransactions(req.user.sub);

    res.json({
      success: result.success,
      data: result.synced,
      errors: result.errors,
      message: result.success 
        ? `Senkronizasyon tamamlandı` 
        : `Bazı hatalar oluştu: ${result.errors.join(', ')}`,
    });
  })
);

/**
 * POST /api/dia/approve
 * Approve, reject or analyze transactions
 */
router.post(
  '/approve',
  [
    body('transactionIds').isArray({ min: 1 }).withMessage('En az bir işlem seçilmelidir'),
    body('action').isIn(['approve', 'reject', 'analyze']).withMessage('Geçersiz aksiyon'),
    body('reason').optional().isString(),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const { transactionIds, action, reason } = req.body;

    const result = await diaApproveService.processTransactions(
      req.user.sub,
      transactionIds,
      action,
      reason
    );

    res.json({
      success: result.success,
      data: result.results,
      message: result.message,
    });
  })
);

/**
 * GET /api/dia/users
 * Get DIA user list for name resolution
 */
router.get(
  '/users',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const users = await diaService.fetchUserList(req.user.sub);

    res.json({
      success: true,
      data: users,
    });
  })
);

/**
 * GET /api/dia/ust-islem-turleri
 * Get üst işlem türleri from DIA
 */
router.get(
  '/ust-islem-turleri',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const turleri = await diaService.fetchUstIslemTurleri(req.user.sub);

    res.json({
      success: true,
      data: turleri,
    });
  })
);

/**
 * POST /api/dia/detail
 * Get transaction detail from DIA
 */
router.post(
  '/detail',
  [
    body('transactionType').notEmpty().withMessage('İşlem türü gereklidir'),
    body('recordKey').notEmpty().withMessage('Kayıt anahtarı gereklidir'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const { transactionType, recordKey } = req.body;
    const detail = await diaService.fetchDetail(req.user.sub, transactionType, recordKey);

    res.json({
      success: true,
      data: detail,
    });
  })
);

export default router;
