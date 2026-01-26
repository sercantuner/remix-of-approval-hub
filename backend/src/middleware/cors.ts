import cors from 'cors';
import { env } from '../config/env';

/**
 * CORS yapılandırması
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Origin yoksa (örn: Postman, curl) izin ver
    if (!origin) {
      callback(null, true);
      return;
    }

    // İzin verilen originleri kontrol et
    if (env.server.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (env.isDev) {
      // Geliştirme modunda tüm originlere izin ver
      callback(null, true);
    } else {
      callback(new Error('CORS politikası tarafından engellendi'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400, // 24 saat
});
