import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../types';

/**
 * JWT Token doğrulama middleware'i
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ 
        success: false, 
        error: 'Yetkilendirme başlığı eksik veya hatalı' 
      });
      return;
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      res.status(401).json({ 
        success: false, 
        error: 'Token bulunamadı' 
      });
      return;
    }

    const decoded = jwt.verify(token, env.jwt.secret) as AuthPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        success: false, 
        error: 'Oturum süresi doldu, lütfen tekrar giriş yapın' 
      });
      return;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ 
        success: false, 
        error: 'Geçersiz token' 
      });
      return;
    }

    res.status(500).json({ 
      success: false, 
      error: 'Kimlik doğrulama hatası' 
    });
  }
}

/**
 * Rol bazlı yetkilendirme middleware'i
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        error: 'Kimlik doğrulaması gerekli' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ 
        success: false, 
        error: 'Bu işlem için yetkiniz yok' 
      });
      return;
    }

    next();
  };
}

/**
 * Opsiyonel kimlik doğrulama (token varsa doğrula, yoksa devam et)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, env.jwt.secret) as AuthPayload;
    req.user = decoded;
  } catch {
    // Token geçersiz ama opsiyonel olduğu için devam et
  }
  
  next();
}
