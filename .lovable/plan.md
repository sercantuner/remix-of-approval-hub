

# DIA Session Kolon Adı Düzeltme Planı

## Tespit Edilen Hata

Edge function kodunda yanlış kolon adı kullanılmış:

| Kodda Kullanılan | Veritabanındaki Doğru Ad |
|------------------|--------------------------|
| `dia_session_expiry` | `dia_session_expires` |

Bu hata `getValidDiaSession` fonksiyonunun çalışmamasına neden oluyor.

## Yapılacak Değişiklik

**Dosya:** `supabase/functions/dia-approve/index.ts`

### 1. Select sorgusunda kolon adı düzeltmesi (satır 35)

```typescript
// Yanlış:
.select("dia_sunucu_adi, dia_session_id, dia_firma_kodu, dia_donem_kodu, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_expiry")

// Doğru:
.select("dia_sunucu_adi, dia_session_id, dia_firma_kodu, dia_donem_kodu, dia_api_key, dia_ws_kullanici, dia_ws_sifre, dia_session_expires")
```

### 2. Expiry kontrolünde kolon adı düzeltmesi (satır 46)

```typescript
// Yanlış:
const expiry = profile.dia_session_expiry ? new Date(profile.dia_session_expiry) : null;

// Doğru:
const expiry = profile.dia_session_expires ? new Date(profile.dia_session_expires) : null;
```

### 3. Session yenileme update sorgusunda kolon adı düzeltmesi (satır 88-91)

```typescript
// Yanlış:
.update({
  dia_session_id: newSessionId,
  dia_session_expiry: newExpiry.toISOString(),
})

// Doğru:
.update({
  dia_session_id: newSessionId,
  dia_session_expires: newExpiry.toISOString(),
})
```

## Düzeltme Sonrası Beklenen Davranış

1. Session bilgileri doğru okunacak
2. Session süresi dolmuşsa otomatik yenilenecek
3. DIA API'sine gerçek `scf_fatura_guncelle` isteği gönderilecek
4. Gerçek DIA yanıtı `approval_history.dia_response` alanına kaydedilecek

