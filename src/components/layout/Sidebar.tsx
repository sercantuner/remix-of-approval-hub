import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Building2, 
  Wallet, 
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Özet', icon: LayoutDashboard },
  { id: 'invoices', label: 'Faturalar', icon: FileText },
  { id: 'current', label: 'Cari Hareketler', icon: Users },
  { id: 'bank', label: 'Banka Hareketleri', icon: Building2 },
  { id: 'cash', label: 'Kasa Hareketleri', icon: Wallet },
  { id: 'checks', label: 'Çek/Senet', icon: CreditCard },
];

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn(
      'h-screen gradient-primary flex flex-col transition-all duration-300',
      collapsed ? 'w-20' : 'w-64'
    )}>
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
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
              'hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground',
              activeSection === item.id && 'bg-sidebar-accent text-sidebar-foreground font-medium'
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-sidebar-border/30">
        <button
          onClick={() => onSectionChange('settings')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
            'hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground',
            activeSection === 'settings' && 'bg-sidebar-accent text-sidebar-foreground'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Ayarlar</span>}
        </button>

        {/* User Info */}
        {!collapsed && user && (
          <div className="mt-3 p-3 bg-sidebar-accent/50 rounded-lg">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.name}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user.email}
            </p>
          </div>
        )}

        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-2',
            'hover:bg-destructive/20 text-sidebar-foreground/80 hover:text-destructive'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
}
