# Sumen Backend

Node.js + Express + TypeScript backend for Sumen Onay Sistemi.

## Kurulum

### Gereksinimler

- Node.js 18+
- MySQL 8.0+

### Adımlar

1. Bağımlılıkları yükle:
```bash
cd backend
npm install
```

2. MySQL veritabanını oluştur:
```bash
mysql -u root -p < sql/schema.sql
```

3. Ortam değişkenlerini ayarla:
```bash
cp .env.example .env
# .env dosyasını düzenle
```

4. Geliştirme sunucusunu başlat:
```bash
npm run dev
```

5. Prodüksiyon için:
```bash
npm run build
npm start
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Yeni kullanıcı kaydı
- `POST /api/auth/login` - Kullanıcı girişi
- `POST /api/auth/logout` - Çıkış
- `GET /api/auth/me` - Mevcut kullanıcı bilgisi
- `PUT /api/auth/profile` - Profil güncelleme
- `POST /api/auth/change-password` - Şifre değiştirme

### DIA
- `POST /api/dia/login` - DIA ERP bağlantısı
- `POST /api/dia/sync` - İşlem senkronizasyonu
- `POST /api/dia/approve` - Onay/Red/Analiz
- `GET /api/dia/users` - DIA kullanıcı listesi
- `GET /api/dia/ust-islem-turleri` - Üst işlem türleri
- `POST /api/dia/detail` - İşlem detayı

### Transactions
- `GET /api/transactions` - İşlem listesi
- `GET /api/transactions/summary` - İşlem özeti
- `GET /api/transactions/:id` - İşlem detayı
- `PUT /api/transactions/:id` - İşlem güncelleme

### Settings
- `GET /api/settings/mail` - Mail ayarları
- `PUT /api/settings/mail` - Mail ayarları kaydet
- `POST /api/settings/mail/test` - SMTP test
- `GET /api/settings/notifications` - Bildirim ayarları
- `PUT /api/settings/notifications` - Bildirim ayarları kaydet
- `GET /api/settings/dia` - DIA bağlantı durumu
- `PUT /api/settings/dia/ust-islem` - Üst işlem türü ayarları

## Deployment

### PM2 ile
```bash
npm run build
pm2 start dist/app.js --name sumen-api
```

### Docker ile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/app.js"]
```
