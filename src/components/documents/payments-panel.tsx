"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/common/confirm-button";
import { deletePayment, issueReceipt } from "@/lib/actions/documents";
import { safeAction } from "@/lib/client/safe-action";
import type { PaymentRow } from "@/lib/data/documents";
import { PAYMENT_METHOD_LABEL, can, type AppRole } from "@/lib/domain/labels";
import { formatDate, formatYen } from "@/lib/format";

export function PaymentsList({ payments, role }: { payments: PaymentRow[]; role: AppRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (payments.length === 0) return <p className="text-sm text-muted-foreground">入金の記録はまだありません。</p>;
  return (
    <ul className="divide-y">
      {payments.map((p) => (
        <li key={p.id} className="grid gap-2 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="font-medium tabular">{formatYen(p.amount)}</div>
            <div className="text-xs text-muted-foreground tabular">
              {formatDate(p.paid_on)}・{PAYMENT_METHOD_LABEL[p.method]}{p.created_by_name ? `・記録 ${p.created_by_name}` : ""}
            </div>
            {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
          </div>
          <div className="flex items-center justify-between gap-1">
            {p.receipt_number ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noopener"><Download aria-hidden />領収書 {p.receipt_number}</a>
              </Button>
            ) : can.edit(role) && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => {
                const r = await safeAction(() => issueReceipt(p.id));
                if (r.ok) {
                  toast.success(`領収書 ${(r as { data: { number: string } }).data.number} を発行しました`);
                  router.refresh();
                  window.open(`/api/payments/${p.id}/receipt`, "_blank", "noopener");
                } else toast.error(r.error);
              })}>
                <Receipt aria-hidden />領収書を発行
              </Button>
            )}
            {can.deletePayment(role) && (
              <ConfirmButton
                label="" ariaLabel="入金の記録を削除" icon={<Trash2 aria-hidden />} variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                title="入金の記録を削除しますか？"
                description={p.receipt_number ? `発行済みの領収書 ${p.receipt_number} は無効になります（番号は欠番になります）。` : "誤って記録したときに使います。"}
                confirmLabel="削除する" destructive
                onConfirm={async () => {
                  const r = await safeAction(() => deletePayment(p.id));
                  if (r.ok) { toast.success("入金の記録を削除しました"); router.refresh(); return true; }
                  toast.error(r.error);
                  return false;
                }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
