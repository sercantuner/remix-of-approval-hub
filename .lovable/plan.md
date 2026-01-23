

# Masaüstü Mobil Preview'da Swipe Desteği

## Problem
Mobil kart bileşeninde sadece dokunmatik ekran event'leri (`touchstart`, `touchmove`, `touchend`) kullanılıyor. Masaüstü tarayıcıda mobil görünümü test ederken bu event'ler tetiklenmiyor çünkü fare kullanılıyor.

## Çözüm
Hem touch hem de mouse event'lerini destekleyen unified bir gesture sistemi eklenecek.

---

## Teknik Değişiklikler

### `src/components/dashboard/MobileTransactionCard.tsx`

1. **Mouse Event Handler'ları Ekle**
   - `onMouseDown` → `handleMouseDown` (swipe başlangıcı)
   - `onMouseMove` → `handleMouseMove` (swipe hareketi)
   - `onMouseUp` → `handleMouseUp` (swipe sonu)
   - `onMouseLeave` → `handleMouseLeave` (kart dışına çıkıldığında sıfırla)

2. **Ortak Gesture Logic**
   - Touch ve mouse event'leri için ortak `startSwipe`, `updateSwipe`, `endSwipe` fonksiyonları
   - Kod tekrarını önlemek için shared logic

3. **Pointer Events Alternatifi**
   - Modern `onPointerDown`, `onPointerMove`, `onPointerUp` API'leri kullanılarak hem touch hem mouse tek event ile desteklenebilir (daha temiz çözüm)

---

## Uygulama Detayları

```typescript
// Pointer events ile unified çözüm
const handlePointerDown = useCallback((e: React.PointerEvent) => {
  if (isProcessing || transaction.status !== 'pending') return;
  e.currentTarget.setPointerCapture(e.pointerId);
  startX.current = e.clientX;
  setIsDragging(true);
  // ... reset states
}, [isProcessing, transaction.status]);

const handlePointerMove = useCallback((e: React.PointerEvent) => {
  if (!isDragging || isProcessing) return;
  const diff = e.clientX - startX.current;
  setOffsetX(diff);
  // ... haptic ve threshold logic
}, [isDragging, isProcessing]);

const handlePointerUp = useCallback((e: React.PointerEvent) => {
  e.currentTarget.releasePointerCapture(e.pointerId);
  // ... approve/reject logic
}, [/* dependencies */]);
```

4. **Card Element Güncelleme**
   ```tsx
   <div
     onPointerDown={handlePointerDown}
     onPointerMove={handlePointerMove}
     onPointerUp={handlePointerUp}
     onPointerCancel={handlePointerCancel}
     style={{ touchAction: 'pan-y' }} // Dikey scroll'a izin ver
   >
   ```

---

## Avantajlar

| Özellik | Mevcut Durum | Sonrası |
|---------|--------------|---------|
| Mobil Cihaz | ✅ Çalışıyor | ✅ Çalışıyor |
| Masaüstü Preview | ❌ Çalışmıyor | ✅ Çalışacak |
| Kod Karmaşıklığı | Touch only | Pointer Events (daha temiz) |

---

## Dosya Değişiklikleri

| Dosya | İşlem |
|-------|-------|
| `src/components/dashboard/MobileTransactionCard.tsx` | Touch event'leri Pointer event'lere dönüştür |

