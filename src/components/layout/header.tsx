"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AppRole } from "@/lib/domain/labels";
import { SidebarBody } from "./sidebar";
import { UserMenu } from "./user-menu";

export function Header({
  today, displayName, title, role, companyName, isDemo, pendingCount,
}: {
  today: string; displayName: string; title: string | null; role: AppRole; companyName: string; isDemo: boolean; pendingCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="メニューを開く">
          <Menu />
        </Button>
        <SheetContent side="left" aria-describedby={undefined} className="w-64 p-0">
          <SheetTitle className="sr-only">メインメニュー</SheetTitle>
          <SidebarBody companyName={companyName} pendingCount={pendingCount} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tabular sm:text-base">{today}</div>
        <div className="truncate text-xs text-muted-foreground">{companyName}</div>
      </div>
      <UserMenu displayName={displayName} title={title} role={role} isDemo={isDemo} />
    </header>
  );
}
