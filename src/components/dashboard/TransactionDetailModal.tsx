import { 
  FileText, 
  Building2, 
  Calendar, 
  Hash, 
  DollarSign,
  Check,
  X,
  ExternalLink
} from 'lucide-react';
import { Transaction, TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from '@/types/transaction';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function TransactionDetailModal({
  transaction,
  open,
  onClose,
  onApprove,
  onReject,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

  // Extract e-fatura and e-arsiv links from raw data
  const rawData = transaction.details as Record<string, unknown> | undefined;
  const efaturaLink = rawData?.efatura_link as string | undefined || rawData?.efatura as string | undefined;
  const earsivLink = rawData?.earsiv_link as string | undefined || rawData?.["e-arsiv_link"] as string | undefined || rawData?.earsiv as string | undefined;

  const detailItems = [
    { label: 'Belge Türü', value: TRANSACTION_TYPE_LABELS[transaction.type], icon: FileText },
    { label: 'Belge No', value: transaction.documentNo, icon: Hash },
    { label: 'Cari Hesap', value: transaction.counterparty, icon: Building2 },
    { label: 'Tarih', value: formatDate(transaction.date), icon: Calendar },
    { label: 'Tutar', value: formatCurrency(transaction.amount), icon: DollarSign },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="block">İşlem Detayı</span>
              <span className="text-sm font-normal text-muted-foreground">
                {transaction.documentNo}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Durum</span>
            <Badge 
              variant="outline" 
              className={
                transaction.status === 'pending' ? 'bg-warning/10 text-warning' :
                transaction.status === 'approved' ? 'bg-success/10 text-success' :
                'bg-destructive/10 text-destructive'
              }
            >
              {TRANSACTION_STATUS_LABELS[transaction.status]}
            </Badge>
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {detailItems.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
                <p className="font-medium pl-6">{item.value}</p>
              </div>
            ))}
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Açıklama</p>
            <p className="text-sm">{transaction.description}</p>
          </div>

          {/* E-Fatura / E-Arşiv Links */}
          {(efaturaLink || earsivLink) && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Fatura Belgeleri</p>
                <div className="flex flex-wrap gap-3">
                  {efaturaLink && (
                    <Button variant="outline" size="sm" asChild className="gap-2">
                      <a href={efaturaLink} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4" />
                        E-Fatura Görüntüle
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  )}
                  {earsivLink && (
                    <Button variant="outline" size="sm" asChild className="gap-2">
                      <a href={earsivLink} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4" />
                        E-Arşiv Görüntüle
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Kapat
          </Button>
          {transaction.status === 'pending' && (
            <>
              <Button 
                variant="destructive" 
                onClick={() => onReject(transaction.id)}
              >
                <X className="w-4 h-4 mr-2" />
                Reddet
              </Button>
              <Button 
                onClick={() => onApprove(transaction.id)}
                className="bg-success hover:bg-success/90"
              >
                <Check className="w-4 h-4 mr-2" />
                Onayla
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
