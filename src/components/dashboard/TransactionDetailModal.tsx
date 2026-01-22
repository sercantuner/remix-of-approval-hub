import { useState, useEffect } from 'react';
import { 
  FileText, 
  Building2, 
  Calendar, 
  Hash, 
  DollarSign,
  Check,
  X,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Transaction, TransactionType, TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from '@/types/transaction';
import { formatCurrency, formatDate } from '@/lib/utils';
import { diaFetchDetail } from '@/lib/diaApi';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

// Field labels for Turkish display
const FIELD_LABELS: Record<string, string> = {
  belgeno: 'Belge No',
  belgeno2: 'Belge No 2',
  belgetarihi: 'Belge Tarihi',
  islemtarihi: 'İşlem Tarihi',
  vadetarihi: 'Vade Tarihi',
  aciklama: 'Açıklama',
  aciklama2: 'Açıklama 2',
  toplamtutar: 'Toplam Tutar',
  net: 'Net Tutar',
  kdv: 'KDV',
  kdvtutar: 'KDV Tutarı',
  iskonto: 'İskonto',
  iskontotutar: 'İskonto Tutarı',
  doviz: 'Döviz',
  dovizkuru: 'Döviz Kuru',
  carikod: 'Cari Kod',
  cariunvan: 'Cari Ünvan',
  __carifirma: 'Cari Firma',
  miktar: 'Miktar',
  birim: 'Birim',
  birimfiyat: 'Birim Fiyat',
  stokkodu: 'Stok Kodu',
  stokadi: 'Stok Adı',
  depo: 'Depo',
  efaturalinki: 'E-Fatura Linki',
  earsivlinki: 'E-Arşiv Linki',
  borc: 'Borç',
  alacak: 'Alacak',
  bakiye: 'Bakiye',
  hesapkodu: 'Hesap Kodu',
  hesapadi: 'Hesap Adı',
  banka: 'Banka',
  sube: 'Şube',
  ceksenetkodu: 'Çek/Senet Kodu',
  portfoydurumu: 'Portföy Durumu',
  kesideci: 'Keşideci',
  bordroadi: 'Bordro Adı',
};

// Fields to hide from display
const HIDDEN_FIELDS = ['_key', 'session_id', 'firma_kodu', 'donem_kodu', '__firmaadi'];

// Fields that contain line items (arrays)
const LINE_ITEM_FIELDS = ['kalemler', 'satirlar', 'detaylar', 'hareketler'];

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field.toLowerCase()] || field;
}

function isHiddenField(field: string): boolean {
  return HIDDEN_FIELDS.includes(field.toLowerCase()) || field.startsWith('_');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    // Check if it looks like a currency amount
    if (Math.abs(value) >= 1 || value === 0) {
      return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

export function TransactionDetailModal({
  transaction,
  open,
  onClose,
  onApprove,
  onReject,
}: TransactionDetailModalProps) {
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch detail data when modal opens
  useEffect(() => {
    if (open && transaction?.diaRecordId) {
      setIsLoading(true);
      setError(null);
      setDetailData(null);

      // Extract _key from diaRecordId (format: "type-key")
      const parts = transaction.diaRecordId.split('-');
      const recordKey = parts.length > 1 ? parts.slice(1).join('-') : parts[0];

      diaFetchDetail(transaction.type, recordKey)
        .then((data) => {
          // DIA returns result as an array, get first item
          const result = data?.result?.[0] || data?.msg?.[0] || null;
          setDetailData(result);
        })
        .catch((err) => {
          console.error('Failed to fetch detail:', err);
          setError(err.message || 'Detay bilgisi yüklenemedi');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!open) {
      // Reset state when modal closes
      setDetailData(null);
      setError(null);
    }
  }, [open, transaction?.diaRecordId, transaction?.type]);

  if (!transaction) return null;

  // Extract e-fatura and e-arsiv links from detail data or raw data
  const rawData = detailData || (transaction.details as Record<string, unknown> | undefined);
  const efaturaLink = rawData?.efaturalinki as string | undefined || rawData?.efatura_link as string | undefined;
  const earsivLink = rawData?.earsivlinki as string | undefined || rawData?.earsiv_link as string | undefined;

  const detailItems = [
    { label: 'Belge Türü', value: TRANSACTION_TYPE_LABELS[transaction.type], icon: FileText },
    { label: 'Belge No', value: transaction.documentNo, icon: Hash },
    { label: 'Cari Hesap', value: transaction.counterparty, icon: Building2 },
    { label: 'Tarih', value: formatDate(transaction.date), icon: Calendar },
    { label: 'Tutar', value: formatCurrency(transaction.amount), icon: DollarSign },
  ];

  // Separate main fields from line items
  const mainFields: [string, unknown][] = [];
  const lineItems: [string, unknown[]][] = [];

  if (detailData) {
    Object.entries(detailData).forEach(([key, value]) => {
      if (isHiddenField(key)) return;
      
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        lineItems.push([key, value]);
      } else if (!Array.isArray(value)) {
        mainFields.push([key, value]);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
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

        <ScrollArea className="max-h-[60vh] pr-4">
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

            {/* Basic Details Grid */}
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

            <Separator />

            {/* DIA Detail Data Section */}
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">DIA Detay Bilgileri</p>
              
              {isLoading && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Detaylar yükleniyor...</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}

              {!isLoading && !error && detailData && (
                <>
                  {/* Main Fields */}
                  {mainFields.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {mainFields.map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start py-1 border-b border-border/50">
                          <span className="text-sm text-muted-foreground">{getFieldLabel(key)}</span>
                          <span className="text-sm font-medium text-right max-w-[60%] break-words">
                            {formatValue(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Line Items (Kalemler, Satırlar, etc.) */}
                  {lineItems.length > 0 && (
                    <Accordion type="multiple" className="w-full">
                      {lineItems.map(([key, items]) => (
                        <AccordionItem key={key} value={key}>
                          <AccordionTrigger className="text-sm">
                            {getFieldLabel(key)} ({items.length} adet)
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {Object.keys(items[0] as object)
                                      .filter(k => !isHiddenField(k))
                                      .slice(0, 6) // Limit columns for readability
                                      .map((col) => (
                                        <TableHead key={col} className="text-xs whitespace-nowrap">
                                          {getFieldLabel(col)}
                                        </TableHead>
                                      ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map((item, idx) => (
                                    <TableRow key={idx}>
                                      {Object.entries(item as object)
                                        .filter(([k]) => !isHiddenField(k))
                                        .slice(0, 6)
                                        .map(([col, val]) => (
                                          <TableCell key={col} className="text-xs">
                                            {formatValue(val)}
                                          </TableCell>
                                        ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </>
              )}

              {!isLoading && !error && !detailData && (
                <p className="text-sm text-muted-foreground italic">
                  Detay bilgisi bulunamadı veya bu işlem tipi için ayrıntı desteklenmiyor.
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

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
