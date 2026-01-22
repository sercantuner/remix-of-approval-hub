import { 
  FileText, 
  Users, 
  Building2, 
  Wallet, 
  CreditCard,
  ChevronRight
} from 'lucide-react';
import { TransactionType } from '@/types/transaction';
import { cn, formatCurrency } from '@/lib/utils';

interface CategoryCardProps {
  type: TransactionType;
  label: string;
  count: number;
  totalAmount: number;
  onClick: () => void;
  isActive?: boolean;
}

const icons: Record<TransactionType, React.ElementType> = {
  invoice: FileText,
  current_account: Users,
  bank: Building2,
  cash: Wallet,
  check_note: CreditCard,
};

const colors: Record<TransactionType, string> = {
  invoice: 'bg-blue-500',
  current_account: 'bg-emerald-500',
  bank: 'bg-violet-500',
  cash: 'bg-amber-500',
  check_note: 'bg-rose-500',
};

export function CategoryCard({
  type,
  label,
  count,
  totalAmount,
  onClick,
  isActive,
}: CategoryCardProps) {
  const Icon = icons[type];

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full bg-card rounded-xl p-4 shadow-card text-left transition-all duration-200',
        'hover:shadow-elevated hover:-translate-y-0.5',
        'flex items-center gap-4 group',
        isActive && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <div className={cn(
        'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
        colors[type]
      )}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground truncate">{label}</h3>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {count}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
        <p className={cn(
          'text-sm mt-0.5',
          totalAmount >= 0 ? 'text-success' : 'text-destructive'
        )}>
          {formatCurrency(totalAmount)}
        </p>
      </div>
    </button>
  );
}
