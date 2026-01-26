
# MySQL + Node.js Tasimasina ve Login Sayfasi Duzenleme Plani

## Ozet

Bu plan, Sumen Onay Sistemi'ni Supabase/Cloud bagimliligini ortadan kaldirarak kendi sunucunuzda MySQL + Node.js ile calisabilecek sekilde tasimayi ve login sayfasindaki "100+ Gunluk Islem" ve "%99.9 Guvenilirlik" yazisini kaldirmayi kapsamaktadir.

---

## Bolum 1: Login Sayfasi Duzenleme (Hemen Uygulanacak)

### Degisiklik
**Dosya:** `src/pages/Login.tsx`

Satir 66-77 arasindaki istatistik bolumu kaldirılacak:

```tsx
// KALDIRILACAK BOLUM:
<div className="mt-12 grid grid-cols-2 gap-6 text-white/90">
  <div className="text-center">
    <p className="text-3xl font-bold">100+</p>
    <p className="text-sm text-white/70">Gunluk Islem</p>
  </div>
  <div className="text-center">
    <p className="text-3xl font-bold">%99.9</p>
    <p className="text-sm text-white/70">Guvenilirlik</p>
  </div>
</div>
```

---

## Bolum 2: MySQL Veritabani Semasi

### 2.1 Yeni Dosya: `backend/sql/schema.sql`

5 tablo icin MySQL semasi olusturulacak:

```sql
-- Kullanicilar tablosu (profiles yerine)
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'approver',
  
  -- DIA baglanti bilgileri
  dia_sunucu_adi VARCHAR(255),
  dia_api_key VARCHAR(255),
  dia_ws_kullanici VARCHAR(255),
  dia_ws_sifre VARCHAR(255),
  dia_session_id VARCHAR(255),
  dia_session_expires DATETIME,
  dia_firma_kodu INT DEFAULT 1,
  dia_donem_kodu INT DEFAULT 0,
  dia_ust_islem_approve_key INT,
  dia_ust_islem_reject_key INT,
  dia_ust_islem_analyze_key INT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bekleyen islemler
CREATE TABLE pending_transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  dia_record_id VARCHAR(255) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  document_no VARCHAR(255) NOT NULL,
  description TEXT,
  counterparty VARCHAR(255),
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'TRY',
  transaction_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  dia_raw_data JSON,
  dia_firma_kodu INT,
  attachment_url TEXT,
  approved_at DATETIME,
  approved_by CHAR(36),
  rejected_at DATETIME,
  rejected_by CHAR(36),
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_firma_status (dia_firma_kodu, status)
);

-- Onay gecmisi
CREATE TABLE approval_history (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  transaction_id CHAR(36),
  user_id CHAR(36) NOT NULL,
  action VARCHAR(20) NOT NULL,
  notes TEXT,
  dia_response JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at)
);

-- Mail ayarlari
CREATE TABLE mail_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL UNIQUE,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INT DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT TRUE,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_password VARCHAR(255) NOT NULL,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) DEFAULT 'Sumen Onay Sistemi',
  is_verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bildirim ayarlari
CREATE TABLE notification_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT FALSE,
  notification_hours JSON DEFAULT '[10]',
  invoice_emails JSON DEFAULT '[]',
  order_emails JSON DEFAULT '[]',
  current_account_emails JSON DEFAULT '[]',
  bank_emails JSON DEFAULT '[]',
  cash_emails JSON DEFAULT '[]',
  check_note_emails JSON DEFAULT '[]',
  last_notification_sent DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Bolum 3: Node.js Backend Yapisi

### 3.1 Proje Yapisi

```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts      # MySQL baglantisi
│   │   └── env.ts           # Ortam degiskenleri
│   ├── middleware/
│   │   ├── auth.ts          # JWT dogrulama
│   │   ├── errorHandler.ts  # Hata yonetimi
│   │   └── cors.ts          # CORS ayarlari
│   ├── routes/
│   │   ├── auth.routes.ts   # Login, Register, Logout
│   │   ├── dia.routes.ts    # DIA API islemleri
│   │   ├── transactions.routes.ts
│   │   ├── settings.routes.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── dia.service.ts   # DIA API entegrasyonu
│   │   ├── mail.service.ts  # Nodemailer
│   │   └── auth.service.ts  # JWT + bcrypt
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── transaction.model.ts
│   │   └── settings.model.ts
│   ├── jobs/
│   │   └── notification.job.ts  # node-cron
│   ├── types/
│   │   └── index.ts
│   └── app.ts
├── sql/
│   └── schema.sql
├── package.json
├── tsconfig.json
└── .env.example
```

### 3.2 Backend Bagimliliklari

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.5",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.7",
    "node-cron": "^3.0.3",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "uuid": "^9.0.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.10.4",
    "@types/nodemailer": "^6.4.14",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2",
    "nodemon": "^3.0.2"
  }
}
```

### 3.3 API Endpoint Listesi

| Endpoint | Method | Aciklama |
|----------|--------|----------|
| /api/auth/register | POST | Yeni kullanici kaydi |
| /api/auth/login | POST | Giris - JWT token doner |
| /api/auth/logout | POST | Cikis |
| /api/auth/me | GET | Mevcut kullanici bilgisi |
| /api/dia/login | POST | DIA ERP baglantisi |
| /api/dia/sync | POST | Islem senkronizasyonu |
| /api/dia/approve | POST | Onay/Red/Analiz |
| /api/dia/api | POST | Genel DIA API proxy |
| /api/dia/ust-islem-turleri | GET | Ust islem turleri listesi |
| /api/transactions | GET | Islem listesi |
| /api/transactions/:id | GET | Islem detayi |
| /api/transactions/:id | PUT | Islem guncelleme |
| /api/settings/mail | GET/PUT | Mail ayarlari |
| /api/settings/mail/test | POST | Mail testi |
| /api/settings/notifications | GET/PUT | Bildirim ayarlari |

---

## Bolum 4: Backend Servisleri (Edge Functions -> Express)

### 4.1 Auth Service (Supabase Auth yerine)

```typescript
// src/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';

export class AuthService {
  async register(email: string, password: string, fullName: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuid();
    
    await db.execute(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)',
      [id, email, passwordHash, fullName]
    );
    
    return { id, email, fullName };
  }

  async login(email: string, password: string) {
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      throw new Error('Invalid credentials');
    }
    
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return { token, user: { id: user.id, email: user.email, fullName: user.full_name } };
  }
}
```

### 4.2 DIA Service (6 Edge Function -> 1 Service)

```typescript
// src/services/dia.service.ts - Mevcut edge function mantigi korunacak
export class DiaService {
  // dia-login -> diaLogin()
  // dia-api -> diaApi()
  // dia-sync -> diaSync()
  // dia-approve -> diaApprove()
  
  async diaLogin(userId: string, params: DiaLoginParams) {
    // Mevcut dia-login/index.ts mantigi
  }
  
  async diaSync(userId: string) {
    // Mevcut dia-sync/index.ts mantigi
  }
  
  async diaApprove(userId: string, transactionIds: string[], action: string, reason?: string) {
    // Mevcut dia-approve/index.ts mantigi
  }
}
```

### 4.3 Mail Service (denomailer -> nodemailer)

```typescript
// src/services/mail.service.ts
import nodemailer from 'nodemailer';

export class MailService {
  async sendNotificationEmail(settings: MailSettings, recipient: string, category: CategoryCount) {
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password,
      },
    });

    await transporter.sendMail({
      from: `${settings.sender_name} <${settings.sender_email}>`,
      to: recipient,
      subject: `Onay Bekleyen ${category.count} ${category.label} - Sumen`,
      html: this.buildEmailHtml(category),
    });
  }
}
```

### 4.4 Cron Job (pg_cron -> node-cron)

```typescript
// src/jobs/notification.job.ts
import cron from 'node-cron';
import { MailService } from '../services/mail.service';

// Her saat basinda calistir
cron.schedule('0 * * * *', async () => {
  console.log('Running notification job...');
  await processNotifications();
});
```

---

## Bolum 5: Frontend Degisiklikleri

### 5.1 API Client (Supabase -> Axios)

**Yeni dosya:** `src/lib/api.ts`

```typescript
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### 5.2 Auth Context Guncelleme

**Dosya:** `src/contexts/AuthContext.tsx`

```typescript
// Supabase auth yerine custom JWT auth
import api from '@/lib/api';

export function AuthProvider({ children }) {
  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
    return true;
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };
}
```

### 5.3 DIA API Guncelleme

**Dosya:** `src/lib/diaApi.ts`

```typescript
// supabase.functions.invoke yerine axios
import api from './api';

export async function diaLogin(params: DiaLoginParams) {
  const { data } = await api.post('/dia/login', params);
  return data;
}

export async function diaSync() {
  const { data } = await api.post('/dia/sync');
  return data;
}

export async function diaApprove(transactionIds: string[], action: string, reason?: string) {
  const { data } = await api.post('/dia/approve', { transactionIds, action, reason });
  return data;
}
```

### 5.4 Dashboard ve Diger Sayfalar

Guncellenecek dosyalar:
- `src/pages/Login.tsx` - supabase.auth.signInWithPassword -> api.post('/auth/login')
- `src/pages/Register.tsx` - supabase.auth.signUp -> api.post('/auth/register')
- `src/pages/Dashboard.tsx` - supabase.from() -> api.get/post()
- `src/components/settings/DiaConnectionForm.tsx`
- `src/components/settings/MailSettingsForm.tsx`
- `src/components/settings/NotificationSettingsForm.tsx`

---

## Bolum 6: Ortam Degiskenleri

### Backend .env

```
# Veritabani
DB_HOST=localhost
DB_PORT=3306
DB_USER=sumen_user
DB_PASSWORD=guclu_sifre
DB_NAME=sumen_db

# JWT
JWT_SECRET=cok-gizli-anahtar-en-az-32-karakter
JWT_EXPIRES_IN=7d

# Sunucu
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://sumen.diauygulama.com
```

### Frontend .env

```
VITE_API_URL=https://api.sumen.diauygulama.com
```

---

## Bolum 7: Uygulama Sirasi

| Adim | Gorev | Tahmini Sure |
|------|-------|--------------|
| 1 | Login sayfasi duzenleme (istatistik kaldirma) | 5 dakika |
| 2 | MySQL sema dosyasi olusturma | 1 saat |
| 3 | Node.js proje altyapisi (package.json, tsconfig, config) | 2 saat |
| 4 | Auth servisi (register, login, JWT middleware) | 3 saat |
| 5 | DIA servisi (login, sync, approve, api) | 6 saat |
| 6 | Mail servisi ve cron job | 2 saat |
| 7 | Transaction ve Settings route'lari | 3 saat |
| 8 | Frontend API katmani (api.ts, AuthContext) | 2 saat |
| 9 | Sayfa ve component guncellemeleri | 4 saat |
| 10 | Test ve hata duzeltme | 4 saat |
| **Toplam** | | **~27 saat (3-4 gun)** |

---

## Bolum 8: Deployment Notlari

### Sunucu Gereksinimleri
- Node.js 18+
- MySQL 8.0+
- PM2 veya Docker
- Nginx (reverse proxy)
- SSL sertifikasi (Let's Encrypt)

### Veri Tasima
1. Mevcut PostgreSQL verilerini export et
2. UUID ve JSON alanlarini MySQL formatina donustur
3. MySQL'e import et

---

## Onay Sonrasi Ilk Adimlar

1. Login sayfasindaki istatistik yazilari kaldirilacak
2. MySQL sema dosyasi olusturulacak
3. Node.js backend proje altyapisi kurulacak
4. Sirayla tum servisler tasincak

