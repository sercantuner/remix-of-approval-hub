import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { env } from '../config/env';
import { User, AuthPayload, AuthResponse, LoginRequest, RegisterRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

export class AuthService {
  /**
   * Yeni kullanıcı kaydı
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const { email, password, fullName } = data;

    // E-posta kontrolü
    const existingUsers = await query<User[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      throw new AppError('Bu e-posta adresi zaten kayıtlı', 409);
    }

    // Şifre hash'leme
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Kullanıcı oluştur
    await query(
      `INSERT INTO users (id, email, password_hash, full_name, role) 
       VALUES (?, ?, ?, ?, 'approver')`,
      [userId, email, passwordHash, fullName]
    );

    // Token oluştur
    const token = this.generateToken({ sub: userId, email, role: 'approver' });

    return {
      token,
      user: {
        id: userId,
        email,
        fullName,
        role: 'approver',
      },
    };
  }

  /**
   * Kullanıcı girişi
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const { email, password } = data;

    // Kullanıcıyı bul
    const users = await query<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      throw new AppError('E-posta veya şifre hatalı', 401);
    }

    const user = users[0];

    // Şifre kontrolü
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new AppError('E-posta veya şifre hatalı', 401);
    }

    // Token oluştur
    const token = this.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    };
  }

  /**
   * Mevcut kullanıcı bilgilerini getir
   */
  async getMe(userId: string): Promise<Omit<User, 'password_hash'>> {
    const users = await query<User[]>(
      `SELECT id, email, full_name, role, 
              dia_sunucu_adi, dia_firma_kodu, dia_donem_kodu,
              dia_session_id, dia_session_expires,
              dia_ust_islem_approve_key, dia_ust_islem_reject_key, dia_ust_islem_analyze_key,
              created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    return users[0];
  }

  /**
   * Kullanıcı profilini güncelle
   */
  async updateProfile(userId: string, data: Partial<User>): Promise<void> {
    const allowedFields = ['full_name', 'role'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return;
    }

    values.push(userId);
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Şifre değiştirme
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const users = await query<User[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      throw new AppError('Kullanıcı bulunamadı', 404);
    }

    const isValidPassword = await bcrypt.compare(oldPassword, users[0].password_hash);
    if (!isValidPassword) {
      throw new AppError('Mevcut şifre hatalı', 401);
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );
  }

  /**
   * JWT Token oluştur
   */
  private generateToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn,
    });
  }

  /**
   * Token doğrula
   */
  verifyToken(token: string): AuthPayload {
    return jwt.verify(token, env.jwt.secret) as AuthPayload;
  }
}

export const authService = new AuthService();
