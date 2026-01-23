

# DIA Güncelleme Sonuçlarını Dashboard'da Gösterme Planı

## Mevcut Durum Analizi

Son işlem incelemesi:
- **Transaction ID:** `82222355-1e1d-402b-b710-60dc0761acd6`
- **Belge No:** `000001` (Fatura)
- **DIA _key:** `2444754`
- **Durum:** Onaylandı

Log mesajında `"Would update DIA record"` yazıyor ve `dia_response` alanında `simulated: true` görülüyor. Bu, edge function'ın henüz gerçek DIA API çağrısı yapmadığını gösteriyor. Yeni kod deploy edilince gerçek DIA yanıtları gelecek.

## Yapılacak İşlemler

### 1. diaApprove Fonksiyonunun Sonuç Döndürmesi

`diaApi.ts` dosyasındaki `diaApprove` fonksiyonu zaten sonuçları döndürüyor. Dashboard'da bu sonuçları işlememiz gerekiyor.

### 2. Dashboard'da Toast Bildirimleri Güncelleme

Onay/red işlemlerinden dönen DIA sonuçlarını kullanıcıya göstereceğiz:

| Durum | Mesaj |
|-------|-------|
| DIA Başarılı | "İşlem DIA'da güncellendi ✓" |
| DIA Başarısız | "Yerel onay kaydedildi, DIA güncellenemedi: {hata}" |
| DIA Bağlantısı Yok | "Yerel onay kaydedildi" |

### 3. Detaylı Sonuç Gösterimi

Toplu işlemlerde her işlemin DIA sonucunu göstermek için:
- Toast yerine veya ek olarak bir sonuç özeti dialog'u açılacak
- Her işlem için başarı/başarısızlık durumu listelenecek

## Değiştirilecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `src/pages/Dashboard.tsx` | `handleApprove` ve `handleRejectConfirm` fonksiyonlarını DIA sonuçlarını işleyecek şekilde güncelle |
| `src/components/dashboard/DiaResultDialog.tsx` | (Yeni) DIA sonuçlarını gösteren dialog bileşeni |

## Uygulama Detayları

### Dashboard.tsx Değişiklikleri

```typescript
const handleApprove = async (ids: string[]) => {
  try {
    const result = await diaApprove(ids, "approve");
    await loadTransactions();
    setSelectedIds([]);
    setSelectedTransaction(null);
    
    // DIA sonuçlarını işle
    const diaUpdated = result.diaUpdated || 0;
    const failed = result.results?.filter(r => r.diaUpdated === false && r.success) || [];
    
    if (diaUpdated === ids.length) {
      toast({
        title: "İşlemler Onaylandı",
        description: `${ids.length} işlem DIA'da başarıyla güncellendi.`,
      });
    } else if (diaUpdated > 0) {
      toast({
        title: "Kısmi DIA Güncellemesi",
        description: `${diaUpdated}/${ids.length} işlem DIA'da güncellendi.`,
        variant: "default",
      });
    } else {
      toast({
        title: "İşlemler Onaylandı",
        description: `${ids.length} işlem yerel olarak kaydedildi.`,
      });
    }
  } catch (error) {
    // ... hata işleme
  }
};
```

### DiaResultDialog Bileşeni (Opsiyonel - Detaylı Görünüm)

Toplu işlemlerde her bir işlemin sonucunu gösteren modal:

```typescript
interface DiaResult {
  id: string;
  documentNo: string;
  success: boolean;
  diaUpdated: boolean;
  diaMessage?: string;
}

// Dialog içeriği:
// - Başarılı DIA güncellemeleri (yeşil ✓)
// - Başarısız DIA güncellemeleri (sarı ⚠)
// - Yerel onaylar (gri bilgi)
```

## İş Akışı

```text
+---------------------+
| Kullanıcı Onaylar   |
+----------+----------+
           |
           v
+----------+----------+
| diaApprove() çağrısı|
+----------+----------+
           |
           v
+----------+----------+
| Edge Function       |
| - DIA API çağrısı   |
| - Yerel DB güncelle |
| - Sonuç döndür      |
+----------+----------+
           |
           v
+----------+----------+
| Dashboard           |
| - Sonuçları işle    |
| - Toast göster      |
| - Tabloyu yenile    |
+---------------------+
```

## Önerilen Yaklaşım

İlk aşamada basit toast bildirimleri ile başlayalım:
1. DIA sonucu başarılı → Yeşil toast ile "DIA'da güncellendi"
2. DIA sonucu başarısız → Sarı toast ile "DIA güncellenemedi, yerel kaydedildi"
3. DIA olmayan işlemler → Normal toast

İlerleyen aşamada detaylı sonuç dialog'u eklenebilir.

