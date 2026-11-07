"use client";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { switchDemoPersona } from "@/lib/actions/session";
import { ROLE_LABEL, type AppRole } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const ORDER: AppRole[] = ["member", "approver", "admin", "viewer"];

/** デモ環境であることを常に表示し、社員（役割）をワンタップで切り替えられるようにする */
export function DemoBanner({ role }: { role: AppRole }) {
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-warning-soft px-4 py-2 text-xs text-warning-strong sm:px-6" role="note">
      <span className="flex items-center gap-1.5 font-semibold">
        <FlaskConical className="size-3.5" aria-hidden />
        デモ環境
      </span>
      <span className="text-keep hidden md:inline">会社・人物・取引先はすべて架空です。データはあなた専用で、24時間後に自動で削除されます。</span>
      <div className="ml-auto flex items-center gap-1" role="group" aria-label="体験する役割">
        <span className="mr-1 hidden sm:inline">役割を切り替え：</span>
        {ORDER.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending || r === role}
            aria-pressed={r === role}
            onClick={() => startTransition(() => switchDemoPersona(r as "admin", pathname))}
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-medium transition-colors disabled:cursor-default",
              r === role ? "border-warning-strong bg-warning-strong text-white" : "border-warning/40 bg-card text-foreground hover:bg-accent disabled:opacity-50",
            )}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );
}
