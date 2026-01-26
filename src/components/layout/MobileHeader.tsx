import { useState } from "react";
import { Menu, X, Settings, LogOut, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransactionType, TransactionGroup } from "@/types/transaction";
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Wallet,
} from "lucide-react";

interface MobileHeaderProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  user?: { id: string; email: string; full_name?: string } | null;
  onLogout?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
  groups?: TransactionGroup[];
  activeCategory?: TransactionType | null;
  onCategoryChange?: (category: TransactionType | null) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  category?: TransactionType;
}

const menuItems: MenuItem[] = [
  { id: "dashboard", label: "Özet", icon: LayoutDashboard },
  { id: "invoice", label: "Faturalar", icon: FileText, category: "invoice" },
  { id: "current_account", label: "Cari Hareketler", icon: Users, category: "current_account" },
  { id: "bank", label: "Banka Hareketleri", icon: Building2, category: "bank" },
  { id: "cash", label: "Kasa Hareketleri", icon: Wallet, category: "cash" },
];

export function MobileHeader({ 
  activeSection, 
  onSectionChange, 
  user, 
  onLogout,
  onSync,
  isSyncing,
  groups = [],
  activeCategory,
  onCategoryChange,
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false);

  const handleNavigation = (section: string) => {
    onSectionChange(section);
    setOpen(false);
  };

  const handleCategoryClick = (category: TransactionType) => {
    onCategoryChange?.(category);
    setOpen(false);
  };

  // Get count for each category
  const getCategoryCount = (category: TransactionType) => {
    const group = groups.find(g => g.type === category);
    return group?.count || 0;
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 flex items-center justify-between">
      <Logo size="sm" showText className="text-primary" />
      
      <div className="flex items-center gap-1">
        {onSync && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }} 
            disabled={isSyncing}
            className="h-10 w-10"
          >
            <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
          </Button>
        )}
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <Logo size="sm" showText className="text-primary" />
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {/* User Info */}
              {user && (
                <div className="px-4 py-3 bg-muted/30 border-b">
                  <p className="text-sm font-medium truncate">
                    {user.full_name || user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              )}
              
              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto">
                {/* Main Navigation */}
                <div className="p-3 space-y-1">
                  <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Navigasyon
                  </p>
                  <button
                    onClick={() => {
                      handleNavigation("dashboard");
                      onCategoryChange?.(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200",
                      "hover:bg-muted text-foreground/80 hover:text-foreground hover:translate-x-1",
                      "active:scale-[0.98]",
                      activeSection === "dashboard" && !activeCategory && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <LayoutDashboard className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    <span className="text-sm">Tüm İşlemler</span>
                  </button>
                </div>
                
                {/* Transaction Categories */}
                <div className="p-3 pt-0 space-y-1">
                  <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    İşlem Kategorileri
                  </p>
                  {menuItems.filter(item => item.category).map((item, index) => {
                    const count = getCategoryCount(item.category!);
                    const isActive = activeCategory === item.category;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleCategoryClick(item.category!)}
                        style={{ animationDelay: `${index * 50}ms` }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-3 rounded-lg",
                          "transition-all duration-200 ease-out",
                          "hover:bg-muted text-foreground/80 hover:text-foreground",
                          "hover:translate-x-1 active:scale-[0.98]",
                          "animate-fade-in",
                          isActive && "bg-primary/10 text-primary font-medium translate-x-1"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className={cn(
                            "w-5 h-5 flex-shrink-0 transition-all duration-200",
                            isActive && "scale-110"
                          )} />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        {count > 0 && (
                          <Badge 
                            variant={isActive ? "default" : "secondary"} 
                            className={cn(
                              "ml-2 transition-all duration-200",
                              isActive && "bg-primary text-primary-foreground scale-105"
                            )}
                          >
                            {count}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>
              
              {/* Footer */}
              <div className="p-3 border-t space-y-1">
                <button
                  onClick={() => handleNavigation("settings")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                    "hover:bg-muted text-foreground/80 hover:text-foreground",
                    activeSection === "settings" && "bg-muted text-foreground"
                  )}
                >
                  <Settings className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Ayarlar</span>
                </button>
                
                {onLogout && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors hover:bg-destructive/10 text-foreground/80 hover:text-destructive"
                  >
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">Çıkış Yap</span>
                  </button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
