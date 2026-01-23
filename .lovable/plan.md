

# Banka Fişleri için _owner Bilgisini Kaydetme Planı

## Problem Özeti
`ownerUserId` değeri parent fişten doğru şekilde alınıyor ve log'a yazılıyor, ancak `dia_raw_data`'ya eklenmeden veritabanına gönderiliyor. Bu yüzden UI'da "Kaydeden" alanı boş görünüyor.

## Mevcut Kod (Satır 621-636)
```typescript
// ownerUserId hesaplanıyor ama kullanılmıyor
const ownerUserId = getOwnerFromParent(record, parentReceiptMap);

transactionsToUpsert.push({
  // ...
  dia_raw_data: record,  // <-- _owner eklenmemiş!
});
```

## Çözüm
`dia_raw_data`'ya `_owner` alanını ekleyerek kaydetmek.

## Yapılacak Değişiklik

### 1. dia-sync/index.ts Düzenlemesi
**Dosya:** `supabase/functions/dia-sync/index.ts`  
**Satır:** 621-636

```typescript
// Get owner (_user) from parent receipt for bank transactions
const ownerUserId = getOwnerFromParent(record, parentReceiptMap);

console.log(`[dia-sync] Record ${diaKey} (parent: ${parentKey}) - üst işlem: ${record._key_sis_ust_islem_turu} -> status: ${status}, _owner: ${ownerUserId}`);

// Merge owner into dia_raw_data so UI can read it
const diaRawData = ownerUserId 
  ? { ...record, _owner: ownerUserId } 
  : record;

transactionsToUpsert.push({
  user_id: userId,
  dia_record_id: `${mapping.method}-${diaKey}`,
  transaction_type: txType,
  document_no: record[mapping.docField] || diaKey,
  description: record.aciklama || record.not || docType || `${txType} işlemi`,
  counterparty,
  amount,
  currency,
  transaction_date: record[mapping.dateField] || new Date().toISOString().split("T")[0],
  status,
  attachment_url: attachmentUrl,
  dia_raw_data: diaRawData,  // <-- _owner artık dahil
  dia_firma_kodu: profile.dia_firma_kodu,
});
```

## Sonuç
Bu değişiklikle:
- Banka ve cari hesap fişlerinin parent'ından alınan `_user` bilgisi
- `dia_raw_data._owner` olarak veritabanına yazılacak
- UI (`TransactionTable.tsx`) bu değeri okuyarak "Kaydeden" sütununda kullanıcı adını gösterecek

