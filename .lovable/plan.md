
# DIA Fatura Key Düzeltme Planı

## Tespit Edilen Sorunlar

### 1. _key String Olarak Gönderiliyor

Edge function loglarında:
```json
"kart":{"_key":"2444764",...}
```

DIA API integer bekliyor, ama kod string gönderiyor. Bu dönüşüm yapılmalı.

### 2. Kodda Düzeltme Gerekli

**Dosya:** `supabase/functions/dia-approve/index.ts`

Satır 249'da `_key` değeri alınırken integer'a dönüştürülmeli:

```text
// Mevcut (Yanlış):
const diaKey = transaction.dia_raw_data._key;

// Düzeltilmiş (Doğru):
const diaKey = parseInt(transaction.dia_raw_data._key, 10);
```

Ayrıca `updateDiaInvoice` fonksiyonunda `kart._key` atanırken de kontrol gerekli (satır 131):

```text
// Mevcut - key zaten number olarak geliyor ama emin olmak için:
const kart: Record<string, unknown> = {
  _key: key,  // key parametresi number olarak tanımlı, bu OK
};
```

## Ek Kontroller

Sadece `_key` integer dönüşümü yeterli olmalı. Çünkü:
- `dia_raw_data._key` değeri `"2444764"` (string)
- Bu değer faturanın kendi key'i
- `kalemler` dizisi boş - yani kalem bilgisi sync edilmemiş ama bu sorun değil

## Değişiklik Özeti

| Dosya | Satır | Değişiklik |
|-------|-------|------------|
| `supabase/functions/dia-approve/index.ts` | 249 | `_key` değerini `parseInt()` ile integer'a dönüştür |

## Beklenen Sonuç

Düzeltme sonrası DIA API'ye gönderilecek payload:
```json
{
  "scf_fatura_guncelle": {
    "session_id": "...",
    "firma_kodu": 7,
    "donem_kodu": 6,
    "kart": {
      "_key": 2444764,
      "ustislemack": "MUHASEBELEŞEBİLİR",
      "ekalan5": "Onaylandı"
    }
  }
}
```

Integer `_key` ile DIA güncellemesi başarılı olmalı.
