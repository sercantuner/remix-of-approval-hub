

# Optimistik UI ve İstek Kuyruğu Sistemi Planı

## Problem Analizi

Mevcut durumda:
1. Kullanıcı bir işlem yaparken (onay/red/analiz) DIA API yanıtı bekleniyor
2. Bu süre zarfında UI donuk kalıyor
3. Birden fazla hızlı işlem yapıldığında çakışma olabiliyor
4. DIA başarısız olsa bile lokal durum değişiyor, sonra senkronizasyonda geri dönüyor

## Çözüm: Optimistik UI + Background Job Queue

### 1. Yeni Hook: useApprovalQueue

Tüm onay/red/analiz işlemlerini yönetecek bir custom hook oluşturulacak:

```typescript
interface QueuedAction {
  id: string;
  transactionId: string;
  action: "approve" | "reject" | "analyze";
  reason?: string;
  status: "pending" | "processing" | "success" | "failed";
}

function useApprovalQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // İşlemi kuyruğa ekle, hemen optimistik güncelleme yap
  const enqueue = (transactionId: string, action: string, reason?: string) => {
    // 1. Optimistik olarak UI'da durumu hemen değiştir
    // 2. Kuyruğa ekle
    // 3. Kuyruk işleme başlat (yoksa)
  };
  
  // Kuyruğu arka planda işle
  const processQueue = async () => {
    // Sırayla her işlemi DIA'ya gönder
    // Başarısız olursa rollback yap
  };
}
```

### 2. Optimistik UI Güncellemesi

İşlem yapıldığında:
1. UI hemen güncellenir (örn: satır yeşile/kırmızıya döner)
2. İşlem arka planda kuyruğa eklenir
3. Kuyruk sırayla işlenir
4. Başarısız olursa UI geri alınır ve toast gösterilir

### 3. İşlem Durumu Göstergesi

Her satırda işlem durumunu gösteren küçük bir indicator:
- Spinner: İşlem kuyrukta veya işleniyor
- Checkmark: Başarılı
- Warning: DIA'da başarısız, yerel kaydedildi

### 4. Dashboard.tsx Değişiklikleri

```typescript
// Mevcut
const handleApprove = async (ids: string[]) => {
  const result = await diaApprove(ids, "approve"); // Bekle
  await loadTransactions(); // Bekle
  // Toast göster
};

// Yeni
const handleApprove = (ids: string[]) => {
  ids.forEach(id => {
    // 1. Optimistik güncelleme
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, status: "approved", _processing: true } : t
    ));
    
    // 2. Kuyruğa ekle
    approvalQueue.enqueue(id, "approve");
  });
  setSelectedIds([]);
};
```

### 5. Queue İşleme Mantığı

```typescript
useEffect(() => {
  if (queue.length > 0 && !isProcessing) {
    processNextInQueue();
  }
}, [queue, isProcessing]);

const processNextInQueue = async () => {
  const next = queue.find(q => q.status === "pending");
  if (!next) return;
  
  setIsProcessing(true);
  
  try {
    const result = await diaApprove([next.transactionId], next.action, next.reason);
    
    if (result.results[0]?.diaUpdated) {
      // Başarılı - processing flag'i kaldır
      markSuccess(next.id);
    } else {
      // DIA güncellenmedi ama lokal kaydedildi
      markPartialSuccess(next.id);
    }
  } catch (error) {
    // Tamamen başarısız - rollback
    rollback(next.transactionId);
  }
  
  setIsProcessing(false);
};
```

### 6. Görsel Feedback

TransactionTable'da her satır için:

| Durum | Görsel |
|-------|--------|
| İşlem kuyrukta | Spinner + sarı arka plan |
| DIA'ya gönderiliyor | Spinner + mavi arka plan |
| Başarılı | Yeşil/Kırmızı arka plan |
| DIA başarısız | Uyarı ikonu + tooltip |

---

## Değiştirilecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `src/hooks/useApprovalQueue.ts` | Yeni hook oluştur |
| `src/pages/Dashboard.tsx` | Optimistik UI mantığı, queue hook kullanımı |
| `src/components/dashboard/TransactionTable.tsx` | İşlem durumu göstergesi |
| `src/types/transaction.ts` | `_processing`, `_queueStatus` alanları ekle |

---

## Akış Diyagramı

```
Kullanıcı "Onayla"ya tıklar
        ↓
UI anında yeşile döner (optimistik)
        ↓
İşlem kuyruğa eklenir
        ↓
    ┌───────────────────────┐
    │ Kuyruk işleyici       │
    │ (arka planda çalışır) │
    └───────────┬───────────┘
                ↓
    DIA API'ye istek gönder
                ↓
    ┌───────────┴───────────┐
    ↓                       ↓
Başarılı               Başarısız
    ↓                       ↓
Spinner kaldır         UI'ı geri al
                       Toast göster
```

---

## Avantajlar

1. **Anlık yanıt**: Kullanıcı işlem yaptığında hemen görsel feedback alır
2. **Sıralı işleme**: İstekler kuyrukta sırayla işlenir, çakışma olmaz
3. **Güvenilir rollback**: DIA başarısız olursa UI geri alınır
4. **İşlem görünürlüğü**: Hangi işlemlerin kuyrukta olduğu görülebilir

