import { useState } from 'react';
import { 
  Check, 
  X, 
  FileText,
  Receipt,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { Transaction, TRANSACTION_STATUS_LABELS } from '@/types/transaction';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ApprovalSlider } from '@/components/ui/ApprovalSlider';
import { TransactionDetailRow } from './TransactionDetailRow';

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
                Belge No
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Açıklama
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cari
              </th>
              <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tarih
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
                      selectedIds.includes(transaction.id) && 'bg-primary/5',
                      isExpanded && 'bg-muted/50'
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
                            <Receipt className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-medium line-clamp-1">{transaction.description}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-muted-foreground">{transaction.counterparty}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-muted-foreground">{formatDate(transaction.date)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <span className={cn(
                        'font-semibold tabular-nums',
                        transaction.amount >= 0 ? 'text-success' : 'text-destructive'
                      )}>
                        {formatCurrency(transaction.amount)}
                      </span>
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
                      <td colSpan={9} className="p-0">
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
