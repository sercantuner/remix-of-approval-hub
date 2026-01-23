import { useState, useEffect, useMemo, useCallback } from "react";
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
  Server,
  Mail,
  Bell,
  Eye,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { TransactionTable } from "@/components/dashboard/TransactionTable";
import { TransactionDetailModal } from "@/components/dashboard/TransactionDetailModal";
import { DiaConnectionForm } from "@/components/settings/DiaConnectionForm";
import { MailSettingsForm } from "@/components/settings/MailSettingsForm";
import { NotificationSettingsForm } from "@/components/settings/NotificationSettingsForm";
import { RejectReasonDialog } from "@/components/dashboard/RejectReasonDialog";
import { SyncProgress } from "@/components/ui/SyncProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useApprovalQueue } from "@/hooks/useApprovalQueue";
import { supabase } from "@/integrations/supabase/client";
import { diaSync } from "@/lib/diaApi";
import type { Transaction, TransactionType, TransactionGroup, TransactionStatus, QueueStatus } from "@/types/transaction";

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

// Group current_account transactions by _key_scf_carihesap_fisi
function groupCurrentAccountTransactions(transactions: Transaction[]): Transaction[] {
  const result: Transaction[] = [];
  const currentAccountMap = new Map<string, Transaction[]>();

  for (const t of transactions) {
    if (t.type === "current_account" && t.groupKey) {
      const existing = currentAccountMap.get(t.groupKey) || [];
      existing.push(t);
      currentAccountMap.set(t.groupKey, existing);
    } else {
      result.push(t);
    }
  }

  // Create grouped transactions
  for (const [groupKey, items] of currentAccountMap.entries()) {
    if (items.length === 1) {
      // Single item - no need to group
      result.push(items[0]);
    } else {
      // Multiple items - create a parent transaction
      const firstItem = items[0];
      const totalAmount = items.reduce((sum, t) => sum + t.amount, 0);
      
      // Use the first item's info as the parent
      const grouped: Transaction = {
        id: `group-${groupKey}`,
        type: "current_account",
        description: firstItem.description,
        amount: totalAmount,
        currency: firstItem.currency,
        exchangeRate: firstItem.exchangeRate,
        date: firstItem.date,
        documentNo: firstItem.documentNo,
        counterparty: firstItem.counterparty,
        status: firstItem.status,
        diaRecordId: firstItem.diaRecordId,
        details: firstItem.details,
        groupKey,
        childTransactions: items,
        sourceTransactionIds: items.map(t => t.id),
        movementCount: items.length,
      };
      result.push(grouped);
    }
  }

  return result;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [activeCategory, setActiveCategory] = useState<TransactionType | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "analyzing" | null>(null);
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
  const [rejectDialogState, setRejectDialogState] = useState<{
    isOpen: boolean;
    transactionIds: string[];
  }>({ isOpen: false, transactionIds: [] });

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
    
    // Get current user's firma_kodu from profile
    const { data: { session } } = await supabase.auth.getSession();
    let currentFirmaKodu: number | null = null;
    
    if (session) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("dia_firma_kodu")
        .eq("id", session.user.id)
        .maybeSingle();
      
      currentFirmaKodu = profileData?.dia_firma_kodu || null;
    }
    
    // Build query - filter by firma_kodu if available
    let query = supabase
      .from("pending_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });
    
    // Only show transactions for the current firma_kodu
    if (currentFirmaKodu !== null) {
      query = query.eq("dia_firma_kodu", currentFirmaKodu);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading transactions:", error);
    } else if (data) {
      const mapped: Transaction[] = data.map(t => {
        const rawData = t.dia_raw_data as Record<string, unknown> | null;
        const type = t.transaction_type as TransactionType;
        const status = (t.status as Transaction["status"]) || "pending";

        // Extract group key for current_account transactions
        const groupKey = type === "current_account" && rawData?._key_scf_carihesap_fisi
          ? String(rawData._key_scf_carihesap_fisi)
          : undefined;

        return {
          id: t.id,
          type,
          description: t.description || "",
          amount: Number(t.amount),
          currency: t.currency || "TRY",
          exchangeRate: rawData?.dovizkuru ? parseFloat(String(rawData.dovizkuru)) : 1,
          date: t.transaction_date,
          documentNo: t.document_no,
          counterparty: t.counterparty || "",
          status,
          diaRecordId: t.dia_record_id,
          attachmentUrl: t.attachment_url,
          details: rawData || undefined,
          groupKey,
        };
      });

      // Group current_account transactions by groupKey
      const groupedTransactions = groupCurrentAccountTransactions(mapped);

      setTransactions(groupedTransactions);
    }

    setIsLoading(false);
  };


  // Optimistic UI handlers for the queue
  const handleOptimisticUpdate = useCallback((
    transactionId: string, 
    newStatus: TransactionStatus, 
    queueStatus: QueueStatus
  ) => {
    setTransactions(prev => prev.map(t => 
      t.id === transactionId 
        ? { 
            ...t, 
            _originalStatus: t._originalStatus || t.status,
            status: newStatus,
            _processing: true,
            _queueStatus: queueStatus,
          } 
        : t
    ));
  }, []);

  const handleRollback = useCallback((transactionId: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === transactionId 
        ? { 
            ...t, 
            status: t._originalStatus || t.status,
            _processing: false,
            _queueStatus: 'failed',
            _originalStatus: undefined,
          } 
        : t
    ));
  }, []);

  const handleQueueSuccess = useCallback((transactionId: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === transactionId 
        ? { 
            ...t, 
            _processing: false,
            _queueStatus: 'success',
            _originalStatus: undefined,
          } 
        : t
    ));
  }, []);

  const handlePartialSuccess = useCallback((transactionId: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === transactionId 
        ? { 
            ...t, 
            _processing: false,
            _queueStatus: 'partial',
            _originalStatus: undefined,
          } 
        : t
    ));
  }, []);

  // Initialize approval queue - must be called before any conditional returns
  const approvalQueue = useApprovalQueue({
    onOptimisticUpdate: handleOptimisticUpdate,
    onRollback: handleRollback,
    onSuccess: handleQueueSuccess,
    onPartialSuccess: handlePartialSuccess,
  });

  // All useMemo hooks must come after useApprovalQueue to maintain consistent hook order

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
    let filtered = transactions;

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter((t) => t.status === statusFilter);
    } else {
      // Default: show pending and analyzing
      filtered = filtered.filter((t) => t.status === "pending" || t.status === "analyzing");
    }

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
  }, [transactions, statusFilter, activeCategory, searchQuery]);

  // Helper to calculate currency totals
  const calculateCurrencyTotals = useCallback((transactionList: Transaction[]) => {
    const currencyMap = new Map<string, number>();
    
    for (const t of transactionList) {
      const currency = t.currency || 'TRY';
      const current = currencyMap.get(currency) || 0;
      currencyMap.set(currency, current + t.amount);
    }
    
    // Sort: TRY first, then alphabetically
    return Array.from(currencyMap.entries())
      .sort(([a], [b]) => {
        if (a === 'TRY') return -1;
        if (b === 'TRY') return 1;
        return a.localeCompare(b);
      })
      .map(([currency, amount]) => ({ currency, amount }));
  }, []);

  const stats = useMemo(() => {
    const approvedTx = transactions.filter((t) => t.status === "approved");
    const rejectedTx = transactions.filter((t) => t.status === "rejected");
    const analyzingTx = transactions.filter((t) => t.status === "analyzing");
    
    const approved = approvedTx.length;
    const rejected = rejectedTx.length;
    const analyzing = analyzingTx.length;
    const pending = pendingTransactions.length;
    const total = transactions.length;

    // Calculate currency totals for each status
    const pendingTotals = calculateCurrencyTotals(pendingTransactions);
    const analyzingTotals = calculateCurrencyTotals(analyzingTx);
    const approvedTotals = calculateCurrencyTotals(approvedTx);
    const rejectedTotals = calculateCurrencyTotals(rejectedTx);
    const allTotals = calculateCurrencyTotals(transactions);

    return { 
      approved, rejected, analyzing, pending, total,
      pendingTotals, analyzingTotals, approvedTotals, rejectedTotals, allTotals
    };
  }, [transactions, pendingTransactions, calculateCurrencyTotals]);

  // Optimistic approve - no waiting
  const handleApprove = (ids: string[]) => {
    approvalQueue.enqueueBatch(ids, 'approve');
    setSelectedIds([]);
    setSelectedTransaction(null);
    
    if (ids.length > 1) {
      toast({
        title: "İşlemler Kuyruğa Eklendi",
        description: `${ids.length} işlem onay kuyruğuna eklendi.`,
      });
    }
  };

  // Optimistic analyze - move back to pending
  const handleAnalyze = (ids: string[]) => {
    approvalQueue.enqueueBatch(ids, 'analyze');
    setSelectedIds([]);
    setSelectedTransaction(null);
  };

  // Opens reject reason dialog
  const handleRejectClick = (ids: string[]) => {
    setRejectDialogState({ isOpen: true, transactionIds: ids });
  };

  // Optimistic reject with reason
  const handleRejectConfirm = (reason: string) => {
    const ids = rejectDialogState.transactionIds;
    approvalQueue.enqueueBatch(ids, 'reject', reason);
    setSelectedIds([]);
    setSelectedTransaction(null);
    setRejectDialogState({ isOpen: false, transactionIds: [] });
    
    if (ids.length > 1) {
      toast({
        title: "İşlemler Kuyruğa Eklendi",
        description: `${ids.length} işlem reddetme kuyruğuna eklendi.`,
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
            <p className="text-muted-foreground">DIA ERP, mail ve bildirim ayarlarınızı yönetin.</p>
          </header>
          
          <Tabs defaultValue="dia" className="space-y-6">
            <TabsList className="grid w-full max-w-xl grid-cols-3">
              <TabsTrigger value="dia" className="gap-2">
                <Server className="w-4 h-4" />
                DIA Bağlantısı
              </TabsTrigger>
              <TabsTrigger value="mail" className="gap-2">
                <Mail className="w-4 h-4" />
                Mail Ayarları
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="w-4 h-4" />
                Bildirimler
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dia">
              <DiaConnectionForm
                onSuccess={handleDiaConnectionSuccess}
                existingConnection={{
                  sunucuAdi: profile?.dia_sunucu_adi,
                  firmaKodu: profile?.dia_firma_kodu,
                  donemKodu: profile?.dia_donem_kodu,
                  ustIslemApproveKey: profile?.dia_ust_islem_approve_key,
                  ustIslemRejectKey: profile?.dia_ust_islem_reject_key,
                  ustIslemAnalyzeKey: profile?.dia_ust_islem_analyze_key,
                }}
              />
            </TabsContent>

            <TabsContent value="mail">
              <div className="max-w-xl">
                <MailSettingsForm />
              </div>
            </TabsContent>

            <TabsContent value="notifications">
              <div className="max-w-xl">
                <NotificationSettingsForm />
              </div>
            </TabsContent>
          </Tabs>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard 
              title="Bekleyen İşlemler" 
              value={stats.pending} 
              icon={Clock} 
              variant={statusFilter === null ? "primary" : "default"}
              onClick={() => setStatusFilter(null)}
            />
            <StatCard 
              title="İnceleniyor" 
              value={stats.analyzing} 
              icon={Eye}
              variant={statusFilter === "analyzing" ? "primary" : "default"}
              onClick={() => setStatusFilter(statusFilter === "analyzing" ? null : "analyzing")}
            />
            <StatCard
              title="Onaylanan"
              value={stats.approved}
              icon={CheckCircle}
              variant={statusFilter === "approved" ? "primary" : "default"}
              onClick={() => setStatusFilter(statusFilter === "approved" ? null : "approved")}
            />
            <StatCard 
              title="Reddedilen" 
              value={stats.rejected} 
              icon={XCircle}
              variant={statusFilter === "rejected" ? "primary" : "default"}
              onClick={() => setStatusFilter(statusFilter === "rejected" ? null : "rejected")}
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
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {statusFilter === "approved" ? "Onaylanan İşlemler" :
                 statusFilter === "rejected" ? "Reddedilen İşlemler" :
                 statusFilter === "analyzing" ? "İncelenen İşlemler" :
                 activeCategory
                  ? groups.find((g) => g.type === activeCategory)?.label
                  : "Onay Bekleyen İşlemler"}
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

            {filteredTransactions.length > 0 ? (
              <TransactionTable
                transactions={filteredTransactions}
                onApprove={handleApprove}
                onReject={handleRejectClick}
                onAnalyze={handleAnalyze}
                onViewDetails={() => {}} // Accordion handles details now
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            ) : (
              <div className="bg-card rounded-xl shadow-card p-12 text-center">
                <Search className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? `"${searchQuery}" için sonuç bulunamadı` 
                    : "Görüntülenecek işlem bulunmuyor"}
                </p>
                {searchQuery && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => setSearchQuery("")}
                  >
                    Aramayı Temizle
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <RejectReasonDialog
        open={rejectDialogState.isOpen}
        onClose={() => setRejectDialogState({ isOpen: false, transactionIds: [] })}
        onConfirm={handleRejectConfirm}
        transactionCount={rejectDialogState.transactionIds.length}
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
