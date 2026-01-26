import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Özel hata sınıfı
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Endpoint bulunamadı: ${req.method} ${req.path}`,
  });
}

/**
 * Global hata yakalama middleware'i
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ Hata:', err);

  // Varsayılan değerler
  let statusCode = 500;
  let message = 'Sunucu hatası oluştu';
  let stack: string | undefined;

  // AppError ise detayları al
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  // Geliştirme modunda stack trace göster
  if (env.isDev) {
    stack = err.stack;
  }

  // MySQL hataları
  if ((err as any).code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Bu kayıt zaten mevcut';
  }

  if ((err as any).code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'Referans verilen kayıt bulunamadı';
  }

  // Validation hataları (express-validator)
  if ((err as any).errors && Array.isArray((err as any).errors)) {
    statusCode = 400;
    message = (err as any).errors.map((e: any) => e.msg).join(', ');
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(stack && { stack }),
  });
}

/**
 * Async handler wrapper - try/catch yazmadan async fonksiyonları kullanmak için
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
