
# Üst İşlem Türü Yönetimi Planı

## Özet
Onay ve red işlemlerinde `ustislemturuack` alanı yerine `_key_sis_ust_islem_turu` alanını kullanarak DIA'daki üst işlem türlerini değiştireceğiz. Bunun için:
1. DIA bağlantısı kurulduğunda üst işlem türlerini çekeceğiz
2. Kullanıcının onay ve red için hangi üst işlem türünü kullanacağını seçmesini sağlayacağız
3. Fatura güncellemelerinde seçilen üst işlem türünün `_key` değerini kullanacağız

---

## Adım 1: Veritabanı Değişiklikleri

`profiles` tablosuna iki yeni alan eklenecek:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `dia_ust_islem_approve_key` | integer | Onay için kullanılacak üst işlem türü _key değeri |
| `dia_ust_islem_reject_key` | integer | Red için kullanılacak üst işlem türü _key değeri |

---

## Adım 2: Edge Function Değişiklikleri

### dia-api/index.ts
Yeni bir action eklenecek: `list_ust_islem_turu`

```text
Endpoint: POST https://{sunucu}.ws.dia.com.tr/api/v3/sis/json
Payload:
{
  "sis_ust_islem_turu_listele": {
    "session_id": "{session_id}",
    "firma_kodu": {firma_kodu},
    "donem_kodu": {donem_kodu},
    "filters": [
      { "field": "durum", "value": "A", "operator": "=" }
    ],
    "sorts": [],
    "params": {},
    "limit": 25,
    "offset": 0
  }
}
```

### dia-approve/index.ts
`updateDiaInvoice` fonksiyonunda değişiklik:

Mevcut:
```typescript
if (action === "approve") {
  kart.ustislemturuack = "MUHASEBELEŞİR";
  kart.ekalan5 = "Onaylandı";
}
```

Yeni:
```typescript
if (action === "approve" && approveKey) {
  kart._key_sis_ust_islem_turu = approveKey;
  kart.ekalan5 = "Onaylandı";
} else if (action === "reject" && rejectKey) {
  kart._key_sis_ust_islem_turu = rejectKey;
  kart.ekalan5 = `RED : ${reason || "Belirtilmedi"}`;
}
```

---

## Adım 3: Frontend Değişiklikleri

### src/lib/diaApi.ts
Yeni fonksiyon eklenecek:
```typescript
export async function diaFetchUstIslemTurleri(): Promise<Array<{_key: number, aciklama: string}>>
```

### src/components/settings/DiaConnectionForm.tsx
Bağlantı başarılı olduktan sonra:
1. Üst işlem türlerini çek
2. Dropdown ile onay türü seçimi göster
3. Dropdown ile red türü seçimi göster
4. Seçimleri `profiles` tablosuna kaydet

UI Tasarımı:
```
┌─────────────────────────────────────────────────────┐
│  Dia ERP Bağlantısı                                 │
├─────────────────────────────────────────────────────┤
│  [Mevcut form alanları...]                          │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Üst İşlem Türü Ayarları                            │
│  (Bağlantı kurulduktan sonra görünür)               │
│                                                     │
│  Onay Üst İşlem Türü:                               │
│  ┌─────────────────────────────────────────────┐    │
│  │ MUHASEBELEŞİR                          ▼    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Red Üst İşlem Türü:                                │
│  ┌─────────────────────────────────────────────┐    │
│  │ MUHASEBELEŞMEYECEKTİR                  ▼    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [Üst İşlem Ayarlarını Kaydet]                      │
└─────────────────────────────────────────────────────┘
```

---

## Teknik Detaylar

### DIA API Response Formatı (beklenen)
```json
{
  "code": "200",
  "result": [
    { "_key": 1, "aciklama": "MUHASEBELEŞİR", "durum": "A" },
    { "_key": 2, "aciklama": "MUHASEBELEŞMEYECEKTİR", "durum": "A" },
    { "_key": 3, "aciklama": "BEKLEMEDE", "durum": "A" }
  ]
}
```

### Güncelleme Payload (son hali)
```json
{
  "scf_fatura_guncelle": {
    "session_id": "...",
    "firma_kodu": 7,
    "donem_kodu": 6,
    "kart": {
      "_key": 2443042,
      "_key_sis_ust_islem_turu": 1,
      "ekalan5": "Onaylandı"
    }
  }
}
```

---

## Değiştirilecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `supabase/functions/dia-api/index.ts` | `list_ust_islem_turu` action ekleme |
| `supabase/functions/dia-approve/index.ts` | `_key_sis_ust_islem_turu` kullanımı, profile'dan key okuma |
| `src/lib/diaApi.ts` | `diaFetchUstIslemTurleri()` fonksiyonu ekleme |
| `src/components/settings/DiaConnectionForm.tsx` | Üst işlem türü seçim UI'ı ekleme |
| **Migration** | `profiles` tablosuna 2 yeni kolon ekleme |

---

## Akış Diyagramı

1. Kullanıcı DIA bağlantı bilgilerini girer
2. "Bağlantıyı Test Et ve Kaydet" butonuna tıklar
3. `dia-login` çağrılır, bağlantı başarılı
4. Otomatik olarak `sis_ust_islem_turu_listele` çağrılır
5. Üst işlem türleri dropdown'larda gösterilir
6. Kullanıcı onay ve red için türleri seçer
7. Seçimler `profiles` tablosuna kaydedilir
8. Fatura onay/red işlemlerinde seçilen `_key` değerleri kullanılır
