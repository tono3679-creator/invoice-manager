"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/common/confirm-button";
import { deleteRecurring, runRecurringNow, setRecurringActive } from "@/lib/actions/recurring";
import { safeAction } from "@/lib/client/safe-action";

export function RunNowButton({ due }: { due: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      const r = await safeAction(() => runRecurringNow());
      if (r.ok) {
        const n = (r as { data: { count: number } }).data.count;
        toast.success(n > 0 ? `請求書の下書きを ${n} 件作りました` : "発行日を迎えた定期請求はありません");
        router.refresh();
      } else toast.error(r.error);
    })}>
      <Zap aria-hidden />今すぐ作成{due > 0 ? `（${due}件）` : ""}
    </Button>
  );
}

export function RecurringRowActions({ id, title, active, canDelete }: { id: string; title: string; active: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => {
        const r = await safeAction(() => setRecurringActive(id, !active));
        if (r.ok) { toast.success(active ? `${title} を停止しました` : `${title} を再開しました`); router.refresh(); } else toast.error(r.error);
      })}>
        {active ? <Pause aria-hidden /> : <Play aria-hidden />}{active ? "停止" : "再開"}
      </Button>
      {canDelete && (
        <ConfirmButton label="" ariaLabel={`${title} を削除`} icon={<Trash2 aria-hidden />} variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
          title={`${title} を削除しますか？`} description="作成済みの請求書は残ります。" confirmLabel="削除する" destructive
          onConfirm={async () => {
            const r = await safeAction(() => deleteRecurring(id));
            if (r.ok) { toast.success("削除しました"); router.refresh(); return true; }
            toast.error(r.error);
            return false;
          }} />
      )}
    </div>
  );
}
