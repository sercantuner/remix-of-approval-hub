import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface CurrencyTotal {
  currency: string;
  amount: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'accent';
  onClick?: () => void;
  currencyTotals?: CurrencyTotal[];
}

// Format currency with proper symbol
function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    TRY: '₺',
    TL: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  
  const symbol = symbols[currency] || currency + ' ';
  const formattedAmount = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  
  return `${symbol}${formattedAmount}`;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  onClick,
  currencyTotals,
}: StatCardProps) {
  const variants = {
    default: 'bg-card',
    primary: 'gradient-primary text-primary-foreground',
    accent: 'bg-accent text-accent-foreground',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl p-5 shadow-card transition-all duration-200 animate-fade-in',
        variants[variant],
        onClick && 'cursor-pointer hover:shadow-elevated hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={cn(
            'text-sm font-medium',
            variant === 'default' ? 'text-muted-foreground' : 'opacity-80'
          )}>
            {title}
          </p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className={cn(
              'text-xs mt-1',
              variant === 'default' ? 'text-muted-foreground' : 'opacity-70'
            )}>
              {subtitle}
            </p>
          )}
          {/* Currency totals */}
          {currencyTotals && currencyTotals.length > 0 && (
            <div className={cn(
              'mt-2 space-y-0.5',
              variant === 'default' ? 'text-muted-foreground' : 'opacity-80'
            )}>
              {currencyTotals.map(({ currency, amount }) => (
                <p key={currency} className="text-xs font-medium">
                  {formatCurrency(amount, currency)}
                </p>
              ))}
            </div>
          )}
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground">son 7 gün</span>
            </div>
          )}
        </div>
        <div className={cn(
          'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
          variant === 'default' ? 'bg-primary/10 text-primary' : 'bg-white/10'
        )}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
