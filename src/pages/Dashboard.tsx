import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { TransactionTable } from "@/components/dashboard/TransactionTable";
import { TransactionDetailModal } from "@/components/dashboard/TransactionDetailModal";
import { DiaConnectionForm } from "@/components/settings/DiaConnectionForm";
import { SyncProgress } from "@/components/ui/SyncProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { diaSync, diaApprove } from "@/lib/diaApi";
import type { Transaction, TransactionType, TransactionGroup } from "@/types/transaction";

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  invoice: "Faturalar",
  current_account: "Cari Hareketler",
  bank: "Banka Hareketleri",
  cash: "Kasa Hareketleri",
  check_note: "Çek/Senet Hareketleri",
  order: "Siparişler",
};

const SYNC_STEPS = [
  { id: "connect", label: "DIA'ya bağlanılıyor..." },
  { id: "invoice", label: "Faturalar çekiliyor..." },
  { id: "current_account", label: "Cari hareketler çekiliyor..." },
  { id: "bank", label: "Banka hareketleri çekiliyor..." },
  { id: "cash", label: "Kasa hareketleri çekiliyor..." },
  { id: "order", label: "Siparişler çekiliyor..." },
  { id: "save", label: "Veriler kaydediliyor..." },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeCategory, setActiveCategory] = useState<TransactionType | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    isOpen: boolean;
    steps: Array<{ id: string; label: string; status: "pending" | "loading" | "done" | "error" }>;
    currentStep: number;
    totalRecords: number;
    elapsedTime: number;
  }>({
    isOpen: false,
    steps: SYNC_STEPS.map(s => ({ ...s, status: "pending" })),
    currentStep: 0,
    totalRecords: 0,
    elapsedTime: 0,
  });
  const [user, setUser] = useState<{ id: string; email: string; full_name?: string } | null>(null);
  const [hasDiaConnection, setHasDiaConnection] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<any>(null);

  // Handle sidebar section change - set category filter based on section
  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    
    // Map section to transaction type for filtering
    const sectionToCategory: Record<string, TransactionType | null> = {
      dashboard: null,
      invoice: "invoice",
      order: "order",
      current_account: "current_account",
      bank: "bank",
      cash: "cash",
      check_note: "check_note",
      settings: null,
    };
    
    if (section !== "settings") {
      setActiveCategory(sectionToCategory[section] || null);
    }
  };

  // Check auth and load data
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/login");
        return;
      }

      setUser({
        id: session.user.id,
        email: session.user.email || "",
        full_name: session.user.user_metadata?.full_name,
      });

      // Check DIA connection
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      setProfile(profileData);
      setHasDiaConnection(!!profileData?.dia_session_id);

      // Load transactions
      await loadTransactions();
    };

    checkAuthAndLoad();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadTransactions = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from("pending_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });

    if (error) {
      console.error("Error loading transactions:", error);
    } else if (data) {
      const mapped: Transaction[] = data.map((t) => ({
        id: t.id,
        type: t.transaction_type as TransactionType,
        description: t.description || "",
        amount: Number(t.amount),
        currency: t.currency || "TRY",
        date: t.transaction_date,
        documentNo: t.document_no,
        counterparty: t.counterparty || "",
        status: t.status as Transaction["status"],
        diaRecordId: t.dia_record_id,
        attachmentUrl: t.attachment_url,
        details: t.dia_raw_data as Record<string, unknown>,
      }));
      setTransactions(mapped);
    }

    setIsLoading(false);
  };

  const pendingTransactions = useMemo(
    () => transactions.filter((t) => t.status === "pending"),
    [transactions]
  );

  const groups = useMemo(() => {
    const types: TransactionType[] = ["invoice", "current_account", "bank", "cash", "check_note", "order"];

    return types
      .map((type) => {
        const filtered = pendingTransactions.filter((t) => t.type === type);
        return {
          type,
          label: TRANSACTION_TYPE_LABELS[type],
          icon: type,
          count: filtered.length,
          totalAmount: filtered.reduce((sum, t) => sum + t.amount, 0),
          transactions: filtered,
        };
      })
      .filter((g) => g.count > 0);
  }, [pendingTransactions]);

  const filteredTransactions = useMemo(() => {
    let filtered = pendingTransactions;

    if (activeCategory) {
      filtered = filtered.filter((t) => t.type === activeCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.documentNo.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.counterparty.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [pendingTransactions, activeCategory, searchQuery]);

  const stats = useMemo(() => {
    const approved = transactions.filter((t) => t.status === "approved").length;
    const rejected = transactions.filter((t) => t.status === "rejected").length;
    const pending = pendingTransactions.length;
    const total = transactions.length;

    return { approved, rejected, pending, total };
  }, [transactions, pendingTransactions]);

  const handleApprove = async (ids: string[]) => {
    try {
      await diaApprove(ids, "approve");
      await loadTransactions();
      setSelectedIds([]);
      setSelectedTransaction(null);
      toast({
        title: "İşlemler Onaylandı",
        description: `${ids.length} işlem başarıyla onaylandı.`,
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "İşlemler onaylanırken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (ids: string[]) => {
    try {
      await diaApprove(ids, "reject");
      await loadTransactions();
      setSelectedIds([]);
      setSelectedTransaction(null);
      toast({
        title: "İşlemler Reddedildi",
        description: `${ids.length} işlem reddedildi.`,
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "İşlemler reddedilirken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    const startTime = Date.now();
    
    // Initialize progress UI
    setSyncProgress({
      isOpen: true,
      steps: SYNC_STEPS.map((s, i) => ({ 
        ...s, 
        status: i === 0 ? "loading" : "pending" 
      })),
      currentStep: 0,
      totalRecords: 0,
      elapsedTime: 0,
    });

    // Update elapsed time every 100ms
    const timerInterval = setInterval(() => {
      setSyncProgress(prev => ({
        ...prev,
        elapsedTime: (Date.now() - startTime) / 1000,
      }));
    }, 100);

    // Simulate step progress (backend runs in parallel, so we animate through steps)
    const stepInterval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev.currentStep < SYNC_STEPS.length - 1) {
          const newSteps = prev.steps.map((s, i) => ({
            ...s,
            status: i < prev.currentStep + 1 ? "done" as const : 
                   i === prev.currentStep + 1 ? "loading" as const : 
                   "pending" as const,
          }));
          return {
            ...prev,
            steps: newSteps,
            currentStep: prev.currentStep + 1,
          };
        }
        return prev;
      });
    }, 500);

    try {
      // 30 saniye timeout ile senkronizasyon
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 30000);
      });
      
      const result = await Promise.race([diaSync(), timeoutPromise]);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Mark all steps as done
      clearInterval(stepInterval);
      setSyncProgress(prev => ({
        ...prev,
        steps: prev.steps.map(s => ({ ...s, status: "done" as const })),
        currentStep: SYNC_STEPS.length - 1,
        totalRecords: result.synced,
      }));
      
      await loadTransactions();
      
      // Close progress after a short delay
      setTimeout(() => {
        setSyncProgress(prev => ({ ...prev, isOpen: false }));
      }, 1500);
      
      toast({
        title: "Senkronizasyon Tamamlandı",
        description: `${result.synced} işlem ${duration} saniyede senkronize edildi.`,
      });
    } catch (error) {
      clearInterval(stepInterval);
      const errorMsg = error instanceof Error ? error.message : "Beklenmeyen hata";
      
      setSyncProgress(prev => ({
        ...prev,
        steps: prev.steps.map((s, i) => ({
          ...s,
          status: i <= prev.currentStep ? (i === prev.currentStep ? "error" : "done") : "pending",
        })),
      }));
      
      setTimeout(() => {
        setSyncProgress(prev => ({ ...prev, isOpen: false }));
      }, 2000);
      
      toast({
        title: "Senkronizasyon Hatası",
        description: errorMsg === "timeout" 
          ? "İşlem zaman aşımına uğradı (30s). Lütfen tekrar deneyin."
          : errorMsg,
        variant: "destructive",
      });
    } finally {
      clearInterval(timerInterval);
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleDiaConnectionSuccess = () => {
    setHasDiaConnection(true);
    setActiveSection("dashboard");
  };

  // Show settings if no DIA connection
  if (hasDiaConnection === false && activeSection !== "settings") {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar
          activeSection="settings"
          onSectionChange={handleSectionChange}
          user={user}
          onLogout={handleLogout}
        />
        <main className="flex-1 p-6">
          <div className="max-w-2xl mx-auto mt-12">
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground">Dia ERP Bağlantısı Gerekli</h3>
                <p className="text-sm text-muted-foreground">
                  İşlemleri görüntülemek için önce Dia ERP bağlantınızı kurmanız gerekmektedir.
                </p>
              </div>
            </div>
            <DiaConnectionForm onSuccess={handleDiaConnectionSuccess} />
          </div>
        </main>
      </div>
    );
  }

  // Settings page
  if (activeSection === "settings") {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          user={user}
          onLogout={handleLogout}
        />
        <main className="flex-1 p-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Ayarlar</h1>
            <p className="text-muted-foreground">Dia ERP bağlantı ayarlarınızı yönetin.</p>
          </header>
          <DiaConnectionForm
            onSuccess={handleDiaConnectionSuccess}
            existingConnection={{
              sunucuAdi: profile?.dia_sunucu_adi,
              firmaKodu: profile?.dia_firma_kodu,
              donemKodu: profile?.dia_donem_kodu,
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Hoş Geldiniz, {user?.full_name?.split(" ")[0] || "Kullanıcı"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Onay bekleyen {stats.pending} işlem bulunuyor
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSync} variant="outline" className="gap-2" disabled={isSyncing}>
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Senkronize Ediliyor..." : "Senkronize Et"}
              </Button>
              <Button onClick={() => handleSectionChange("settings")} variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Bekleyen İşlemler" value={stats.pending} icon={Clock} variant="primary" />
            <StatCard
              title="Onaylanan"
              value={stats.approved}
              icon={CheckCircle}
              trend={{ value: 12, isPositive: true }}
            />
            <StatCard title="Reddedilen" value={stats.rejected} icon={XCircle} />
            <StatCard title="Toplam İşlem" value={stats.total} icon={ClipboardCheck} />
          </div>

          {/* Category Cards */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">İşlem Kategorileri</h2>
              {activeCategory && (
                <Button variant="ghost" size="sm" onClick={() => handleSectionChange("dashboard")}>
                  Tümünü Göster
                </Button>
              )}
            </div>
            {groups.length > 0 ? (
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
            ) : (
              <div className="bg-muted/30 rounded-lg p-8 text-center">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {isLoading ? "Yükleniyor..." : "Onay bekleyen işlem bulunmuyor"}
                </p>
                {!isLoading && hasDiaConnection && (
                  <Button onClick={handleSync} variant="outline" className="mt-4" disabled={isSyncing}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Dia'dan Verileri Çek
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {activeCategory
                    ? groups.find((g) => g.type === activeCategory)?.label
                    : "Tüm Onay Bekleyen İşlemler"}
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
          )}
        </div>
      </main>

      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onApprove={(id) => handleApprove([id])}
        onReject={(id) => handleReject([id])}
      />

      <SyncProgress
        isOpen={syncProgress.isOpen}
        steps={syncProgress.steps}
        currentStep={syncProgress.currentStep}
        totalRecords={syncProgress.totalRecords}
        elapsedTime={syncProgress.elapsedTime}
      />
    </div>
  );
}
