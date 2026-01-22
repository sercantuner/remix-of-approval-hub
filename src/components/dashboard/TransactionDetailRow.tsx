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
  Loader2,
  Package,
  Banknote
} from 'lucide-react';
import { Transaction, TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from '@/types/transaction';
import { formatCurrency, formatDate } from '@/lib/utils';
import { diaFetchDetail } from '@/lib/diaApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TransactionDetailRowProps {
  transaction: Transaction;
  onApprove: () => void;
  onReject: () => void;
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
  kdvorani: 'KDV Oranı',
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
  stok_adi: 'Stok Adı',
  stok_kodu: 'Stok Kodu',
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
  satirno: 'Satır No',
  tutar: 'Tutar',
  fiyat: 'Fiyat',
  adet: 'Adet',
};

// Fields to hide from display
const HIDDEN_FIELDS = ['_key', 'session_id', 'firma_kodu', 'donem_kodu', '__firmaadi', 'kalemler', 'satirlar', 'detaylar', 'hareketler'];

// Fields that contain line items (arrays)
const LINE_ITEM_FIELDS = ['kalemler', 'satirlar', 'detaylar', 'hareketler'];

// Priority fields to show first
const PRIORITY_FIELDS = ['belgeno', 'belgeno2', 'belgetarihi', 'vadetarihi', 'cariunvan', '__carifirma', 'net', 'toplamtutar', 'kdvtutar', 'aciklama'];

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field.toLowerCase()] || field;
}

function isHiddenField(field: string): boolean {
  return HIDDEN_FIELDS.includes(field.toLowerCase()) || field.startsWith('_');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1 || value === 0) {
      return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

// Get columns for line items table based on transaction type
function getLineItemColumns(type: string, items: Record<string, unknown>[]): string[] {
  if (!items.length) return [];
  
  const allKeys = Object.keys(items[0]).filter(k => !k.startsWith('_'));
  
  // Priority columns for different types
  const priorityColumns: Record<string, string[]> = {
    order: ['satirno', 'stokkodu', 'stokadi', 'stok_kodu', 'stok_adi', 'miktar', 'birim', 'birimfiyat', 'tutar', 'kdvorani', 'net'],
    invoice: ['satirno', 'stokkodu', 'stokadi', 'stok_kodu', 'stok_adi', 'miktar', 'birim', 'birimfiyat', 'tutar', 'kdvorani', 'kdvtutar', 'net'],
    bank: ['aciklama', 'borc', 'alacak', 'bakiye'],
    current_account: ['aciklama', 'borc', 'alacak', 'bakiye', 'belgetarihi'],
    cash: ['aciklama', 'borc', 'alacak', 'bakiye'],
    check_note: ['ceksenetkodu', 'vadetarihi', 'tutar', 'portfoydurumu', 'kesideci'],
  };

  const priority = priorityColumns[type] || [];
  const orderedColumns: string[] = [];
  
  // Add priority columns first if they exist
  priority.forEach(col => {
    const found = allKeys.find(k => k.toLowerCase() === col.toLowerCase());
    if (found) orderedColumns.push(found);
  });
  
  // Add remaining columns
  allKeys.forEach(col => {
    if (!orderedColumns.includes(col) && orderedColumns.length < 8) {
      orderedColumns.push(col);
    }
  });

  return orderedColumns.slice(0, 8);
}

export function TransactionDetailRow({
  transaction,
  onApprove,
  onReject,
}: TransactionDetailRowProps) {
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction?.diaRecordId) {
      setIsLoading(true);
      setError(null);

      // Extract _key from diaRecordId (format: "method_name-key", e.g., "scf_fatura_listele-2440413")
      // We need to get the last part after the last hyphen
      const lastHyphenIndex = transaction.diaRecordId.lastIndexOf('-');
      const recordKey = lastHyphenIndex !== -1 
        ? transaction.diaRecordId.substring(lastHyphenIndex + 1) 
        : transaction.diaRecordId;

      console.log('[TransactionDetailRow] Fetching detail for:', transaction.type, 'key:', recordKey);

      diaFetchDetail(transaction.type, recordKey)
        .then((data) => {
          console.log('[TransactionDetailRow] DIA response:', data);
          // DIA may return data in different formats: result[], msg[], or directly as object
          const result = data?.result?.[0] || data?.msg?.[0] || data?.result || data?.msg || null;
          setDetailData(result);
        })
        .catch((err) => {
          console.error('Failed to fetch detail:', err);
          setError(err.message || 'Detay bilgisi yüklenemedi');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [transaction?.diaRecordId, transaction?.type]);

  // Extract links
  const rawData = detailData || (transaction.details as Record<string, unknown> | undefined);
  const efaturaLink = rawData?.efaturalinki as string | undefined;
  const earsivLink = rawData?.earsivlinki as string | undefined;

  // Separate main fields from line items
  const mainFields: [string, unknown][] = [];
  const lineItems: [string, unknown[]][] = [];

  if (detailData) {
    // Sort fields by priority
    const entries = Object.entries(detailData);
    const priorityEntries: [string, unknown][] = [];
    const otherEntries: [string, unknown][] = [];

    entries.forEach(([key, value]) => {
      if (isHiddenField(key)) return;
      
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        lineItems.push([key, value]);
      } else if (!Array.isArray(value)) {
        if (PRIORITY_FIELDS.includes(key.toLowerCase())) {
          priorityEntries.push([key, value]);
        } else {
          otherEntries.push([key, value]);
        }
      }
    });

    // Sort priority entries by their position in PRIORITY_FIELDS
    priorityEntries.sort((a, b) => {
      const aIdx = PRIORITY_FIELDS.indexOf(a[0].toLowerCase());
      const bIdx = PRIORITY_FIELDS.indexOf(b[0].toLowerCase());
      return aIdx - bIdx;
    });

    mainFields.push(...priorityEntries, ...otherEntries);
  }

  return (
    <div className="bg-muted/30 border-t border-b border-muted p-4 animate-in slide-in-from-top-2 duration-200">
      {isLoading && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Detaylar yükleniyor...</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      {!isLoading && !error && detailData && (
        <div className="space-y-4">
          {/* Header with type and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="font-medium">{TRANSACTION_TYPE_LABELS[transaction.type]}</span>
                <span className="text-sm text-muted-foreground ml-2">#{transaction.documentNo}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(efaturaLink || earsivLink) && (
                <>
                  {efaturaLink && (
                    <Button variant="outline" size="sm" asChild className="gap-1 h-8">
                      <a href={efaturaLink} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-3 h-3" />
                        E-Fatura
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  )}
                  {earsivLink && (
                    <Button variant="outline" size="sm" asChild className="gap-1 h-8">
                      <a href={earsivLink} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-3 h-3" />
                        E-Arşiv
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  )}
                </>
              )}
              {transaction.status === 'pending' && (
                <>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={onReject}
                    className="h-8"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Reddet
                  </Button>
                  <Button 
                    size="sm"
                    onClick={onApprove}
                    className="bg-success hover:bg-success/90 h-8"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Onayla
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Main Fields Grid */}
          {mainFields.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {mainFields.slice(0, 12).map(([key, value]) => (
                <div key={key} className="bg-background/50 rounded-lg p-2">
                  <span className="text-xs text-muted-foreground block">{getFieldLabel(key)}</span>
                  <span className="text-sm font-medium truncate block" title={formatValue(value)}>
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Line Items Tables */}
          {lineItems.map(([key, items]) => {
            const columns = getLineItemColumns(transaction.type, items as Record<string, unknown>[]);
            
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {getFieldLabel(key)} ({items.length} satır)
                  </span>
                </div>
                <div className="bg-background rounded-lg overflow-hidden border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {columns.map((col) => (
                          <TableHead key={col} className="text-xs font-medium py-2 px-3 whitespace-nowrap">
                            {getFieldLabel(col)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items as Record<string, unknown>[]).map((item, idx) => (
                        <TableRow key={idx} className="hover:bg-muted/30">
                          {columns.map((col) => (
                            <TableCell key={col} className="text-xs py-2 px-3">
                              {formatValue(item[col])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !error && !detailData && (
        <div className="text-sm text-muted-foreground italic py-4 text-center">
          Detay bilgisi bulunamadı.
        </div>
      )}
    </div>
  );
}
