import { useState, useRef } from 'react';
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

export function MobileTransactionCard({ transaction, onApprove, onReject }: MobileTransactionCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const isProcessing = transaction._processing;
  const config = TRANSACTION_TYPE_CONFIG[transaction.type];
  const TypeIcon = config?.icon || Receipt;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isProcessing || transaction.status !== 'pending') return;
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || isProcessing) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    setOffsetX(diff);
  };

  const handleTouchEnd = () => {
    if (!isDragging || isProcessing) return;
    setIsDragging(false);

    const ids = transaction.sourceTransactionIds || [transaction.id];

    if (offsetX > SWIPE_THRESHOLD) {
      // Swiped right - Approve
      onApprove(ids);
    } else if (offsetX < -SWIPE_THRESHOLD) {
      // Swiped left - Reject
      onReject(ids);
    }

    setOffsetX(0);
  };

  const getStatusBadge = (status: Transaction['status']) => {
    const variants: Record<Transaction['status'], string> = {
      pending: 'bg-warning/10 text-warning border-warning/20',
      approved: 'bg-success/10 text-success border-success/20',
      rejected: 'bg-destructive/10 text-destructive border-destructive/20',
      analyzing: 'bg-primary/10 text-primary border-primary/20',
    };
    return (
      <Badge variant="outline" className={cn("text-xs", variants[status])}>
        {TRANSACTION_STATUS_LABELS[status]}
      </Badge>
    );
  };

  const swipeProgress = Math.min(Math.abs(offsetX) / SWIPE_THRESHOLD, 1);
  const isApproveSwipe = offsetX > 0;
  const isRejectSwipe = offsetX < 0;

  return (
    <div className="relative overflow-hidden rounded-xl mb-3">
      {/* Background indicators */}
      <div className="absolute inset-0 flex">
        {/* Approve background (right swipe) */}
        <div 
          className={cn(
            "absolute inset-y-0 left-0 bg-success flex items-center justify-start pl-6 transition-opacity",
            isApproveSwipe && swipeProgress > 0.3 ? "opacity-100" : "opacity-0"
          )}
          style={{ width: Math.abs(offsetX) }}
        >
          <Check className="w-8 h-8 text-white" />
        </div>
        
        {/* Reject background (left swipe) */}
        <div 
          className={cn(
            "absolute inset-y-0 right-0 bg-destructive flex items-center justify-end pr-6 transition-opacity",
            isRejectSwipe && swipeProgress > 0.3 ? "opacity-100" : "opacity-0"
          )}
          style={{ width: Math.abs(offsetX) }}
        >
          <X className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Card content */}
      <div
        ref={cardRef}
        className={cn(
          "relative bg-card border rounded-xl p-4 shadow-sm transition-transform",
          isProcessing && "opacity-50",
          transaction.status === 'analyzing' && "bg-primary/5 border-primary/20",
          isDragging ? "transition-none" : "transition-transform duration-200"
        )}
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Belge No</span>
            <span className="font-mono text-sm font-medium">{transaction.documentNo}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cari/Açıklama</span>
            <span className="text-sm font-medium truncate max-w-[180px]">{transaction.counterparty}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tarih</span>
            <span className="text-sm">{formatDate(transaction.date)}</span>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Tutar</span>
            <span className={cn(
              "font-semibold text-base",
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
          <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <X className="w-3 h-3 text-destructive" />
              ← Reddet
            </span>
            <span className="flex items-center gap-1">
              Onayla →
              <Check className="w-3 h-3 text-success" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
