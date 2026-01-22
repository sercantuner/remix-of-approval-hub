import { useState, useMemo } from 'react';
import { 
  ClipboardCheck, 
  Clock, 
  CheckCircle, 
  XCircle,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatCard } from '@/components/dashboard/StatCard';
import { CategoryCard } from '@/components/dashboard/CategoryCard';
import { TransactionTable } from '@/components/dashboard/TransactionTable';
import { TransactionDetailModal } from '@/components/dashboard/TransactionDetailModal';
import { mockTransactions, getTransactionGroups } from '@/data/mockTransactions';
import { Transaction, TransactionType } from '@/types/transaction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [activeCategory, setActiveCategory] = useState<TransactionType | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const pendingTransactions = useMemo(() => 
    transactions.filter(t => t.status === 'pending'),
    [transactions]
  );

  const groups = useMemo(() => 
    getTransactionGroups(pendingTransactions),
    [pendingTransactions]
  );

  const filteredTransactions = useMemo(() => {
    let filtered = pendingTransactions;

    if (activeCategory) {
      filtered = filtered.filter(t => t.type === activeCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.documentNo.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.counterparty.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [pendingTransactions, activeCategory, searchQuery]);

  const stats = useMemo(() => {
    const approved = transactions.filter(t => t.status === 'approved').length;
    const rejected = transactions.filter(t => t.status === 'rejected').length;
    const pending = pendingTransactions.length;
    const total = transactions.length;

    return { approved, rejected, pending, total };
  }, [transactions, pendingTransactions]);

  const handleApprove = (ids: string[]) => {
    setTransactions(prev =>
      prev.map(t =>
        ids.includes(t.id) ? { ...t, status: 'approved' as const } : t
      )
    );
    setSelectedIds([]);
    setSelectedTransaction(null);
    toast({
      title: 'İşlemler Onaylandı',
      description: `${ids.length} işlem başarıyla onaylandı.`,
    });
  };

  const handleReject = (ids: string[]) => {
    setTransactions(prev =>
      prev.map(t =>
        ids.includes(t.id) ? { ...t, status: 'rejected' as const } : t
      )
    );
    setSelectedIds([]);
    setSelectedTransaction(null);
    toast({
      title: 'İşlemler Reddedildi',
      description: `${ids.length} işlem reddedildi.`,
      variant: 'destructive',
    });
  };

  const handleRefresh = () => {
    toast({
      title: 'Veriler Güncelleniyor',
      description: 'Dia ERP ile senkronizasyon başlatıldı...',
    });
    // Simulate refresh
    setTimeout(() => {
      toast({
        title: 'Güncelleme Tamamlandı',
        description: 'Tüm veriler güncel.',
      });
    }, 1500);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Hoş Geldiniz, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-sm text-muted-foreground">
                Onay bekleyen {stats.pending} işlem bulunuyor
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Yenile
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Bekleyen İşlemler"
              value={stats.pending}
              icon={Clock}
              variant="primary"
            />
            <StatCard
              title="Bugün Onaylanan"
              value={stats.approved}
              icon={CheckCircle}
              trend={{ value: 12, isPositive: true }}
            />
            <StatCard
              title="Bugün Reddedilen"
              value={stats.rejected}
              icon={XCircle}
            />
            <StatCard
              title="Toplam İşlem"
              value={stats.total}
              icon={ClipboardCheck}
            />
          </div>

          {/* Category Cards */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">İşlem Kategorileri</h2>
              {activeCategory && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveCategory(null)}
                >
                  Tümünü Göster
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {groups.map((group) => (
                <CategoryCard
                  key={group.type}
                  type={group.type}
                  label={group.label}
                  count={group.count}
                  totalAmount={group.totalAmount}
                  onClick={() => setActiveCategory(group.type)}
                  isActive={activeCategory === group.type}
                />
              ))}
            </div>
          </div>

          {/* Transactions Table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {activeCategory ? groups.find(g => g.type === activeCategory)?.label : 'Tüm Onay Bekleyen İşlemler'}
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <TransactionTable
              transactions={filteredTransactions}
              onApprove={handleApprove}
              onReject={handleReject}
              onViewDetails={setSelectedTransaction}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          </div>
        </div>
      </main>

      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onApprove={(id) => handleApprove([id])}
        onReject={(id) => handleReject([id])}
      />
    </div>
  );
}
