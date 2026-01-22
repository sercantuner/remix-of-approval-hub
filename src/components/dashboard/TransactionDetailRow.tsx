import { useState, useEffect } from 'react';
import { 
  FileText, 
  ExternalLink,
  Loader2,
  Package,
  Tag,
  User
} from 'lucide-react';
import { Transaction, TRANSACTION_TYPE_LABELS } from '@/types/transaction';
import { formatCurrency, formatExchangeRate } from '@/lib/utils';
import { diaFetchDetail, diaFetchUserList, getCachedUserName } from '@/lib/diaApi';

// Currency-related fields that should be formatted as money
const CURRENCY_FIELDS = ['tutar', 'tutari', 'birimfiyat', 'birimfiyati', 'sonbirimfiyati', 'net', 'kdv', 'kdvtutar', 'kdvtutari', 'iskonto', 'iskontotutar', 'indirimtutari', 'indirimtoplam', 'toplam', 'toplamtutar', 'borc', 'alacak', 'bakiye', 'fiyat', 'deger'];
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
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
  m_altlar: 'İndirim/Masraflar',
  deger: 'Değer',
  kalemturu: 'Kalem Türü',
  turu: 'Türü',
  etkin: 'Etkin',
  cari: 'Cari',
  kur: 'Kur',
};

// Fields to hide from display
const HIDDEN_FIELDS = ['_key', 'session_id', 'firma_kodu', 'donem_kodu', '__firmaadi', 'kalemler', 'satirlar', 'detaylar', 'hareketler'];

// Priority fields to show first
const PRIORITY_FIELDS = ['belgeno', 'belgeno2', 'belgetarihi', 'vadetarihi', 'cariunvan', '__carifirma', 'net', 'toplamtutar', 'kdvtutar', 'aciklama'];

// Kalem türü açıklamaları
const KALEM_TURU_LABELS: Record<string, string> = {
  'INDR': 'İndirim',
  'MSRF': 'Masraf',
  'NVL': 'Navlun',
  'KMS': 'Komisyon',
  'STJ': 'Stopaj',
  'OTV': 'ÖTV',
  'SSDF': 'SSDF',
};

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field.toLowerCase()] || field;
}

function isHiddenField(field: string): boolean {
  return HIDDEN_FIELDS.includes(field.toLowerCase()) || field.startsWith('_');
}

function formatValueWithCurrency(value: unknown, fieldName?: string, currency?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  
  // Parse numeric value
  let numValue: number | null = null;
  if (typeof value === 'number') {
    numValue = value;
  } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
    numValue = parseFloat(value);
  }
  
  // If it's a number, format appropriately
  if (numValue !== null) {
    // Check if this is a currency field - format with currency symbol
    if (fieldName && CURRENCY_FIELDS.includes(fieldName.toLowerCase())) {
      return formatCurrency(numValue, currency || 'TRY');
    }
    // All numeric values: format with 2 decimal places (Turkish locale)
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numValue);
  }
  
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

function isCurrencyField(fieldName: string): boolean {
  return CURRENCY_FIELDS.includes(fieldName.toLowerCase());
}

// Flatten nested line item fields from DIA API
function flattenLineItem(item: Record<string, unknown>, transactionType: string): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...item };
  
  // Get stock name from nested _key_stk_stokkart object
  const stokKart = item._key_stk_stokkart as Record<string, unknown> | undefined;
  const stokAdi = stokKart?.adi || stokKart?.kodu || item.stokadi || item.stok_adi || null;
  
  // Get description from _key_kalemturu.aciklama (primary source for invoices and orders)
  const kalemTuru = item._key_kalemturu as Record<string, unknown> | undefined;
  const kalemTuruAciklama = kalemTuru?.aciklama || null;
  
  // Priority: _key_kalemturu.aciklama > turutxt/turuack > stock name > item.aciklama
  if (transactionType === 'order') {
    flat.aciklama = kalemTuruAciklama || item.turuack || stokAdi || item.aciklama || '-';
  } else if (transactionType === 'invoice') {
    flat.aciklama = kalemTuruAciklama || item.turutxt || stokAdi || item.aciklama || '-';
  } else if (transactionType === 'bank') {
    // For bank transactions, get cari (customer) and banka (bank account) from nested objects
    const cariKart = item._key_scf_cari as Record<string, unknown> | undefined;
    const bankaHesabi = item._key_bcs_bankahesabi as Record<string, unknown> | undefined;
    const doviz = item._key_sis_doviz as Record<string, unknown> | undefined;
    
    flat.cari = cariKart?.unvan || item.aciklama || '-';
    flat.banka = bankaHesabi?.hesapadi || bankaHesabi?.hesapkodu || '-';
    flat.doviz = doviz?.adi || item.dovizturu || 'TL';
    flat.kur = item.dovizkuru || '1.000000';
    flat.borc = item.borc || '0';
    flat.alacak = item.alacak || '0';
  } else {
    flat.aciklama = kalemTuruAciklama || stokAdi || item.aciklama || '-';
  }
  
  // _key_scf_kalem_birimleri -> birim (array format: [[id, name], ...])
  if (Array.isArray(item._key_scf_kalem_birimleri) && item._key_scf_kalem_birimleri.length > 0) {
    const birimler = item._key_scf_kalem_birimleri;
    if (Array.isArray(birimler[0]) && birimler[0].length > 1) {
      flat.birim = birimler[0][1] || '';
    }
  }
  // Also check _key_stk_stokkart_birimler for birim
  if (!flat.birim && stokKart) {
    const birimler = stokKart._key_stk_stokkart_birimler as Array<Record<string, unknown>> | undefined;
    if (birimler && birimler.length > 0 && birimler[0].birim) {
      flat.birim = birimler[0].birim;
    }
  }
  // Fallback birim from item itself
  if (!flat.birim) {
    flat.birim = item.birim || item.birimkodu || '-';
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
  
  // Exact columns for each transaction type - only show these specific columns
  const exactColumns: Record<string, string[]> = {
    order: ['aciklama', 'miktar', 'birim', 'birimfiyat', 'tutar', 'iskonto', 'kdv', 'net'],
    invoice: ['aciklama', 'miktar', 'birim', 'birimfiyat', 'tutar', 'iskonto', 'kdv', 'net'],
    bank: ['cari', 'banka', 'borc', 'alacak', 'doviz', 'kur'],
  };
  
  // For known types, return exact columns (they will be flattened)
  if (exactColumns[type]) {
    return exactColumns[type];
  }
  
  const allKeys = Object.keys(items[0]).filter(k => !k.startsWith('_'));
  
  // Priority columns for other types (with fallback behavior)
  const priorityColumns: Record<string, string[]> = {
    bank: ['aciklama', 'borc', 'alacak', 'bakiye'],
    current_account: ['aciklama', 'borc', 'alacak', 'bakiye', 'belgetarihi'],
    cash: ['aciklama', 'borc', 'alacak', 'bakiye'],
    check_note: ['ceksenetkodu', 'vadetarihi', 'tutar', 'portfoydurumu', 'kesideci'],
  };

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

// Get user name from nested _key_sis_kullanici_onaylayan object or from cache
function resolveUserName(detailData: Record<string, unknown>, userId: number | undefined): string | null {
  if (!userId) return null;
  
  // First try to get from nested object in m_kalemler
  const mKalemler = detailData.m_kalemler as Record<string, unknown>[] | undefined;
  if (mKalemler && mKalemler.length > 0) {
    const firstKalem = mKalemler[0];
    const onaylayan = firstKalem._key_sis_kullanici_onaylayan as Record<string, unknown> | undefined;
    if (onaylayan && onaylayan._key === userId && onaylayan.gercekadi) {
      return String(onaylayan.gercekadi);
    }
  }
  
  // Try from _key_scf_satiselemani
  const satisElemani = detailData._key_scf_satiselemani as Record<string, unknown> | undefined;
  if (satisElemani && satisElemani._key === userId && satisElemani.aciklama) {
    return String(satisElemani.aciklama);
  }
  
  // Try from cache
  return getCachedUserName(userId);
}

export function TransactionDetailRow({
  transaction,
  onApprove,
  onReject,
}: TransactionDetailRowProps) {
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<number, string>>({});

  // Fetch user list on mount (only once)
  useEffect(() => {
    diaFetchUserList()
      .then(users => setUserNames(users))
      .catch(err => console.warn('[TransactionDetailRow] Failed to fetch user list:', err));
  }, []);

  useEffect(() => {
    if (transaction?.diaRecordId) {
      // Bank transactions: use list data directly (no detail fetch needed)
      if (transaction.type === 'bank') {
        console.log('[TransactionDetailRow] Bank transaction, using list data directly');
        const listData = transaction.details as Record<string, unknown> | undefined;
        if (listData) {
          const syntheticDetail: Record<string, unknown> = {
            ...listData,
            m_kalemler: [{
              _key_scf_cari: { unvan: listData.cariunvan || listData.__carifirma || listData.aciklama || '-' },
              _key_bcs_bankahesabi: { hesapadi: listData.bankahesabi || listData.hesapadi || '-' },
              borc: listData.borc || '0',
              alacak: listData.alacak || '0',
              _key_sis_doviz: { adi: listData.dovizturu || 'TL' },
              dovizkuru: listData.dovizkuru || '1',
            }],
          };
          setDetailData(syntheticDetail);
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Extract _key from diaRecordId (format: "method_name-key", e.g., "scf_fatura_listele-2440413")
      const lastHyphenIndex = transaction.diaRecordId.lastIndexOf('-');
      const recordKey = lastHyphenIndex !== -1 
        ? transaction.diaRecordId.substring(lastHyphenIndex + 1) 
        : transaction.diaRecordId;

      console.log('[TransactionDetailRow] Fetching detail for:', transaction.type, 'key:', recordKey);

      diaFetchDetail(transaction.type, recordKey)
        .then((data) => {
          console.log('[TransactionDetailRow] DIA response:', data);
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
  const mAltlar: Record<string, unknown>[] = [];
  
  // Extract totals for footer
  const totals = {
    toplam: detailData?.toplam || detailData?.toplamdvz,
    toplamindirim: detailData?.toplamindirim || detailData?.toplamindirimdvz,
    toplamkdv: detailData?.toplamkdv || detailData?.toplamkdvdvz,
    net: detailData?.net || detailData?.netdvz,
  };

  if (detailData) {
    // Sort fields by priority
    const entries = Object.entries(detailData);
    const priorityEntries: [string, unknown][] = [];
    const otherEntries: [string, unknown][] = [];

    entries.forEach(([key, value]) => {
      if (isHiddenField(key)) return;
      
      // Handle m_altlar separately
      if (key === 'm_altlar' && Array.isArray(value)) {
        mAltlar.push(...value as Record<string, unknown>[]);
        return;
      }
      
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
  
  // Get user name
  const userId = detailData?._user as number | undefined;
  const userName = resolveUserName(detailData || {}, userId) || (userId ? userNames[userId] : null);

  const currency = (detailData?.dovizturu as string) || transaction.currency || 'TRY';
  
  // Get document type (belge türü) - prioritize transaction.details (from sync) since detailData doesn't have turuack
  const transactionDetails = transaction.details as Record<string, unknown> | undefined;
  const turuack = transactionDetails?.turuack || detailData?.turuack || null;

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
          {/* Header with document type and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Exchange Rate - only show if different from 1 */}
              {detailData?.dovizkuru && parseFloat(String(detailData.dovizkuru)) !== 1 && (
                <span className="text-xs text-muted-foreground">
                  Kur: {formatExchangeRate(parseFloat(String(detailData.dovizkuru)))}
                </span>
              )}
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

          {/* Main Fields Grid - Hide for invoice, order, and bank types (show only line items) */}
          {!['invoice', 'order', 'bank'].includes(transaction.type) && mainFields.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {mainFields.slice(0, 12).map(([key, value]) => (
                <div key={key} className="bg-background/50 rounded-lg p-2">
                  <span className="text-xs text-muted-foreground block">{getFieldLabel(key)}</span>
                  <span className={cn(
                    "text-sm font-medium truncate block",
                    isCurrencyField(key) && "tabular-nums"
                  )} title={formatValueWithCurrency(value, key, currency)}>
                    {formatValueWithCurrency(value, key, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Line Items Tables (m_kalemler) */}
          {lineItems.map(([key, items]) => {
            const columns = getLineItemColumns(transaction.type, items as Record<string, unknown>[]);
            const useExactColumns = ['invoice', 'order', 'bank'].includes(transaction.type);
            
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
                        // Flatten nested fields for types with exact columns
                        const flatItem = useExactColumns 
                          ? flattenLineItem(item, transaction.type) 
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

          {/* m_altlar Table (Discounts/Surcharges) - Only for invoice/order */}
          {['invoice', 'order'].includes(transaction.type) && mAltlar.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  İndirim/Masraflar ({mAltlar.length} kalem)
                </span>
              </div>
              <div className="bg-background rounded-lg overflow-hidden border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium py-2 px-3">Kalem Türü</TableHead>
                      <TableHead className="text-xs font-medium py-2 px-3 text-right">Değer</TableHead>
                      <TableHead className="text-xs font-medium py-2 px-3 text-right">Tutar</TableHead>
                      <TableHead className="text-xs font-medium py-2 px-3 text-right">KDV</TableHead>
                      <TableHead className="text-xs font-medium py-2 px-3">Açıklama</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mAltlar.map((alt, idx) => {
                      const kalemTuru = alt.kalemturu as string;
                      const kalemTuruLabel = KALEM_TURU_LABELS[kalemTuru] || kalemTuru || '-';
                      return (
                        <TableRow key={idx} className="hover:bg-muted/30">
                          <TableCell className="text-xs py-2 px-3">
                            <Badge variant="secondary" className="text-xs">
                              {kalemTuruLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2 px-3 text-right tabular-nums">
                            {formatValueWithCurrency(alt.deger, 'deger', currency)}
                          </TableCell>
                          <TableCell className="text-xs py-2 px-3 text-right tabular-nums">
                            {formatValueWithCurrency(alt.tutar, 'tutar', currency)}
                          </TableCell>
                          <TableCell className="text-xs py-2 px-3 text-right tabular-nums">
                            {formatValueWithCurrency(alt.kdv, 'kdv', currency)}
                          </TableCell>
                          <TableCell className="text-xs py-2 px-3 text-muted-foreground">
                            {String(alt.note || '-')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Totals Footer - Only for invoice/order - Row by Row with descriptions */}
          {['invoice', 'order'].includes(transaction.type) && (
            <div className="bg-background rounded-lg border overflow-hidden">
              <div className="divide-y divide-border">
                {/* Ara Toplam */}
                <div className="flex justify-between items-center px-4 py-2">
                  <span className="text-sm text-muted-foreground">Ara Toplam</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatValueWithCurrency(totals.toplam, 'toplam', currency)}
                  </span>
                </div>
                {/* Toplam İndirim */}
                <div className="flex justify-between items-center px-4 py-2">
                  <span className="text-sm text-muted-foreground">Toplam İndirim</span>
                  <span className="text-sm font-medium tabular-nums text-orange-600">
                    {formatValueWithCurrency(totals.toplamindirim, 'toplamindirim', currency)}
                  </span>
                </div>
                {/* Ara Toplam (İndirim Sonrası) */}
                <div className="flex justify-between items-center px-4 py-2">
                  <span className="text-sm text-muted-foreground">Ara Toplam (İndirim Sonrası)</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatValueWithCurrency(
                      (Number(totals.toplam || 0) - Number(totals.toplamindirim || 0)),
                      'toplam',
                      currency
                    )}
                  </span>
                </div>
                {/* Toplam KDV */}
                <div className="flex justify-between items-center px-4 py-2">
                  <span className="text-sm text-muted-foreground">Toplam KDV</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatValueWithCurrency(totals.toplamkdv, 'toplamkdv', currency)}
                  </span>
                </div>
                {/* Genel Toplam (Net) */}
                <div className="flex justify-between items-center px-4 py-3 bg-muted/30">
                  <span className="text-sm font-semibold">Genel Toplam (Net)</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {formatValueWithCurrency(totals.net, 'net', currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
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
