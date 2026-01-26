import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router();

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
 * POST /api/auth/register
 * Yeni kullanıcı kaydı
 */
router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Geçerli bir e-posta adresi girin'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Şifre en az 6 karakter olmalıdır'),
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Ad soyad gereklidir'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, fullName } = req.body;

    const result = await authService.register({ email, password, fullName });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Kayıt başarılı',
    });
  })
);

/**
 * POST /api/auth/login
 * Kullanıcı girişi
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Geçerli bir e-posta adresi girin'),
    body('password').notEmpty().withMessage('Şifre gereklidir'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    res.json({
      success: true,
      data: result,
      message: 'Giriş başarılı',
    });
  })
);

/**
 * POST /api/auth/logout
 * Kullanıcı çıkışı (client-side token silme)
 */
router.post('/logout', authenticate, (req: Request, res: Response) => {
  // JWT stateless olduğu için server-side logout yok
  // Client token'ı silmeli
  res.json({
    success: true,
    message: 'Çıkış başarılı',
  });
});

/**
 * GET /api/auth/me
 * Mevcut kullanıcı bilgileri
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const user = await authService.getMe(req.user.sub);

    res.json({
      success: true,
      data: user,
    });
  })
);

/**
 * PUT /api/auth/profile
 * Profil güncelleme
 */
router.put(
  '/profile',
  authenticate,
  [
    body('fullName').optional().trim().notEmpty().withMessage('Ad soyad boş olamaz'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    await authService.updateProfile(req.user.sub, {
      full_name: req.body.fullName,
    });

    res.json({
      success: true,
      message: 'Profil güncellendi',
    });
  })
);

/**
 * POST /api/auth/change-password
 * Şifre değiştirme
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('oldPassword').notEmpty().withMessage('Mevcut şifre gereklidir'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Yeni şifre en az 6 karakter olmalıdır'),
    handleValidation,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const { oldPassword, newPassword } = req.body;

    await authService.changePassword(req.user.sub, oldPassword, newPassword);

    res.json({
      success: true,
      message: 'Şifre değiştirildi',
    });
  })
);

export default router;
