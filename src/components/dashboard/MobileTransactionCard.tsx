import { useState, useRef, useCallback } from 'react';
import { Check, X, Loader2, Link as LinkIcon } from 'lucide-react';
import { Transaction, TRANSACTION_STATUS_LABELS, TransactionType } from '@/types/transaction';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Receipt, Users, Building, Wallet } from 'lucide-react';

const TRANSACTION_TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  invoice: { label: "Fatura", icon: Receipt, color: "bg-blue-100 text-blue-700 border-blue-200" },
  order: { label: "Sipariş", icon: Receipt, color: "bg-purple-100 text-purple-700 border-purple-200" },
  current_account: { label: "Cari", icon: Users, color: "bg-orange-100 text-orange-700 border-orange-200" },
  bank: { label: "Banka", icon: Building, color: "bg-green-100 text-green-700 border-green-200" },
  cash: { label: "Kasa", icon: Wallet, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  check_note: { label: "Çek/Senet", icon: Receipt, color: "bg-pink-100 text-pink-700 border-pink-200" },
};

interface MobileTransactionCardProps {
  transaction: Transaction;
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
}

const SWIPE_THRESHOLD = 100;
const HAPTIC_THRESHOLD = 50;

// Haptic feedback helper
const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'medium') => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: 10,
      medium: 25,
      heavy: 50,
    };
    navigator.vibrate(patterns[style]);
  }
};

export function MobileTransactionCard({ transaction, onApprove, onReject }: MobileTransactionCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hasPassedThreshold, setHasPassedThreshold] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const hapticTriggered = useRef(false);
  const thresholdHapticTriggered = useRef(false);

  const isProcessing = transaction._processing;
  const config = TRANSACTION_TYPE_CONFIG[transaction.type];
  const TypeIcon = config?.icon || Receipt;

  // Pointer Events - works for both touch and mouse
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isProcessing || transaction.status !== 'pending') return;
    
    // Capture pointer for consistent tracking
    e.currentTarget.setPointerCapture(e.pointerId);
    
    startX.current = e.clientX;
    setIsDragging(true);
    hapticTriggered.current = false;
    thresholdHapticTriggered.current = false;
    setHasPassedThreshold(false);
    setSwipeDirection(null);
  }, [isProcessing, transaction.status]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || isProcessing) return;
    
    const diff = e.clientX - startX.current;
    setOffsetX(diff);

    // Determine swipe direction
    if (diff > 10) {
      setSwipeDirection('right');
    } else if (diff < -10) {
      setSwipeDirection('left');
    }

    // Initial haptic when starting to swipe
    if (Math.abs(diff) > HAPTIC_THRESHOLD && !hapticTriggered.current) {
      triggerHaptic('light');
      hapticTriggered.current = true;
    }

    // Threshold haptic - stronger feedback when passing action threshold
    if (Math.abs(diff) > SWIPE_THRESHOLD && !thresholdHapticTriggered.current) {
      triggerHaptic('heavy');
      thresholdHapticTriggered.current = true;
      setHasPassedThreshold(true);
    } else if (Math.abs(diff) <= SWIPE_THRESHOLD && thresholdHapticTriggered.current) {
      // Reset if user pulls back
      thresholdHapticTriggered.current = false;
      setHasPassedThreshold(false);
      triggerHaptic('light');
    }
  }, [isDragging, isProcessing]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging || isProcessing) return;
    
    // Release pointer capture
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);

    const ids = transaction.sourceTransactionIds || [transaction.id];

    if (offsetX > SWIPE_THRESHOLD) {
      // Swiped right - Approve
      triggerHaptic('heavy');
      onApprove(ids);
    } else if (offsetX < -SWIPE_THRESHOLD) {
      // Swiped left - Reject
      triggerHaptic('heavy');
      onReject(ids);
    }

    setOffsetX(0);
    setHasPassedThreshold(false);
    setSwipeDirection(null);
  }, [isDragging, isProcessing, offsetX, transaction.sourceTransactionIds, transaction.id, onApprove, onReject]);

  const handlePointerCancel = useCallback(() => {
    setIsDragging(false);
    setOffsetX(0);
    setHasPassedThreshold(false);
    setSwipeDirection(null);
  }, []);

  const getStatusBadge = (status: Transaction['status']) => {
    const variants: Record<Transaction['status'], string> = {
      pending: 'bg-warning/10 text-warning border-warning/20',
      approved: 'bg-success/10 text-success border-success/20',
      rejected: 'bg-destructive/10 text-destructive border-destructive/20',
      analyzing: 'bg-primary/10 text-primary border-primary/20',
    };
    return (
      <Badge variant="outline" className={cn("text-xs transition-all duration-200", variants[status])}>
        {TRANSACTION_STATUS_LABELS[status]}
      </Badge>
    );
  };

  const swipeProgress = Math.min(Math.abs(offsetX) / SWIPE_THRESHOLD, 1);
  const isApproveSwipe = offsetX > 0;
  const isRejectSwipe = offsetX < 0;

  // Calculate dynamic styles based on swipe progress
  const backgroundOpacity = Math.min(swipeProgress * 1.5, 1);
  const iconScale = 0.5 + swipeProgress * 0.5;
  const cardRotation = (offsetX / 1000) * 5; // Subtle rotation effect

  return (
    <div className="relative overflow-hidden rounded-xl mb-3 animate-fade-in">
      {/* Background indicators */}
      <div className="absolute inset-0 flex">
        {/* Approve background (right swipe) */}
        <div 
          className={cn(
            "absolute inset-y-0 left-0 bg-success flex items-center justify-start pl-6",
            "transition-all duration-150"
          )}
          style={{ 
            width: Math.max(Math.abs(offsetX), 0),
            opacity: isApproveSwipe ? backgroundOpacity : 0,
          }}
        >
          <div 
            className={cn(
              "transition-all duration-150",
              hasPassedThreshold && isApproveSwipe && "animate-pulse"
            )}
            style={{ transform: `scale(${isApproveSwipe ? iconScale : 0.5})` }}
          >
            <Check className="w-8 h-8 text-white" />
          </div>
          {hasPassedThreshold && isApproveSwipe && (
            <span className="ml-2 text-white font-medium text-sm animate-fade-in">
              Bırak → Onayla
            </span>
          )}
        </div>
        
        {/* Reject background (left swipe) */}
        <div 
          className={cn(
            "absolute inset-y-0 right-0 bg-destructive flex items-center justify-end pr-6",
            "transition-all duration-150"
          )}
          style={{ 
            width: Math.max(Math.abs(offsetX), 0),
            opacity: isRejectSwipe ? backgroundOpacity : 0,
          }}
        >
          {hasPassedThreshold && isRejectSwipe && (
            <span className="mr-2 text-white font-medium text-sm animate-fade-in">
              Reddet ← Bırak
            </span>
          )}
          <div 
            className={cn(
              "transition-all duration-150",
              hasPassedThreshold && isRejectSwipe && "animate-pulse"
            )}
            style={{ transform: `scale(${isRejectSwipe ? iconScale : 0.5})` }}
          >
            <X className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Card content */}
      <div
        ref={cardRef}
        className={cn(
          "relative bg-card border rounded-xl p-4 shadow-sm",
          "transition-all duration-200 ease-out",
          isProcessing && "opacity-50",
          transaction.status === 'analyzing' && "bg-primary/5 border-primary/20",
          isDragging && "shadow-lg",
          hasPassedThreshold && isApproveSwipe && "border-success/50",
          hasPassedThreshold && isRejectSwipe && "border-destructive/50"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ 
          transform: `translateX(${offsetX}px) rotate(${cardRotation}deg)`,
          transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          touchAction: 'pan-y',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", config?.color)}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {config?.label}
            </Badge>
            {transaction.movementCount && transaction.movementCount > 1 && (
              <Badge variant="secondary" className="text-xs">
                <LinkIcon className="w-3 h-3 mr-1" />
                {transaction.linkedIndex}/{transaction.movementCount}
              </Badge>
            )}
          </div>
          {getStatusBadge(transaction.status)}
        </div>

        {/* Document info */}
        <div className="space-y-3">
          <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
            <span className="text-xs text-muted-foreground">Belge No</span>
            <span className="font-mono text-sm font-medium text-right">{transaction.documentNo}</span>
          </div>
          
          <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
            <span className="text-xs text-muted-foreground">Cari/Açıklama</span>
            <span className="text-sm font-medium text-right break-words">{transaction.counterparty || '-'}</span>
          </div>
          
          <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
            <span className="text-xs text-muted-foreground">Tarih</span>
            <span className="text-sm text-right">{formatDate(transaction.date)}</span>
          </div>
          
          <div className="grid grid-cols-[100px_1fr] gap-2 items-center pt-3 border-t">
            <span className="text-xs text-muted-foreground">Tutar</span>
            <span className={cn(
              "font-semibold text-base text-right",
              transaction.amount >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(transaction.amount, transaction.currency)}
            </span>
          </div>
        </div>

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* Swipe hint for pending items */}
        {transaction.status === 'pending' && !isProcessing && (
          <div className={cn(
            "mt-3 pt-3 border-t border-dashed flex items-center justify-center gap-6 text-xs",
            "transition-opacity duration-200",
            isDragging ? "opacity-30" : "opacity-100"
          )}>
            <span className={cn(
              "flex items-center gap-1.5 transition-all duration-200",
              swipeDirection === 'left' && "text-destructive scale-105 font-medium"
            )}>
              <X className="w-4 h-4 text-destructive" />
              ← Reddet
            </span>
            <div className="w-px h-4 bg-border" />
            <span className={cn(
              "flex items-center gap-1.5 transition-all duration-200",
              swipeDirection === 'right' && "text-success scale-105 font-medium"
            )}>
              Onayla →
              <Check className="w-4 h-4 text-success" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
