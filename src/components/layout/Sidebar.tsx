import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Wallet,
  CreditCard,
  ShoppingCart,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { TransactionType } from "@/types/transaction";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  user?: { id: string; email: string; full_name?: string } | null;
  onLogout?: () => void;
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
  { id: "order", label: "Siparişler", icon: ShoppingCart, category: "order" },
  { id: "current_account", label: "Cari Hareketler", icon: Users, category: "current_account" },
  { id: "bank", label: "Banka Hareketleri", icon: Building2, category: "bank" },
  { id: "cash", label: "Kasa Hareketleri", icon: Wallet, category: "cash" },
  { id: "check_note", label: "Çek/Senet", icon: CreditCard, category: "check_note" },
];

export function Sidebar({ activeSection, onSectionChange, user, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "min-h-screen gradient-primary flex flex-col transition-all duration-300 flex-shrink-0",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border/30">
        <Logo size="md" showText={!collapsed} className="text-white" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
              "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground",
              activeSection === item.id && "bg-sidebar-accent text-sidebar-foreground font-medium"
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* User Section - pushed to bottom */}
      <div className="mt-auto p-3 border-t border-sidebar-border/30">
        <button
          onClick={() => onSectionChange("settings")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
            "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground",
            activeSection === "settings" && "bg-sidebar-accent text-sidebar-foreground"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Ayarlar</span>}
        </button>

        {/* User Info */}
        {!collapsed && user && (
          <div className="mt-3 p-3 bg-sidebar-accent/50 rounded-lg">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.full_name || user.email}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-2",
              "hover:bg-destructive/20 text-sidebar-foreground/80 hover:text-destructive"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm">Çıkış Yap</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
