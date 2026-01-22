import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Search } from "lucide-react";

interface ApprovalSliderProps {
  onApprove: () => void;
  onReject: () => void;
  onAnalyze?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function ApprovalSlider({
  onApprove,
  onReject,
  onAnalyze,
  disabled = false,
  size = "md",
}: ApprovalSliderProps) {
  const [position, setPosition] = useState<"left" | "center" | "right">("center");
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (newPosition: "left" | "center" | "right") => {
    if (disabled) return;
    
    setPosition(newPosition);
    
    // Trigger action after animation
    setTimeout(() => {
      if (newPosition === "left") {
        onReject();
      } else if (newPosition === "right") {
        onApprove();
      } else if (newPosition === "center" && onAnalyze) {
        onAnalyze();
      }
      // Reset to center after action
      setTimeout(() => setPosition("center"), 300);
    }, 200);
  };

  const sizeClasses = {
    sm: {
      container: "h-8 w-28",
      thumb: "w-8 h-6",
      icon: "w-3 h-3",
      zone: "w-8",
    },
    md: {
      container: "h-10 w-36",
      thumb: "w-10 h-8",
      icon: "w-4 h-4",
      zone: "w-10",
    },
  };

  const s = sizeClasses[size];

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-full bg-muted/50 border flex items-center justify-between p-1 transition-colors",
        s.container,
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-pointer"
      )}
    >
      {/* Left Zone - Reject */}
      <button
        onClick={() => handleClick("left")}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center rounded-full transition-all z-10",
          s.zone,
          "h-full",
          position === "left" 
            ? "bg-destructive text-destructive-foreground scale-110" 
            : "hover:bg-destructive/20 text-destructive"
        )}
        title="Reddet"
      >
        <X className={s.icon} />
      </button>

      {/* Center Zone - Analyze */}
      <button
        onClick={() => handleClick("center")}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center rounded-full transition-all z-10",
          s.zone,
          "h-full",
          position === "center" 
            ? "bg-primary text-primary-foreground" 
            : "hover:bg-primary/20 text-primary"
        )}
        title="Analiz Et"
      >
        <Search className={s.icon} />
      </button>

      {/* Right Zone - Approve */}
      <button
        onClick={() => handleClick("right")}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center rounded-full transition-all z-10",
          s.zone,
          "h-full",
          position === "right" 
            ? "bg-success text-success-foreground scale-110" 
            : "hover:bg-success/20 text-success"
        )}
        title="Onayla"
      >
        <Check className={s.icon} />
      </button>
    </div>
  );
}
