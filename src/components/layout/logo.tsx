import { ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, inverted = false, tagline = true }: { className?: string; inverted?: boolean; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("flex size-8 items-center justify-center rounded-lg", inverted ? "bg-brand text-white" : "bg-primary text-primary-foreground")}>
        <ReceiptText className="size-4.5" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className={cn("text-[15px] font-bold tracking-tight", inverted ? "text-white" : "text-foreground")}>Invoice Manager</div>
        {tagline && (
          <div className={cn("text-[10px]", inverted ? "text-sidebar-muted" : "text-muted-foreground")}>見積・請求・入金を、チームでひとつに。</div>
        )}
      </div>
    </div>
  );
}
