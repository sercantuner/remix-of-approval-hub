
# MySQL Veritabanı Yapılandırma Planı

## Özet
Backend uygulamasını verilen MySQL bağlantı bilgileriyle yapılandıracağım.

## Bağlantı Bilgileri
| Parametre | Değer |
|-----------|-------|
| Host | db.diauygulama.com |
| Port | 3306 |
| Kullanıcı | uremote |
| Şifre | !Rotayazilim59 |
| Veritabanı | sumen |

---

## Yapılacak İşlemler

### 1. Backend .env.example Dosyası Güncelleme
Örnek yapılandırma dosyasını güncelleyeceğim.

### 2. Backend README Güncelleme
Kurulum talimatlarını netleştireceğim.

---

## Sunucu Kurulum Adımları

Aşağıdaki adımları kendi sunucunuzda yapmanız gerekecek:

### Adım 1: Backend .env Dosyası Oluştur
```bash
cd backend
cp .env.example .env
```

### Adım 2: .env Dosyasını Düzenle
```env
# Veritabanı Ayarları
DB_HOST=db.diauygulama.com
DB_PORT=3306
DB_USER=uremote
DB_PASSWORD=!Rotayazilim59
DB_NAME=sumen

# JWT Ayarları (güvenli bir secret belirleyin)
JWT_SECRET=sumen-super-secret-jwt-key-2024-change-this
JWT_EXPIRES_IN=7d

# Sunucu Ayarları
PORT=3001
NODE_ENV=production

# CORS - Frontend URL'nizi ekleyin
FRONTEND_URL=https://sumen.diauygulama.com
ALLOWED_ORIGINS=https://sumen.diauygulama.com
```

### Adım 3: Veritabanı Şemasını İçe Aktar
```bash
mysql -h db.diauygulama.com -u uremote -p sumen < sql/schema.sql
```

### Adım 4: Bağımlılıkları Yükle ve Başlat
```bash
npm install
npm run build
npm start
```

---

## Teknik Detaylar

### Mevcut Yapı
Backend zaten MySQL için doğru şekilde yapılandırılmış:

- **database.ts**: `mysql2/promise` kullanarak connection pool oluşturuyor
- **env.ts**: Ortam değişkenlerinden ayarları okuyor
- **auth.service.ts**: MySQL sorgularıyla kullanıcı işlemleri yapıyor
- **schema.sql**: Tüm tablolar MySQL 8.0+ için hazır

### Güvenlik Notları
- JWT_SECRET'ı production'da mutlaka değiştirin
- ALLOWED_ORIGINS'e sadece gerçek frontend URL'lerini ekleyin
- Rate limiting varsayılan olarak aktif (15 dakikada 100 istek)
