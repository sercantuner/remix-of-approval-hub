import { useState, useCallback, useRef, useEffect } from 'react';
import { diaApprove } from '@/lib/diaApi';
import { useToast } from '@/hooks/use-toast';
import type { TransactionStatus, QueueStatus } from '@/types/transaction';

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

// Get target status for action
const getTargetStatus = (action: ActionType): TransactionStatus => {
  switch (action) {
    case 'approve': return 'approved';
    case 'reject': return 'rejected';
    case 'analyze': return 'pending';
    default: return 'pending';
  }
};

export function useApprovalQueue(options: UseApprovalQueueOptions) {
  const { toast } = useToast();
  
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<QueuedAction[]>([]);
  const optionsRef = useRef(options);
  
  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Process a single item
  const processItem = useCallback(async (item: QueuedAction) => {
    try {
      const result = await diaApprove(
        [item.transactionId], 
        item.action, 
        item.reason
      );

      const results = result?.results || [];
      const firstResult = results[0];

      if (firstResult?.success) {
        // Success - mark as success
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, status: 'success' as const } : q
        ));
        
        // Check if DIA was updated or not
        if (firstResult.diaUpdated) {
          optionsRef.current.onSuccess(item.transactionId);
        } else if (firstResult.diaError) {
          // Only show partial success if there was an actual error
          optionsRef.current.onPartialSuccess(item.transactionId);
          toast({
            title: '⚠ Yerel Olarak Kaydedildi',
            description: `İşlem kaydedildi ancak DIA güncellenemedi: ${firstResult.diaError}`,
          });
        } else {
          // No error, just not a DIA-updateable type - treat as success
          optionsRef.current.onSuccess(item.transactionId);
        }
        return true;
      } else {
        throw new Error(firstResult?.error || 'İşlem başarısız');
      }
    } catch (error) {
      // Failed - rollback
      setQueue(prev => prev.map(q => 
        q.id === item.id ? { 
          ...q, 
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        } : q
      ));
      optionsRef.current.onRollback(item.transactionId);
      
      toast({
        title: 'İşlem Başarısız',
        description: error instanceof Error ? error.message : 'Bir hata oluştu',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Process queue
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    
    const currentQueue = queueRef.current;
    const nextPending = currentQueue.find(q => q.status === 'pending');
    
    if (!nextPending) {
      setIsProcessing(false);
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    // Mark item as processing
    setQueue(prev => prev.map(q => 
      q.id === nextPending.id ? { ...q, status: 'processing' as const } : q
    ));
    
    // Optimistic update for processing state
    optionsRef.current.onOptimisticUpdate(
      nextPending.transactionId, 
      getTargetStatus(nextPending.action), 
      'processing'
    );

    // Process the item
    await processItem(nextPending);
    
    processingRef.current = false;
    
    // Check for more items
    setTimeout(() => {
      processQueue();
    }, 100);
  }, [processItem]);

  // Auto-process queue when items are added
  useEffect(() => {
    const hasPending = queue.some(q => q.status === 'pending');
    if (hasPending && !processingRef.current) {
      // Small delay to batch multiple enqueues
      const timer = setTimeout(() => {
        processQueue();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [queue, processQueue]);

  // Enqueue action with optimistic update
  const enqueue = useCallback((
    transactionId: string,
    action: ActionType,
    reason?: string
  ) => {
    const queueId = `${transactionId}-${Date.now()}`;
    
    // Optimistic update
    const targetStatus = getTargetStatus(action);
    optionsRef.current.onOptimisticUpdate(transactionId, targetStatus, 'queued');
    
    // Add to queue
    setQueue(prev => [...prev, {
      id: queueId,
      transactionId,
      action,
      reason,
      status: 'pending',
    }]);
  }, []);

  // Batch enqueue for multiple transactions
  const enqueueBatch = useCallback((
    transactionIds: string[],
    action: ActionType,
    reason?: string
  ) => {
    transactionIds.forEach(id => enqueue(id, action, reason));
  }, [enqueue]);

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
