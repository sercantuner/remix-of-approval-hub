

# DIA Fatura Onay/Red Güncelleme Planı

Bu plan, fatura onay veya red işlemlerinde DIA ERP sistemine otomatik güncelleme gönderilmesini sağlar.

## Yapılacak İşlemler

### 1. dia-approve Edge Function Güncelleme

Mevcut `dia-approve` fonksiyonunu, fatura işlemlerinde DIA API'sine güncelleme gönderecek şekilde düzenleyeceğiz.

**Onay Durumu:**
```json
{
  "scf_fatura_guncelle": {
    "session_id": "{session_id}",
    "firma_kodu": {firma_kodu},
    "donem_kodu": {donem_kodu},
    "kart": {
      "_key": {_key değeri},
      "ustislemack": "MUHASEBELEŞEBİLİR",
      "ekalan5": "Onaylandı"
    }
  }
}
```

**Red Durumu:**
```json
{
  "scf_fatura_guncelle": {
    "session_id": "{session_id}",
    "firma_kodu": {firma_kodu},
    "donem_kodu": {donem_kodu},
    "kart": {
      "_key": {_key değeri},
      "ekalan5": "RED : {red_nedeni}"
    }
  }
}
```

### 2. İş Akışı

1. Kullanıcı faturayı onaylar veya reddeder
2. Sistem `pending_transactions` tablosundan `dia_raw_data._key` değerini alır
3. Kullanıcının profil bilgilerinden DIA session bilgileri alınır
4. İşlem türü kontrol edilir (sadece `invoice` türü için DIA güncellemesi yapılır)
5. DIA API'sine `scf_fatura_guncelle` isteği gönderilir
6. DIA yanıtı `approval_history.dia_response` alanına kaydedilir
7. Yerel veritabanı güncellenir

### 3. Hata Yönetimi

- DIA API hatası durumunda işlem yerel olarak kaydedilir ama hata loglanır
- Session süresi dolmuşsa otomatik yenileme yapılır
- `_key` değeri bulunamazsa DIA güncellemesi atlanır

---

## Teknik Detaylar

### Değiştirilecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `supabase/functions/dia-approve/index.ts` | DIA fatura güncelleme mantığı eklenir |

### Yeni Fonksiyonlar

```typescript
// DIA oturumu kontrolü ve otomatik yenileme
async function getValidDiaSession(supabase, userId): Promise<DiaSession | null>

// Fatura güncelleme isteği gönderme
async function updateDiaInvoice(session: DiaSession, key: number, action: 'approve' | 'reject', reason?: string): Promise<DiaUpdateResponse>
```

### API Endpoint

```text
POST https://{sunucu_adi}.ws.dia.com.tr/api/v3/scf/json
```

### Güncellenecek Alanlar

| Alan | Onay | Red |
|------|------|-----|
| `ustislemack` | "MUHASEBELEŞEBİLİR" | (değişmez) |
| `ekalan5` | "Onaylandı" | "RED : {neden}" |

### Örnek DIA Yanıtı (Beklenen)

```json
{
  "code": "200",
  "msg": "",
  "result": { "_key": 2440313 }
}
```

