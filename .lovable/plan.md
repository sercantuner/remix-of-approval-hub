
# Kasa Fişleri ACBO/ACAL Filtreleme Planı

## Problem Özeti
Kasa fişlerinde "ACBO" (Açılış Borç) ve "ACAL" (Açılış Alacak) fiş türleri açılış fişleri olduğu için listelenmemeli. Ayrıca mevcut veritabanında bu türdeki kayıtlar da temizlenmeli.

## Mevcut Veritabanı Durumu
```
id: c2623774-f192-4479-b90d-0df4531f0670 | document_no: 000007 | turu: ACBO
id: f1553914-bdab-44ed-9d11-a56a410ba5e6 | document_no: 000008 | turu: ACAL
```

## Yapılacak Değişiklikler

### 1. Edge Function Filtreleme
**Dosya:** `supabase/functions/dia-sync/index.ts`

Mevcut filtreleme yapısına (satır 507-536 civarı) kasa fişleri için yeni bir filtre eklenecek:

```typescript
// Filter out cash records with turu = 'ACBO' or 'ACAL' (açılış fişleri)
if (txType === "cash") {
  const beforeCount = filteredRecords.length;
  filteredRecords = filteredRecords.filter((r: any) => {
    const turu = r.turu || "";
    const isOpening = turu === "ACBO" || turu === "ACAL" || 
                      turu.toUpperCase() === "ACBO" || turu.toUpperCase() === "ACAL";
    if (isOpening) {
      console.log(`[dia-sync] Filtering out ${turu} cash record: ${r.fisno}`);
    }
    return !isOpening;
  });
  console.log(`[dia-sync] cash: Filtered ${beforeCount - filteredRecords.length} ACBO/ACAL records, ${filteredRecords.length} remaining`);
}
```

### 2. Veritabanı Temizleme
Edge function deploy edildikten sonra, mevcut ACBO/ACAL kayıtlarını silmek için SQL çalıştırılacak:

```sql
DELETE FROM pending_transactions 
WHERE transaction_type = 'cash' 
AND (dia_raw_data->>'turu' = 'ACBO' OR dia_raw_data->>'turu' = 'ACAL');
```

## Teknik Detaylar

| Alan | Değer |
|------|-------|
| Filtreleme Konumu | Satır 537 civarı (bank filtresinden sonra) |
| Etkilenen Tür | `cash` (kasa işlemleri) |
| Filtrelenen Değerler | `ACBO`, `ACAL` |
| Silme Kriteri | `dia_raw_data->>'turu'` alanı |

## Sonuç
- Yeni senkronizasyonlarda ACBO/ACAL kasa fişleri listelenmeyecek
- Mevcut ACBO/ACAL kayıtları veritabanından silinecek
- Diğer kasa işlemleri (TAH, ODM, CEK, YAT, vb.) etkilenmeyecek
