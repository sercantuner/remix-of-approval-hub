-- =====================================================
-- SUMEN ONAY SİSTEMİ - MySQL Veritabanı Şeması
-- =====================================================
-- Bu şema PostgreSQL/Supabase'den MySQL'e taşıma için hazırlanmıştır.
-- MySQL 8.0+ gerektirir (UUID() fonksiyonu için)
-- =====================================================

-- Veritabanı oluştur
CREATE DATABASE IF NOT EXISTS sumen_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sumen_db;

-- =====================================================
-- 1. USERS TABLOSU (profiles tablosu yerine)
-- =====================================================
-- Kullanıcı profilleri ve DIA ERP bağlantı bilgilerini tutar
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'approver',
  
  -- DIA ERP Bağlantı Bilgileri
  dia_sunucu_adi VARCHAR(255) COMMENT 'DIA sunucu adı (örn: demo)',
  dia_api_key VARCHAR(255) COMMENT 'DIA API anahtarı',
  dia_ws_kullanici VARCHAR(255) COMMENT 'DIA web servis kullanıcı adı',
  dia_ws_sifre VARCHAR(255) COMMENT 'DIA web servis şifresi',
  dia_session_id VARCHAR(255) COMMENT 'Aktif DIA oturum ID',
  dia_session_expires DATETIME COMMENT 'DIA oturum bitiş zamanı',
  dia_firma_kodu INT DEFAULT 1 COMMENT 'DIA firma kodu',
  dia_donem_kodu INT DEFAULT 0 COMMENT 'DIA dönem kodu',
  
  -- Üst İşlem Türü Anahtarları (onay/red/analiz için)
  dia_ust_islem_approve_key INT COMMENT 'Onay için üst işlem türü _key değeri',
  dia_ust_islem_reject_key INT COMMENT 'Red için üst işlem türü _key değeri',
  dia_ust_islem_analyze_key INT COMMENT 'Analiz için üst işlem türü _key değeri',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. PENDING_TRANSACTIONS TABLOSU
-- =====================================================
-- Onay bekleyen işlemleri (DIA'dan çekilen cache) tutar
CREATE TABLE pending_transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  
  -- DIA Kayıt Bilgileri
  dia_record_id VARCHAR(255) NOT NULL COMMENT 'DIA kayıt ID (örn: scf_siparis_28392)',
  dia_firma_kodu INT COMMENT 'DIA firma kodu',
  dia_raw_data JSON COMMENT 'DIA ham veri (tüm alanlar)',
  
  -- İşlem Bilgileri
  transaction_type VARCHAR(50) NOT NULL COMMENT 'İşlem türü: invoice, bank, cash, current_account, check_note, order',
  document_no VARCHAR(255) NOT NULL COMMENT 'Belge numarası',
  description TEXT COMMENT 'İşlem açıklaması',
  counterparty VARCHAR(255) COMMENT 'Cari/Müşteri adı',
  amount DECIMAL(18,2) NOT NULL COMMENT 'Tutar',
  currency VARCHAR(10) DEFAULT 'TRY' COMMENT 'Para birimi',
  transaction_date DATE NOT NULL COMMENT 'İşlem tarihi',
  
  -- Durum Bilgileri
  status VARCHAR(20) DEFAULT 'pending' COMMENT 'Durum: pending, approved, rejected, analyzing',
  attachment_url TEXT COMMENT 'Ek dosya URL',
  
  -- Onay Bilgileri
  approved_at DATETIME,
  approved_by CHAR(36),
  
  -- Red Bilgileri
  rejected_at DATETIME,
  rejected_by CHAR(36),
  rejection_reason TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,
  
  INDEX idx_user_status (user_id, status),
  INDEX idx_firma_status (dia_firma_kodu, status),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_document_no (document_no),
  INDEX idx_transaction_date (transaction_date),
  UNIQUE INDEX idx_user_dia_record (user_id, dia_record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. APPROVAL_HISTORY TABLOSU
-- =====================================================
-- Onay/red geçmişini tutar
CREATE TABLE approval_history (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  transaction_id CHAR(36) COMMENT 'İlgili işlem ID (silinmiş olabilir)',
  user_id CHAR(36) NOT NULL COMMENT 'İşlemi yapan kullanıcı',
  
  action VARCHAR(20) NOT NULL COMMENT 'Aksiyon: approve, reject, analyze',
  notes TEXT COMMENT 'Notlar/açıklama',
  dia_response JSON COMMENT 'DIA API yanıtı',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_transaction (transaction_id),
  INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. MAIL_SETTINGS TABLOSU
-- =====================================================
-- Kullanıcı SMTP ayarlarını tutar
CREATE TABLE mail_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL UNIQUE,
  
  -- SMTP Ayarları
  smtp_host VARCHAR(255) NOT NULL COMMENT 'SMTP sunucu adresi',
  smtp_port INT DEFAULT 587 COMMENT 'SMTP port (587 TLS, 465 SSL)',
  smtp_secure BOOLEAN DEFAULT TRUE COMMENT 'Güvenli bağlantı kullan',
  smtp_user VARCHAR(255) NOT NULL COMMENT 'SMTP kullanıcı adı',
  smtp_password VARCHAR(255) NOT NULL COMMENT 'SMTP şifresi',
  
  -- Gönderici Bilgileri
  sender_email VARCHAR(255) NOT NULL COMMENT 'Gönderici e-posta adresi',
  sender_name VARCHAR(255) DEFAULT 'Sumen Onay Sistemi' COMMENT 'Gönderici adı',
  
  -- Doğrulama
  is_verified BOOLEAN DEFAULT FALSE COMMENT 'SMTP ayarları doğrulandı mı',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. NOTIFICATION_SETTINGS TABLOSU
-- =====================================================
-- Bildirim ayarlarını tutar
CREATE TABLE notification_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL UNIQUE,
  
  -- Genel Ayarlar
  is_enabled BOOLEAN DEFAULT FALSE COMMENT 'Bildirimler aktif mi',
  notification_hours JSON DEFAULT '[10]' COMMENT 'Bildirim saatleri (örn: [10, 14, 18])',
  last_notification_sent DATETIME COMMENT 'Son bildirim gönderilme zamanı',
  
  -- Kategori Bazlı E-posta Listeleri (JSON array)
  invoice_emails JSON DEFAULT '[]' COMMENT 'Fatura bildirimi alacak e-postalar',
  order_emails JSON DEFAULT '[]' COMMENT 'Sipariş bildirimi alacak e-postalar',
  current_account_emails JSON DEFAULT '[]' COMMENT 'Cari hareket bildirimi alacak e-postalar',
  bank_emails JSON DEFAULT '[]' COMMENT 'Banka hareketi bildirimi alacak e-postalar',
  cash_emails JSON DEFAULT '[]' COMMENT 'Kasa hareketi bildirimi alacak e-postalar',
  check_note_emails JSON DEFAULT '[]' COMMENT 'Çek/senet bildirimi alacak e-postalar',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ÖRNEK VERİ (Opsiyonel - Test için)
-- =====================================================
-- Yorum satırlarını kaldırarak test verisi ekleyebilirsiniz

-- INSERT INTO users (email, password_hash, full_name, role) VALUES
-- ('admin@sirket.com', '$2a$10$...', 'Admin Kullanıcı', 'admin');

-- =====================================================
-- VERİ TAŞIMA NOTLARI
-- =====================================================
-- PostgreSQL'den MySQL'e taşırken dikkat edilecekler:
-- 
-- 1. UUID Dönüşümü:
--    PostgreSQL: gen_random_uuid()
--    MySQL: UUID() (tire içerir: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
--
-- 2. JSONB -> JSON:
--    PostgreSQL JSONB MySQL'de JSON olarak saklanır
--    Sorgularda JSON_EXTRACT() kullanılır
--
-- 3. TIMESTAMPTZ -> DATETIME:
--    Zaman dilimi bilgisi kaybolur, UTC olarak saklanması önerilir
--
-- 4. ARRAY -> JSON:
--    PostgreSQL text[] gibi array tipleri JSON array olarak saklanır
--    Örn: notification_hours: [10, 14, 18]
--
-- 5. Boolean:
--    MySQL'de BOOLEAN aslında TINYINT(1)
--    TRUE = 1, FALSE = 0
-- =====================================================
