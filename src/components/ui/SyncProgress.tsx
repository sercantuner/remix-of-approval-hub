import { cn } from "@/lib/utils";
import { RefreshCw, CheckCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SyncStep {
  id: string;
  label: string;
  status: "pending" | "loading" | "done" | "error";
}

interface SyncProgressProps {
  isOpen: boolean;
  steps: SyncStep[];
  currentStep: number;
  totalRecords?: number;
  elapsedTime?: number;
}

export function SyncProgress({
  isOpen,
  steps,
  currentStep,
  totalRecords,
  elapsedTime,
}: SyncProgressProps) {
  if (!isOpen) return null;

  const progress = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-xl shadow-elevated p-6 w-full max-w-md mx-4 animate-scale-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-primary animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Senkronizasyon</h3>
            <p className="text-sm text-muted-foreground">
              DIA ERP'den veriler çekiliyor...
            </p>
          </div>
        </div>

        <Progress value={progress} className="h-2 mb-4" />

        <div className="space-y-2 mb-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                step.status === "loading" && "bg-primary/5",
                step.status === "done" && "bg-success/5",
                step.status === "error" && "bg-destructive/5"
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                {step.status === "pending" && (
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
                {step.status === "loading" && (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                )}
                {step.status === "done" && (
                  <CheckCircle className="w-4 h-4 text-success" />
                )}
                {step.status === "error" && (
                  <div className="w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    !
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "text-sm",
                  step.status === "pending" && "text-muted-foreground",
                  step.status === "loading" && "text-foreground font-medium",
                  step.status === "done" && "text-success",
                  step.status === "error" && "text-destructive"
                )}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          {elapsedTime !== undefined && (
            <span>Süre: {elapsedTime.toFixed(1)}s</span>
          )}
          {totalRecords !== undefined && totalRecords > 0 && (
            <span>{totalRecords} kayıt senkronize edildi</span>
          )}
        </div>
      </div>
    </div>
  );
}
