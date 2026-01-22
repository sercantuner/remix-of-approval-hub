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
import { formatCurrency, formatDate, formatExchangeRate } from '@/lib/utils';
import { diaFetchDetail } from '@/lib/diaApi';

// Currency-related fields that should be formatted as money
const CURRENCY_FIELDS = ['tutar', 'tutari', 'birimfiyat', 'birimfiyati', 'sonbirimfiyati', 'net', 'kdv', 'kdvtutar', 'kdvtutari', 'iskonto', 'iskontotutar', 'indirimtutari', 'indirimtoplam', 'toplam', 'toplamtutar', 'borc', 'alacak', 'bakiye', 'fiyat'];
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
  dovizturu: 'Döviz Türü',
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
  m_kalemler: 'Kalemler',
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

function formatValueWithCurrency(value: unknown, fieldName?: string, currency?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    // Check if this is a currency field
    if (fieldName && CURRENCY_FIELDS.includes(fieldName.toLowerCase())) {
      return formatCurrency(value, currency || 'TRY');
    }
    if (Math.abs(value) >= 1 || value === 0) {
      return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

function isCurrencyField(fieldName: string): boolean {
  return CURRENCY_FIELDS.includes(fieldName.toLowerCase());
}

// Flatten nested line item fields from DIA API
function flattenLineItem(item: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...item };
  
  // _key_kalemturu.aciklama -> aciklama
  if (item._key_kalemturu && typeof item._key_kalemturu === 'object') {
    const kalemTuru = item._key_kalemturu as Record<string, unknown>;
    if (kalemTuru.aciklama) {
      flat.aciklama = kalemTuru.aciklama;
    }
  }
  
  // _key_scf_kalem_birimleri -> birim (array format: [[id, name], ...])
  if (Array.isArray(item._key_scf_kalem_birimleri) && item._key_scf_kalem_birimleri.length > 0) {
    const birimler = item._key_scf_kalem_birimleri;
    if (Array.isArray(birimler[0]) && birimler[0].length > 1) {
      flat.birim = birimler[0][1] || '';
    }
  }
  
  // Normalize field names (different API responses use different names)
  flat.birimfiyat = item.birimfiyati || item.sonbirimfiyati || item.birimfiyat || 0;
  flat.tutar = item.tutari || item.tutar || 0;
  flat.iskonto = item.indirimtutari || item.indirimtoplam || item.iskonto || 0;
  flat.kdv = item.kdvtutari || item.kdvtutar || item.kdv || 0;
  flat.net = item.net || (Number(flat.tutar || 0) - Number(flat.iskonto || 0) + Number(flat.kdv || 0));
  flat.miktar = item.miktar || item.adet || 0;
  
  return flat;
}

// Get columns for line items table based on transaction type
function getLineItemColumns(type: string, items: Record<string, unknown>[]): string[] {
  if (!items.length) return [];
  
  const allKeys = Object.keys(items[0]).filter(k => !k.startsWith('_'));
  
  // Exact columns for invoice and order - only show these specific columns
  const exactColumns: Record<string, string[]> = {
    order: ['aciklama', 'miktar', 'birim', 'birimfiyat', 'tutar', 'iskonto', 'kdv', 'net'],
    invoice: ['aciklama', 'miktar', 'birim', 'birimfiyat', 'tutar', 'iskonto', 'kdv', 'net'],
  };
  
  // Priority columns for other types (with fallback behavior)
  const priorityColumns: Record<string, string[]> = {
    bank: ['aciklama', 'borc', 'alacak', 'bakiye'],
    current_account: ['aciklama', 'borc', 'alacak', 'bakiye', 'belgetarihi'],
    cash: ['aciklama', 'borc', 'alacak', 'bakiye'],
    check_note: ['ceksenetkodu', 'vadetarihi', 'tutar', 'portfoydurumu', 'kesideci'],
  };

  // For invoice and order, only show exact columns
  if (exactColumns[type]) {
    const orderedColumns: string[] = [];
    exactColumns[type].forEach(col => {
      // Try exact match first, then case-insensitive
      const found = allKeys.find(k => k === col) || allKeys.find(k => k.toLowerCase() === col.toLowerCase());
      if (found) orderedColumns.push(found);
    });
    return orderedColumns;
  }

  // For other types, use priority columns with fallback
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
          // DIA may return data in different formats:
          // - scf_fatura_getir returns result as object directly
          // - other methods may return result as array
          let result = null;
          if (data?.result) {
            result = Array.isArray(data.result) ? data.result[0] : data.result;
          } else if (data?.msg) {
            result = Array.isArray(data.msg) ? data.msg[0] : data.msg;
          }
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
              <div className="flex items-center gap-2">
                <span className="font-medium">{TRANSACTION_TYPE_LABELS[transaction.type]}</span>
                <span className="text-sm text-muted-foreground">#{transaction.documentNo}</span>
                {/* Currency Badge */}
                <Badge variant="outline" className="ml-1 text-xs">
                  {(detailData?.dovizturu as string) || transaction.currency || 'TL'}
                </Badge>
                {/* Exchange Rate */}
                {detailData?.dovizkuru && parseFloat(String(detailData.dovizkuru)) !== 1 && (
                  <span className="text-xs text-muted-foreground">
                    Kur: {formatExchangeRate(parseFloat(String(detailData.dovizkuru)))}
                  </span>
                )}
                {/* Recording User */}
                {detailData?._user && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Kaydeden: #{String(detailData._user)}
                  </span>
                )}
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
            </div>
          </div>

          {/* Main Fields Grid - Hide for invoice and order types */}
          {!['invoice', 'order'].includes(transaction.type) && mainFields.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {mainFields.slice(0, 12).map(([key, value]) => {
                const currency = (detailData?.dovizturu as string) || transaction.currency || 'TRY';
                return (
                  <div key={key} className="bg-background/50 rounded-lg p-2">
                    <span className="text-xs text-muted-foreground block">{getFieldLabel(key)}</span>
                    <span className={cn(
                      "text-sm font-medium truncate block",
                      isCurrencyField(key) && "tabular-nums"
                    )} title={formatValueWithCurrency(value, key, currency)}>
                      {formatValueWithCurrency(value, key, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Line Items Tables */}
          {lineItems.map(([key, items]) => {
            const columns = getLineItemColumns(transaction.type, items as Record<string, unknown>[]);
            const currency = (detailData?.dovizturu as string) || transaction.currency || 'TRY';
            
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
                          <TableHead 
                            key={col} 
                            className={cn(
                              "text-xs font-medium py-2 px-3 whitespace-nowrap",
                              isCurrencyField(col) && "text-right"
                            )}
                          >
                            {getFieldLabel(col)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items as Record<string, unknown>[]).map((item, idx) => {
                        // Flatten nested fields for invoice/order types
                        const flatItem = ['invoice', 'order'].includes(transaction.type) 
                          ? flattenLineItem(item) 
                          : item;
                        return (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            {columns.map((col) => (
                              <TableCell 
                                key={col} 
                                className={cn(
                                  "text-xs py-2 px-3",
                                  isCurrencyField(col) && "text-right tabular-nums"
                                )}
                              >
                                {formatValueWithCurrency(flatItem[col], col, currency)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
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
