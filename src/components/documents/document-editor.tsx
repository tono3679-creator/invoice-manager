"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { EMPTY_LINE, type LineValues } from "@/lib/domain/lines";
import { saveDocument, submitDocument } from "@/lib/actions/documents";
import { safeAction } from "@/lib/client/safe-action";
import { KIND_LABEL, KIND_PATH, canIssueWithoutApproval, type AppRole, type DocKind } from "@/lib/domain/labels";
import { calcTotals, lineAmount, ROUNDING_LABEL, TAX_RATES, TAX_RATE_LABEL, type RoundingMode, type TaxRate } from "@/lib/domain/tax";
import { addDays, calcDueDate, termsLabel } from "@/lib/domain/terms";
import { formatDate, formatYen } from "@/lib/format";
import type { DocumentInput } from "@/lib/validation";
import { cn } from "@/lib/utils";

export type EditorValues = {
  client_id: string; title: string; issue_date: string; due_date: string; valid_until: string; notes: string; lines: LineValues[];
};
type ClientOption = { id: string; code: string; name: string; honorific: string; closing_day: number; pay_month_offset: number; pay_day: number };
type ItemOption = { id: string; code: string; name: string; unit: string; unit_price: number; tax_rate: TaxRate };

const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

const num = (v: string) => {
  const n = Number(String(v).replaceAll(",", "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function DocumentEditor({
  kind, docId, version, initial, clients, items, rounding, threshold, role, quoteValidDays,
}: {
  kind: DocKind; docId: string | null; version: number | null; initial: EditorValues; clients: ClientOption[]; items: ItemOption[];
  rounding: RoundingMode; threshold: number; role: AppRole; quoteValidDays: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const form = useForm<EditorValues>({ defaultValues: initial });
  const { register, control, handleSubmit, setValue, setError, formState: { errors } } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control });
  const client = clients.find((c) => c.id === values.client_id);
  const lines = (values.lines ?? []) as LineValues[];
  const totals = calcTotals(lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unit_price), taxRate: Number(l.tax_rate) as TaxRate })), rounding);
  const terms = client ? { closingDay: client.closing_day, payMonthOffset: client.pay_month_offset, payDay: client.pay_day } : null;
  const autoDue = terms && values.issue_date ? calcDueDate(values.issue_date, terms) : null;
  const directIssue = canIssueWithoutApproval(role, totals.total, threshold);

  const toInput = (v: EditorValues): DocumentInput => ({
    client_id: v.client_id,
    title: v.title,
    issue_date: v.issue_date,
    due_date: kind === "invoice" ? v.due_date : "",
    valid_until: kind === "quote" ? v.valid_until : "",
    notes: v.notes,
    lines: v.lines.map((l) => ({
      item_id: l.item_id || null,
      description: l.description,
      quantity: l.quantity.replaceAll(",", "") as unknown as number,
      unit: l.unit,
      unit_price: l.unit_price.replaceAll(",", "") as unknown as number,
      tax_rate: l.tax_rate as unknown as number,
    })),
  });

  const save = (mode: "save" | "submit") => handleSubmit(async (v) => {
    setBusy(mode);
    try {
      const result = await safeAction(() => saveDocument(docId, kind, toInput(v), version));
      if (!result.ok) {
        for (const [k, msg] of Object.entries(result.fieldErrors ?? {})) {
          setError(k === "lines" ? "lines.root" as never : (k as keyof EditorValues), { message: msg });
        }
        toast.error(result.error, result.stale ? { action: { label: "読み込み直す", onClick: () => router.refresh() } } : undefined);
        return;
      }
      const saved = (result as { data: { id: string; version: number } }).data;
      if (mode === "submit") {
        const sub = await safeAction(() => submitDocument(saved.id, saved.version));
        if (!sub.ok) {
          toast.error(`下書きは保存しました。承認の依頼はできませんでした：${sub.error}`);
          router.push(`${KIND_PATH[kind]}/${saved.id}`);
          return;
        }
        toast.success("保存して、承認を依頼しました");
      } else {
        toast.success("下書きを保存しました");
      }
      router.push(`${KIND_PATH[kind]}/${saved.id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  })();

  const pickItem = (index: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    setValue(`lines.${index}.item_id`, itemId);
    if (!it) return;
    setValue(`lines.${index}.description`, it.name);
    setValue(`lines.${index}.unit`, it.unit);
    setValue(`lines.${index}.unit_price`, String(it.unit_price));
    setValue(`lines.${index}.tax_rate`, String(it.tax_rate));
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save("save"); }} className="grid gap-5 xl:grid-cols-[1fr_20rem]" noValidate>
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">宛先と件名</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="取引先" htmlFor="client_id" error={errors.client_id?.message} required
                hint={terms ? `支払条件：${termsLabel(terms)}` : undefined}>
                <select id="client_id" className={selectClass} aria-invalid={!!errors.client_id} {...register("client_id")}>
                  <option value="">選んでください</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.code}　{c.name}</option>)}
                </select>
              </Field>
              <Field label="件名" htmlFor="title" error={errors.title?.message} required>
                <Input id="title" placeholder="例：コーポレートサイト リニューアル" aria-invalid={!!errors.title} {...register("title")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="発行日" htmlFor="issue_date" error={errors.issue_date?.message} hint="空欄なら発行した日になります">
                <Input id="issue_date" type="date" {...register("issue_date")} />
              </Field>
              {kind === "invoice" ? (
                <Field label="支払期限" htmlFor="due_date" error={errors.due_date?.message}
                  hint={autoDue ? `空欄なら支払条件から自動：${formatDate(autoDue)}` : "空欄なら取引先の支払条件から自動で計算します"}>
                  <Input id="due_date" type="date" aria-invalid={!!errors.due_date} {...register("due_date")} />
                </Field>
              ) : (
                <Field label="有効期限" htmlFor="valid_until" error={errors.valid_until?.message}
                  hint={values.issue_date ? `空欄なら ${formatDate(addDays(values.issue_date, quoteValidDays))}（発行日から${quoteValidDays}日）` : `空欄なら発行日から${quoteValidDays}日`}>
                  <Input id="valid_until" type="date" {...register("valid_until")} />
                </Field>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="flex-row items-center justify-between border-b py-4">
            <CardTitle className="text-base">明細</CardTitle>
            <span className="text-xs text-muted-foreground">単価は税抜・端数は{ROUNDING_LABEL[rounding]}</span>
          </CardHeader>
          <div className="divide-y">
            {fields.map((field, index) => (
              <LineRow
                key={field.id}
                index={index}
                control={control}
                register={register}
                items={items}
                rounding={rounding}
                errors={errors.lines?.[index]}
                count={fields.length}
                onPick={(id) => pickItem(index, id)}
                onRemove={() => remove(index)}
                onMove={(to) => move(index, to)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" size="sm" disabled={fields.length >= 100} onClick={() => append({ ...EMPTY_LINE })}>
              <Plus aria-hidden />行を追加
            </Button>
            {errors.lines?.root?.message && <p className="text-xs text-destructive" role="alert">{errors.lines.root.message}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">備考</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={3} aria-label="備考" {...register("notes")} />
            {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes.message}</p>}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader><CardTitle className="text-base">合計</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm tabular">
              <dt className="text-muted-foreground">小計（税抜）</dt><dd className="text-right">{formatYen(totals.subtotal)}</dd>
              {totals.taxable10 !== 0 && <><dt className="text-muted-foreground">10%対象 {formatYen(totals.taxable10)}</dt><dd className="text-right">消費税 {formatYen(totals.tax10)}</dd></>}
              {totals.taxable8 !== 0 && <><dt className="text-muted-foreground">8%対象※ {formatYen(totals.taxable8)}</dt><dd className="text-right">消費税 {formatYen(totals.tax8)}</dd></>}
              {totals.taxable0 !== 0 && <><dt className="text-muted-foreground">対象外</dt><dd className="text-right">{formatYen(totals.taxable0)}</dd></>}
              <dt className="border-t pt-2 font-semibold">合計（税込）</dt>
              <dd className="border-t pt-2 text-right text-xl font-bold">{formatYen(totals.total)}</dd>
            </dl>
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              消費税は税率ごとの合計に対して1回だけ端数処理します（インボイス制度）。保存すると DB で同じ計算をし直します。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <Button type="button" variant="brand" disabled={busy !== null} onClick={() => save("submit")}>
              {busy === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              保存して承認を依頼
            </Button>
            <Button type="submit" variant="outline" disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              下書き保存
            </Button>
            <p className={cn("text-keep text-xs", directIssue ? "text-success-strong" : "text-muted-foreground")}>
              {directIssue
                ? `合計が${formatYen(threshold)}未満のため、あなたは承認なしで発行できます（下書き保存のあと、書類の画面で「発行」）。`
                : role === "member"
                  ? "作成者の書類は、承認者の承認を受けてから発行します。"
                  : `合計が${formatYen(threshold)}以上のため、ほかの承認者の承認が必要です。`}
            </p>
          </CardContent>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">{KIND_LABEL[kind]}の番号は発行したときに自動で付きます（下書きには付かないので欠番が出ません）。</p>
      </aside>
    </form>
  );
}

export function LineRow({
  index, control, register, items, rounding, errors, count, onPick, onRemove, onMove,
}: {
  index: number; control: Control<EditorValues>; register: ReturnType<typeof useForm<EditorValues>>["register"];
  items: ItemOption[]; rounding: RoundingMode; errors?: Partial<Record<keyof LineValues, { message?: string }>>; count: number;
  onPick: (id: string) => void; onRemove: () => void; onMove: (to: number) => void;
}) {
  const line = useWatch({ control, name: `lines.${index}` }) as LineValues;
  const amount = lineAmount({ quantity: num(line?.quantity ?? "0"), unitPrice: num(line?.unit_price ?? "0"), taxRate: 10 }, rounding);
  const err = errors && Object.values(errors).find((e) => e?.message)?.message;
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="w-5 shrink-0 pt-2 text-xs text-muted-foreground tabular">{index + 1}</div>
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <select
            className={cn(selectClass, "text-muted-foreground")}
            aria-label={`${index + 1}行目の品目`}
            value={line?.item_id ?? ""}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="">品目から選ぶ（任意）</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.code}　{i.name}</option>)}
          </select>
          <Input aria-label={`${index + 1}行目の品名`} placeholder="品名" aria-invalid={!!errors?.description} {...register(`lines.${index}.description`)} />
        </div>
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[5.5rem_4.5rem_8rem_8.5rem_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-xs text-muted-foreground">
            数量
            <Input aria-label={`${index + 1}行目の数量`} inputMode="decimal" className="text-right tabular" aria-invalid={!!errors?.quantity} {...register(`lines.${index}.quantity`)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            単位
            <Input aria-label={`${index + 1}行目の単位`} {...register(`lines.${index}.unit`)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            単価（税抜）
            <Input aria-label={`${index + 1}行目の単価`} inputMode="numeric" className="text-right tabular" placeholder="0" aria-invalid={!!errors?.unit_price} {...register(`lines.${index}.unit_price`)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            税率
            <select aria-label={`${index + 1}行目の税率`} className={selectClass} {...register(`lines.${index}.tax_rate`)}>
              {TAX_RATES.map((r) => <option key={r} value={r}>{TAX_RATE_LABEL[r]}</option>)}
            </select>
          </label>
          <div className="grid gap-1 text-right text-xs text-muted-foreground">
            金額
            <span className={cn("block h-9 text-base leading-9 font-medium text-foreground tabular", amount < 0 && "text-danger-strong")} aria-label={`${index + 1}行目の金額`}>{formatYen(amount)}</span>
          </div>
          <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
            <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`${index + 1}行目を上へ`}><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`${index + 1}行目を下へ`}><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={count <= 1} onClick={onRemove} aria-label={`${index + 1}行目を削除`} className="text-destructive hover:text-destructive"><Trash2 /></Button>
          </div>
        </div>
        {err && <p className="text-xs text-destructive" role="alert">{err}</p>}
      </div>
    </div>
  );
}
