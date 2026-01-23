import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

export function Logo({ size = 'md', className, showText = true }: LogoProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn(
        'gradient-primary rounded-xl flex items-center justify-center shadow-card',
        sizes[size]
      )}>
        <span className="text-primary-foreground font-bold text-lg">S</span>
      </div>
      {showText && (
        <span 
          className={cn(
            'tracking-tight text-white',
            textSizes[size]
          )}
          style={{ fontFamily: "'Dancing Script', cursive" }}
        >
          Sümen
        </span>
      )}
    </div>
  );
}
