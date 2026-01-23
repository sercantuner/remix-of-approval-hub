import { useState, useCallback, useRef, useEffect } from 'react';
import { diaApprove } from '@/lib/diaApi';
import { useToast } from '@/hooks/use-toast';
import type { Transaction, TransactionStatus, QueueStatus } from '@/types/transaction';

export type ActionType = 'approve' | 'reject' | 'analyze';

export interface QueuedAction {
  id: string;
  transactionId: string;
  action: ActionType;
  reason?: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  error?: string;
}

interface UseApprovalQueueOptions {
  onOptimisticUpdate: (transactionId: string, newStatus: TransactionStatus, queueStatus: QueueStatus) => void;
  onRollback: (transactionId: string) => void;
  onSuccess: (transactionId: string) => void;
  onPartialSuccess: (transactionId: string) => void;
}

export function useApprovalQueue(options: UseApprovalQueueOptions) {
  const { onOptimisticUpdate, onRollback, onSuccess, onPartialSuccess } = options;
  const { toast } = useToast();
  
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  // Get target status for action
  const getTargetStatus = (action: ActionType): TransactionStatus => {
    switch (action) {
      case 'approve': return 'approved';
      case 'reject': return 'rejected';
      case 'analyze': return 'pending';
      default: return 'pending';
    }
  };

  // Enqueue action with optimistic update
  const enqueue = useCallback((
    transactionId: string,
    action: ActionType,
    reason?: string
  ) => {
    const queueId = `${transactionId}-${Date.now()}`;
    
    // Optimistic update
    const targetStatus = getTargetStatus(action);
    onOptimisticUpdate(transactionId, targetStatus, 'queued');
    
    // Add to queue
    setQueue(prev => [...prev, {
      id: queueId,
      transactionId,
      action,
      reason,
      status: 'pending',
    }]);
  }, [onOptimisticUpdate]);

  // Batch enqueue for multiple transactions
  const enqueueBatch = useCallback((
    transactionIds: string[],
    action: ActionType,
    reason?: string
  ) => {
    transactionIds.forEach(id => enqueue(id, action, reason));
  }, [enqueue]);

  // Process next item in queue
  const processNext = useCallback(async () => {
    if (processingRef.current) return;
    
    const nextPending = queue.find(q => q.status === 'pending');
    if (!nextPending) {
      setIsProcessing(false);
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    // Mark as processing
    setQueue(prev => prev.map(q => 
      q.id === nextPending.id ? { ...q, status: 'processing' as const } : q
    ));
    onOptimisticUpdate(nextPending.transactionId, getTargetStatus(nextPending.action), 'processing');

    try {
      const result = await diaApprove(
        [nextPending.transactionId], 
        nextPending.action, 
        nextPending.reason
      );

      const diaUpdated = result?.diaUpdated || 0;
      const results = result?.results || [];
      const firstResult = results[0];

      if (firstResult?.diaUpdated) {
        // Full success - DIA updated
        setQueue(prev => prev.map(q => 
          q.id === nextPending.id ? { ...q, status: 'success' as const } : q
        ));
        onSuccess(nextPending.transactionId);
      } else if (firstResult?.success) {
        // Partial success - local only
        setQueue(prev => prev.map(q => 
          q.id === nextPending.id ? { ...q, status: 'success' as const } : q
        ));
        onPartialSuccess(nextPending.transactionId);
        
        // Show warning toast
        const errorMsg = firstResult.diaError || 'DIA güncellenemedi';
        toast({
          title: '⚠ Yerel Olarak Kaydedildi',
          description: `İşlem kaydedildi ancak DIA güncellenemedi: ${errorMsg}`,
        });
      } else {
        throw new Error(firstResult?.error || 'İşlem başarısız');
      }
    } catch (error) {
      // Failed - rollback
      setQueue(prev => prev.map(q => 
        q.id === nextPending.id ? { 
          ...q, 
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        } : q
      ));
      onRollback(nextPending.transactionId);
      
      toast({
        title: 'İşlem Başarısız',
        description: error instanceof Error ? error.message : 'Bir hata oluştu',
        variant: 'destructive',
      });
    } finally {
      processingRef.current = false;
      
      // Process next after a small delay
      setTimeout(() => {
        processNext();
      }, 100);
    }
  }, [queue, onOptimisticUpdate, onSuccess, onPartialSuccess, onRollback, toast]);

  // Auto-process queue when items are added
  useEffect(() => {
    const hasPending = queue.some(q => q.status === 'pending');
    if (hasPending && !processingRef.current) {
      processNext();
    }
  }, [queue, processNext]);

  // Get queue status for a transaction
  const getQueueStatus = useCallback((transactionId: string): QueueStatus | null => {
    const item = queue.find(q => q.transactionId === transactionId);
    if (!item) return null;
    
    switch (item.status) {
      case 'pending': return 'queued';
      case 'processing': return 'processing';
      case 'success': return 'success';
      case 'failed': return 'failed';
      default: return null;
    }
  }, [queue]);

  // Check if transaction is in queue
  const isInQueue = useCallback((transactionId: string): boolean => {
    return queue.some(q => 
      q.transactionId === transactionId && 
      (q.status === 'pending' || q.status === 'processing')
    );
  }, [queue]);

  // Clear completed items from queue (cleanup)
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(q => q.status === 'pending' || q.status === 'processing'));
  }, []);

  return {
    queue,
    isProcessing,
    enqueue,
    enqueueBatch,
    getQueueStatus,
    isInQueue,
    clearCompleted,
    pendingCount: queue.filter(q => q.status === 'pending').length,
    processingCount: queue.filter(q => q.status === 'processing').length,
  };
}
