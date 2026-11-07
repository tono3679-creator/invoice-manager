"use client";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { Check, LogOut, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resetDemo, signOut, switchDemoPersona } from "@/lib/actions/session";
import { ROLE_LABEL, type AppRole } from "@/lib/domain/labels";

const PERSONAS: { role: AppRole; name: string }[] = [
  { role: "member", name: "鈴木 健（作成者）" },
  { role: "approver", name: "佐藤 美咲（承認者）" },
  { role: "admin", name: "山田 太郎（管理者）" },
  { role: "viewer", name: "田中 由紀（閲覧のみ）" },
];

export function UserMenu({ displayName, title, role, isDemo }: { displayName: string; title: string | null; role: AppRole; isDemo: boolean }) {
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const initial = displayName.slice(0, 1);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-1.5 sm:px-2" aria-label="ユーザーメニュー">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initial}</span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{displayName}</span>
            <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[role]}{title ? `・${title}` : ""}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div>{displayName}</div>
          <div className="text-xs font-normal text-muted-foreground">{ROLE_LABEL[role]}{title ? `・${title}` : ""}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isDemo && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">別の社員に切り替える</DropdownMenuLabel>
            {PERSONAS.map((p) => (
              <DropdownMenuItem
                key={p.role}
                disabled={pending || p.role === role}
                onSelect={() => startTransition(() => switchDemoPersona(p.role as "admin", pathname))}
              >
                {p.role === role ? <Check /> : <UserRound />}
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => startTransition(async () => {
                toast.loading("デモデータを初期化しています…");
                await resetDemo();
              })}
            >
              <RotateCcw />
              デモデータを初期化
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled={pending} onSelect={() => startTransition(() => signOut())}>
          <LogOut />
          {isDemo ? "デモを終了する" : "ログアウト"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
