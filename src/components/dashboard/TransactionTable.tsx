import { useState, useEffect, Fragment } from 'react';
import { 
  Check, 
  X, 
  FileText,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  Receipt,
  ShoppingCart,
  Users,
  Building,
  Wallet,
  CreditCard,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { Transaction, TRANSACTION_STATUS_LABELS, TransactionType, QueueStatus } from '@/types/transaction';
import { cn, formatCurrency, formatDate, formatExchangeRate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ApprovalSlider } from '@/components/ui/ApprovalSlider';
import { TransactionDetailRow } from './TransactionDetailRow';
import { diaFetchUserList, getCachedUserName } from '@/lib/diaApi';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Transaction type labels and icons
const TRANSACTION_TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  invoice: { label: "Fatura", icon: Receipt, color: "bg-blue-100 text-blue-700 border-blue-200" },
  order: { label: "Sipariş", icon: ShoppingCart, color: "bg-purple-100 text-purple-700 border-purple-200" },
  current_account: { label: "Cari", icon: Users, color: "bg-orange-100 text-orange-700 border-orange-200" },
  bank: { label: "Banka", icon: Building, color: "bg-green-100 text-green-700 border-green-200" },
  cash: { label: "Kasa", icon: Wallet, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  check_note: { label: "Çek/Senet", icon: CreditCard, color: "bg-pink-100 text-pink-700 border-pink-200" },
};

interface TransactionTableProps {
  transactions: Transaction[];
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
  onAnalyze: (ids: string[]) => void;
  onViewDetails: (transaction: Transaction) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TransactionTable({
  transactions,
  onApprove,
  onReject,
  onAnalyze,
  onViewDetails,
  selectedIds,
  onSelectionChange,
}: TransactionTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  
  // Fetch user list on mount
  useEffect(() => {
    diaFetchUserList()
      .then(users => setUserNames(users))
      .catch(err => console.warn('[TransactionTable] Failed to fetch user list:', err));
  }, []);
  
  const allSelected = transactions.length > 0 && selectedIds.length === transactions.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < transactions.length;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(transactions.map(t => t.id));
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusBadge = (status: Transaction['status']) => {
    const variants: Record<Transaction['status'], string> = {
      pending: 'bg-warning/10 text-warning border-warning/20',
      approved: 'bg-success/10 text-success border-success/20',
      rejected: 'bg-destructive/10 text-destructive border-destructive/20',
      analyzing: 'bg-primary/10 text-primary border-primary/20',
    };

    return (
      <Badge variant="outline" className={cn('text-xs', variants[status])}>
        {TRANSACTION_STATUS_LABELS[status]}
      </Badge>
    );
  };

  // Queue status indicator
  const getQueueIndicator = (transaction: Transaction) => {
    if (!transaction._processing && !transaction._queueStatus) return null;

    const status = transaction._queueStatus;

    if (status === 'queued' || status === 'processing') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{status === 'queued' ? 'Kuyrukta bekliyor' : 'DIA\'ya gönderiliyor...'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (status === 'success') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>DIA\'da güncellendi</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (status === 'partial') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <AlertTriangle className="w-4 h-4 text-warning" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Yerel kaydedildi, DIA güncellenemedi</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (status === 'failed') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <X className="w-4 h-4 text-destructive" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>İşlem başarısız, geri alındı</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return null;
  };

  // Get row background based on queue status
  const getRowBackground = (transaction: Transaction, isSelected: boolean, isExpanded: boolean) => {
    const base = 'hover:bg-muted/30 transition-colors cursor-pointer';
    
    if (transaction._processing) {
      if (transaction._queueStatus === 'processing') {
        return cn(base, 'bg-primary/10 animate-pulse');
      }
      if (transaction._queueStatus === 'queued') {
        return cn(base, 'bg-warning/5');
      }
    }
    
    if (transaction._queueStatus === 'success') {
      if (transaction.status === 'approved') {
        return cn(base, 'bg-success/10');
      }
      if (transaction.status === 'rejected') {
        return cn(base, 'bg-destructive/10');
      }
      if (transaction.status === 'analyzing') {
        return cn(base, 'bg-primary/10');
      }
    }
    
    // Analyzing status background (even without queue status)
    if (transaction.status === 'analyzing' && !transaction._processing) {
      return cn(base, 'bg-primary/5 border-l-2 border-l-primary');
    }
    
    if (isSelected) return cn(base, 'bg-primary/10');
    if (isExpanded) return cn(base, 'bg-primary/20 border-l-4 border-l-primary');
    
    return base;
  };

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden animate-slide-up">
      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-primary/5 border-b flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedIds.length} işlem seçildi
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => onApprove(selectedIds)}
              className="bg-success hover:bg-success/90"
            >
              <Check className="w-4 h-4 mr-1" />
              Toplu Onayla
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(selectedIds)}
            >
              <X className="w-4 h-4 mr-1" />
              Toplu Reddet
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-4 text-left w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className={someSelected ? 'data-[state=checked]:bg-primary' : ''}
                />
              </th>
              <th className="p-4 text-left w-10"></th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Kategori
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Belge No
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Belge Türü
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cari
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tarih
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Kaydeden
              </th>
              <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tutar
              </th>
              <th className="p-4 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Durum
              </th>
              <th className="p-4 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                İşlem
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map((transaction) => {
              const isExpanded = expandedId === transaction.id;
              const rawData = transaction.details as Record<string, unknown> | undefined;
              const efaturaLink = rawData?.efaturalinki as string | undefined;
              const earsivLink = rawData?.earsivlinki as string | undefined;
              const hasLink = efaturaLink || earsivLink;


              return (
                <Fragment key={transaction.id}>
                    <tr
                    onClick={() => toggleExpand(transaction.id)}
                    className={getRowBackground(
                      transaction, 
                      selectedIds.includes(transaction.id), 
                      isExpanded
                    )}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(transaction.id)}
                        onCheckedChange={() => toggleOne(transaction.id)}
                      />
                    </td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(transaction.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                    <td className="p-4">
                      {(() => {
                        const config = TRANSACTION_TYPE_CONFIG[transaction.type];
                        const Icon = config.icon;
                        return (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("gap-1 text-xs", config.color)}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </Badge>
                            {/* Show link badge for grouped current_account and bank transactions */}
                            {(transaction.type === "current_account" || transaction.type === "bank") && transaction.movementCount && transaction.movementCount > 1 && transaction.linkedIndex && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className={cn(
                                      "text-xs",
                                      transaction.type === "current_account" 
                                        ? "bg-orange-50 border-orange-300 text-orange-700"
                                        : "bg-green-50 border-green-300 text-green-700"
                                    )}>
                                      🔗 {transaction.linkedIndex}/{transaction.movementCount}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Bu fiş {transaction.movementCount} satırdan oluşuyor.</p>
                                    <p className="text-xs text-muted-foreground">Tek işlem tüm satırları etkiler.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{transaction.documentNo}</span>
                        {hasLink && (
                          <a
                            href={(efaturaLink || earsivLink) as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors"
                            title={efaturaLink ? "E-Fatura Görüntüle" : "E-Arşiv Görüntüle"}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileCheck className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {(() => {
                        const rawData = transaction.details as Record<string, unknown> | undefined;
                        const turuack = rawData?.turuack as string | undefined;
                        const turu = rawData?.turu;
                        
                        // For orders, show "Alınan Sipariş" or "Verilen Sipariş" based on turu field
                        // turu can be numeric (1, 2) or string ("A", "V")
                        if (transaction.type === "order" && turu !== undefined) {
                          // Numeric: 1 = Alınan, 2 = Verilen (based on DIA API response)
                          if (turu === 1 || turu === "1" || turu === "A") {
                            return <p className="text-sm">Alınan Sipariş</p>;
                          } else if (turu === 2 || turu === "2" || turu === "V") {
                            return <p className="text-sm">Verilen Sipariş</p>;
                          }
                        }
                        
                        return (
                          <p className="text-sm">
                            {turuack || transaction.description || '-'}
                          </p>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-muted-foreground">{transaction.counterparty}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-muted-foreground">{formatDate(transaction.date)}</p>
                    </td>
                    <td className="p-4">
                      {(() => {
                        // _owner is stored in dia_raw_data which is passed as details
                        const rawData = transaction.details as Record<string, unknown> | undefined;
                        const ownerId = rawData?._owner as number | undefined;
                        const userName = ownerId ? (userNames[ownerId] || getCachedUserName(ownerId)) : null;
                        
                        // If we have a userId but no name yet, try to show loading indicator
                        if (ownerId && !userName && Object.keys(userNames).length === 0) {
                          return <span className="text-sm text-muted-foreground">...</span>;
                        }
                        
                        return userName ? (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {userName}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        );
                      })()}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          'font-semibold tabular-nums',
                          transaction.amount >= 0 ? 'text-success' : 'text-destructive'
                        )}>
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </span>
                        {transaction.exchangeRate && transaction.exchangeRate !== 1 && (
                          <span className="text-xs text-muted-foreground">
                            Kur: {formatExchangeRate(transaction.exchangeRate)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getQueueIndicator(transaction)}
                        {getStatusBadge(transaction.status)}
                      </div>
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        {transaction._processing ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        ) : (
                          <ApprovalSlider
                            size="sm"
                            onApprove={() => {
                              const idsToProcess = transaction.sourceTransactionIds || [transaction.id];
                              onApprove(idsToProcess);
                            }}
                            onReject={() => {
                              const idsToProcess = transaction.sourceTransactionIds || [transaction.id];
                              onReject(idsToProcess);
                            }}
                            onAnalyze={() => {
                              const idsToProcess = transaction.sourceTransactionIds || [transaction.id];
                              onAnalyze(idsToProcess);
                            }}
                            disabled={!!transaction._processing}
                            currentStatus={transaction.status}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Hide accordion details for current_account and bank - only show for other types */}
                  {isExpanded && transaction.type !== "current_account" && transaction.type !== "bank" && (
                    <tr key={`${transaction.id}-detail`}>
                      <td colSpan={11} className="p-0">
                        <TransactionDetailRow 
                          transaction={transaction} 
                          onApprove={() => {
                            // For linked transactions, use sourceTransactionIds if available
                            const idsToProcess = transaction.sourceTransactionIds || [transaction.id];
                            onApprove(idsToProcess);
                          }}
                          onReject={() => {
                            const idsToProcess = transaction.sourceTransactionIds || [transaction.id];
                            onReject(idsToProcess);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {transactions.length === 0 && (
        <div className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Onay bekleyen işlem bulunmuyor</p>
        </div>
      )}
    </div>
  );
}
