"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban, Check, Copy, Download, FileOutput, Loader2, MailCheck, Pencil, Send, Trash2, Undo2, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Field } from "@/components/common/form-field";
import {
  approveDocument, convertQuote, deleteDraft, duplicateDocument, issueDocument, markSent, recordPayment, rejectDocument,
  submitDocument, voidDocument, withdrawDocument,
} from "@/lib/actions/documents";
import type { ActionResult } from "@/lib/actions/result";
import { safeAction } from "@/lib/client/safe-action";
import { KIND_LABEL, KIND_PATH, PAYMENT_METHOD_LABEL, can, canIssueWithoutApproval, type AppRole, type DocKind, type DocStatus } from "@/lib/domain/labels";
import { todayJst } from "@/lib/domain/terms";
import { formatYen } from "@/lib/format";

export type ActionDoc = {
  id: string; kind: DocKind; status: DocStatus; version: number; total: number; balance: number; sent: boolean;
  createdBy: string | null; updatedBy: string | null; number: string | null; issueDate: string | null;
};

export function DocumentActions({ doc, role, userId, threshold }: { doc: ActionDoc; role: AppRole; userId: string; threshold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = KIND_LABEL[doc.kind];
  const base = KIND_PATH[doc.kind];
  const editable = can.edit(role);
  const ownDoc = doc.createdBy === userId || doc.updatedBy === userId;

  const run = (fn: () => Promise<ActionResult<unknown>>, success: string, after?: (r: ActionResult<unknown>) => void) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await safeAction(fn);
        if (result.ok) {
          toast.success(success);
          if (after) after(result);
          else router.refresh();
          resolve(true);
        } else {
          toast.error(result.error, result.stale ? { action: { label: "読み込み直す", onClick: () => router.refresh() } } : undefined);
          resolve(false);
        }
      });
    });

  const pdf = (
    <Button asChild variant="outline">
      <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener"><Download aria-hidden />PDF</a>
    </Button>
  );
  const duplicate = editable && (
    <Button variant="ghost" disabled={pending} onClick={() => run(() => duplicateDocument(doc.id), "複製して下書きを作りました", (r) => {
      const id = (r as { data: { id: string } }).data.id;
      router.push(`${base}/${id}/edit`);
    })}>
      <Copy aria-hidden />複製
    </Button>
  );
  const issue = (
    <ConfirmButton
      label="発行する" icon={<FileOutput aria-hidden />} variant="brand" disabled={pending}
      title={`${label}を発行しますか？`}
      description={
        <div className="space-y-1">
          <p>番号を付けて発行します。発行すると内容は変更できません（間違いがあったときは取り消して作り直します）。</p>
          <p>宛先と自社の情報は、この時点の内容で書類に記録されます。</p>
        </div>
      }
      confirmLabel="発行する" confirmVariant="brand"
      onConfirm={() => run(() => issueDocument(doc.id, doc.version), `${label}を発行しました`)}
    />
  );

  if (doc.status === "draft") {
    const direct = canIssueWithoutApproval(role, doc.total, threshold);
    return (
      <div className="flex flex-wrap gap-2">
        {editable && <Button asChild variant="outline"><Link href={`${base}/${doc.id}/edit`}><Pencil aria-hidden />編集</Link></Button>}
        {editable && (
          <ConfirmButton
            label="承認を依頼" icon={<Send aria-hidden />} variant={direct ? "outline" : "brand"} disabled={pending}
            title="承認を依頼しますか？" description="承認者に確認を依頼します。承認待ちのあいだは編集できません（取り下げると編集できます）。"
            confirmLabel="依頼する" confirmVariant="brand" withReason reasonLabel="承認者へのメッセージ" reasonPlaceholder="例：第1期分です。検収書は共有フォルダにあります。"
            onConfirm={(note) => run(() => submitDocument(doc.id, doc.version, note), "承認を依頼しました")}
          />
        )}
        {editable && direct && issue}
        {pdf}
        {duplicate}
        {editable && (
          <ConfirmButton
            label="削除" icon={<Trash2 aria-hidden />} variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}
            title="下書きを削除しますか？" description="この操作は元に戻せません。" confirmLabel="削除する" destructive
            onConfirm={() => run(() => deleteDraft(doc.id), "下書きを削除しました", () => router.push(base))}
          />
        )}
      </div>
    );
  }

  if (doc.status === "pending") {
    const approver = can.approve(role);
    return (
      <div className="flex flex-wrap items-center gap-2">
        {approver && (
          <>
            <ConfirmButton
              label="承認する" icon={<Check aria-hidden />} variant="success" disabled={pending || ownDoc}
              title="承認しますか？" description="承認すると、作成者が発行できるようになります。" confirmLabel="承認する" confirmVariant="success"
              withReason reasonLabel="作成者へのコメント"
              onConfirm={(note) => run(() => approveDocument(doc.id, note), "承認しました")}
            />
            <ConfirmButton
              label="差し戻す" icon={<X aria-hidden />} variant="outline" disabled={pending || ownDoc}
              title="差し戻しますか？" description="下書きに戻り、作成者が修正できるようになります。" confirmLabel="差し戻す" destructive
              withReason reasonRequired reasonLabel="差し戻しの理由" reasonPlaceholder="例：単価が見積書と違います"
              onConfirm={(note) => run(() => rejectDocument(doc.id, note), "差し戻しました")}
            />
          </>
        )}
        {editable && (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => withdrawDocument(doc.id), "承認の依頼を取り下げました")}>
            <Undo2 aria-hidden />依頼を取り下げ
          </Button>
        )}
        {pdf}
        {approver && ownDoc && <p className="w-full text-xs text-muted-foreground">自分で作成・編集した書類は承認できません（ほかの承認者が承認します）。</p>}
        {!approver && <p className="w-full text-xs text-muted-foreground">承認者の確認を待っています。</p>}
      </div>
    );
  }

  if (doc.status === "approved") {
    return (
      <div className="flex flex-wrap gap-2">
        {editable && issue}
        {pdf}
        {duplicate}
      </div>
    );
  }

  // 発行済み・受注・取り消し
  return (
    <div className="flex flex-wrap gap-2">
      {doc.kind === "invoice" && doc.status === "issued" && editable && doc.balance > 0 && (
        <PaymentButton invoiceId={doc.id} balance={doc.balance} issueDate={doc.issueDate} />
      )}
      {doc.kind === "quote" && doc.status === "issued" && editable && (
        <Button variant="brand" disabled={pending} onClick={() => run(() => convertQuote(doc.id), "受注にして、請求書の下書きを作りました", (r) => {
          router.push(`/invoices/${(r as { data: { id: string } }).data.id}`);
        })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileOutput aria-hidden />}
          受注して請求書を作成
        </Button>
      )}
      {pdf}
      {doc.status !== "void" && editable && !doc.sent && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => markSent(doc.id), "送付済みにしました")}>
          <MailCheck aria-hidden />送付済みにする
        </Button>
      )}
      {duplicate}
      {doc.status !== "void" && can.void(role) && (
        <ConfirmButton
          label="取り消し" icon={<Ban aria-hidden />} variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}
          title={`${doc.number} を取り消しますか？`}
          description={doc.kind === "invoice" && doc.balance < doc.total
            ? "入金が記録されている請求書は取り消せません。先に入金の記録を削除してください。"
            : "番号は欠番として残り、書類には「取り消し」と表示されます。この操作は元に戻せません。"}
          confirmLabel="取り消す" destructive withReason reasonRequired reasonLabel="取り消しの理由" reasonPlaceholder="例：金額の誤りのため。正しい請求書を再発行します"
          onConfirm={(reason) => run(() => voidDocument(doc.id, reason), "取り消しました")}
        />
      )}
    </div>
  );
}

export function PaymentButton({ invoiceId, balance, issueDate }: { invoiceId: string; balance: number; issueDate: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(todayJst());
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("bank");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="brand" onClick={() => { setAmount(String(balance)); setPaidOn(todayJst()); setErrors({}); setOpen(true); }}>
        <Wallet aria-hidden />入金を記録
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>入金を記録</DialogTitle>
            <DialogDescription>未入金の残高は {formatYen(balance)} です。分割の入金は、金額を変えて記録します。</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const result = await safeAction(() => recordPayment(invoiceId, {
                  paid_on: paidOn, amount: amount.replaceAll(",", "") as unknown as number, method: method as "bank", note,
                }));
                if (result.ok) {
                  toast.success("入金を記録しました");
                  setOpen(false);
                  router.refresh();
                } else {
                  setErrors(result.fieldErrors ?? {});
                  toast.error(result.error);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="入金日" htmlFor="paid_on" error={errors.paid_on} required>
                <Input id="paid_on" type="date" value={paidOn} min={issueDate ?? undefined} max={todayJst()} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="入金額" htmlFor="amount" error={errors.amount} required>
                <Input id="amount" inputMode="numeric" className="text-right tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            </div>
            <Field label="方法" htmlFor="method">
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs">
                {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="メモ" htmlFor="note" error={errors.note}>
              <Input id="note" value={note} placeholder="例：振込手数料 440円 差し引き" onChange={(e) => setNote(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>キャンセル</Button>
              <Button type="submit" variant="brand" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                記録する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
