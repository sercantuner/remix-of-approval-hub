import { useState } from "react";
import { Menu, X, Settings, LogOut, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/types/transaction";
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
  isSyncing 
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false);

  const handleNavigation = (section: string) => {
    onSectionChange(section);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 flex items-center justify-between md:hidden">
      <Logo size="sm" showText className="text-primary" />
      
      <div className="flex items-center gap-2">
        {onSync && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSync} 
            disabled={isSyncing}
          >
            <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
          </Button>
        )}
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <Logo size="sm" showText className="text-primary" />
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {/* Navigation */}
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                      "hover:bg-muted text-foreground/80 hover:text-foreground",
                      activeSection === item.id && "bg-muted text-foreground font-medium"
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </nav>
              
              {/* Footer */}
              <div className="p-3 border-t space-y-2">
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
                
                {user && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium truncate">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                )}
                
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
