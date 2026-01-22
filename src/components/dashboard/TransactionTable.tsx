import { useState, useEffect } from 'react';
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
  CreditCard
} from 'lucide-react';
import { Transaction, TRANSACTION_STATUS_LABELS, TransactionType } from '@/types/transaction';
import { cn, formatCurrency, formatDate, formatExchangeRate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ApprovalSlider } from '@/components/ui/ApprovalSlider';
import { TransactionDetailRow } from './TransactionDetailRow';
import { diaFetchUserList, getCachedUserName } from '@/lib/diaApi';

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
  onViewDetails: (transaction: Transaction) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TransactionTable({
  transactions,
  onApprove,
  onReject,
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
                <>
                    <tr
                    key={transaction.id}
                    onClick={() => toggleExpand(transaction.id)}
                    className={cn(
                      'hover:bg-muted/30 transition-colors cursor-pointer',
                      selectedIds.includes(transaction.id) && 'bg-primary/10',
                      isExpanded && 'bg-primary/20 border-l-4 border-l-primary'
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
                          <Badge variant="outline" className={cn("gap-1 text-xs", config.color)}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
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
                        // _user is stored in dia_raw_data which is passed as details
                        const rawData = transaction.details as Record<string, unknown> | undefined;
                        const userId = rawData?._user as number | undefined;
                        const userName = userId ? (userNames[userId] || getCachedUserName(userId)) : null;
                        
                        // If we have a userId but no name yet, try to show loading indicator
                        if (userId && !userName && Object.keys(userNames).length === 0) {
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
                      {getStatusBadge(transaction.status)}
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <ApprovalSlider
                          size="sm"
                          onApprove={() => onApprove([transaction.id])}
                          onReject={() => onReject([transaction.id])}
                          onAnalyze={() => toggleExpand(transaction.id)}
                          disabled={false}
                          currentStatus={transaction.status}
                        />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${transaction.id}-detail`}>
                      <td colSpan={11} className="p-0">
                        <TransactionDetailRow 
                          transaction={transaction} 
                          onApprove={() => onApprove([transaction.id])}
                          onReject={() => onReject([transaction.id])}
                        />
                      </td>
                    </tr>
                  )}
                </>
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
