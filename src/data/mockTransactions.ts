import { Transaction, TransactionGroup, TransactionType } from '@/types/transaction';

const generateMockTransactions = (): Transaction[] => [
  // Faturalar
  {
    id: 'inv-001',
    type: 'invoice',
    description: 'ABC Ticaret A.Ş. Satış Faturası',
    amount: 45750.00,
    currency: 'TRY',
    date: '2024-01-15',
    documentNo: 'FTR-2024-0145',
    counterparty: 'ABC Ticaret A.Ş.',
    status: 'pending',
    diaRecordId: 'DIA-INV-001',
    attachmentUrl: '/invoice-sample.pdf',
  },
  {
    id: 'inv-002',
    type: 'invoice',
    description: 'XYZ Holding Satış Faturası',
    amount: 128500.00,
    currency: 'TRY',
    date: '2024-01-14',
    documentNo: 'FTR-2024-0144',
    counterparty: 'XYZ Holding',
    status: 'pending',
    diaRecordId: 'DIA-INV-002',
  },
  {
    id: 'inv-003',
    type: 'invoice',
    description: 'Mega Yazılım Ltd. Hizmet Faturası',
    amount: 32000.00,
    currency: 'TRY',
    date: '2024-01-13',
    documentNo: 'FTR-2024-0143',
    counterparty: 'Mega Yazılım Ltd.',
    status: 'pending',
    diaRecordId: 'DIA-INV-003',
  },
  // Cari Hareketler
  {
    id: 'cur-001',
    type: 'current_account',
    description: 'Tedarikçi Ödemesi - Delta Malzeme',
    amount: -85000.00,
    currency: 'TRY',
    date: '2024-01-15',
    documentNo: 'CHR-2024-0089',
    counterparty: 'Delta Malzeme San.',
    status: 'pending',
    diaRecordId: 'DIA-CUR-001',
  },
  {
    id: 'cur-002',
    type: 'current_account',
    description: 'Müşteri Tahsilatı - Gamma İnşaat',
    amount: 156000.00,
    currency: 'TRY',
    date: '2024-01-14',
    documentNo: 'CHR-2024-0088',
    counterparty: 'Gamma İnşaat A.Ş.',
    status: 'pending',
    diaRecordId: 'DIA-CUR-002',
  },
  // Banka Hareketleri
  {
    id: 'bnk-001',
    type: 'bank',
    description: 'EFT Gönderimi - Kira Ödemesi',
    amount: -45000.00,
    currency: 'TRY',
    date: '2024-01-15',
    documentNo: 'BNK-2024-0234',
    counterparty: 'Merkez GYO',
    status: 'pending',
    diaRecordId: 'DIA-BNK-001',
  },
  {
    id: 'bnk-002',
    type: 'bank',
    description: 'Havale Girişi - Müşteri Ödemesi',
    amount: 230000.00,
    currency: 'TRY',
    date: '2024-01-14',
    documentNo: 'BNK-2024-0233',
    counterparty: 'Epsilon Teknoloji',
    status: 'pending',
    diaRecordId: 'DIA-BNK-002',
  },
  // Kasa Hareketleri
  {
    id: 'csh-001',
    type: 'cash',
    description: 'Peşin Satış Tahsilatı',
    amount: 8500.00,
    currency: 'TRY',
    date: '2024-01-15',
    documentNo: 'KSA-2024-0056',
    counterparty: 'Perakende Müşteri',
    status: 'pending',
    diaRecordId: 'DIA-CSH-001',
  },
  {
    id: 'csh-002',
    type: 'cash',
    description: 'Ofis Giderleri Ödemesi',
    amount: -3200.00,
    currency: 'TRY',
    date: '2024-01-14',
    documentNo: 'KSA-2024-0055',
    counterparty: 'Çeşitli Tedarikçiler',
    status: 'pending',
    diaRecordId: 'DIA-CSH-002',
  },
  // Çek/Senet Hareketleri
  {
    id: 'chk-001',
    type: 'check_note',
    description: 'Müşteri Çeki - Vadeli',
    amount: 175000.00,
    currency: 'TRY',
    date: '2024-01-15',
    documentNo: 'ÇEK-2024-0012',
    counterparty: 'Zeta Otomotiv',
    status: 'pending',
    diaRecordId: 'DIA-CHK-001',
  },
  {
    id: 'chk-002',
    type: 'check_note',
    description: 'Tedarikçiye Verilen Senet',
    amount: -92000.00,
    currency: 'TRY',
    date: '2024-01-13',
    documentNo: 'SNT-2024-0008',
    counterparty: 'Eta Makine',
    status: 'pending',
    diaRecordId: 'DIA-CHK-002',
  },
];

export const mockTransactions = generateMockTransactions();

export const getTransactionGroups = (transactions: Transaction[]): TransactionGroup[] => {
  const types: TransactionType[] = ['invoice', 'current_account', 'bank', 'cash', 'check_note'];
  const labels: Record<TransactionType, string> = {
    invoice: 'Faturalar',
    current_account: 'Cari Hareketler',
    bank: 'Banka Hareketleri',
    cash: 'Kasa Hareketleri',
    check_note: 'Çek/Senet Hareketleri',
  };
  const icons: Record<TransactionType, string> = {
    invoice: 'FileText',
    current_account: 'Users',
    bank: 'Building2',
    cash: 'Wallet',
    check_note: 'CreditCard',
  };

  return types.map(type => {
    const filtered = transactions.filter(t => t.type === type);
    return {
      type,
      label: labels[type],
      icon: icons[type],
      count: filtered.length,
      totalAmount: filtered.reduce((sum, t) => sum + t.amount, 0),
      transactions: filtered,
    };
  }).filter(g => g.count > 0);
};
