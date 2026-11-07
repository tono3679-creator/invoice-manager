"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { LineRow, type EditorValues } from "@/components/documents/document-editor";
import { EMPTY_LINE, type LineValues } from "@/lib/domain/lines";
import { saveRecurring } from "@/lib/actions/recurring";
import { safeAction } from "@/lib/client/safe-action";
import { calcTotals, type RoundingMode, type TaxRate } from "@/lib/domain/tax";
import { formatYen } from "@/lib/format";
import type { recurringSchema } from "@/lib/validation";
import type { z } from "zod";

export type RecurringValues = {
  client_id: string; title: string; interval_months: string; issue_day: string; next_issue_on: string; active: boolean; notes: string;
  lines: LineValues[];
};
type ClientOption = { id: string; code: string; name: string };
type ItemOption = { id: string; code: string; name: string; unit: string; unit_price: number; tax_rate: TaxRate };
const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs";
const num = (v: string) => Number(String(v).replaceAll(",", "")) || 0;

export function RecurringEditor({ id, initial, clients, items, rounding }: {
  id: string | null; initial: RecurringValues; clients: ClientOption[]; items: ItemOption[]; rounding: RoundingMode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const form = useForm<RecurringValues>({ defaultValues: initial });
  const { register, control, handleSubmit, setValue, setError, formState: { errors } } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "lines" });
  const lines = (useWatch({ control, name: "lines" }) ?? []) as LineValues[];
  const totals = calcTotals(lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unit_price), taxRate: Number(l.tax_rate) as TaxRate })), rounding);

  const submit = handleSubmit(async (v) => {
    setBusy(true);
    try {
      const input: z.input<typeof recurringSchema> = {
        ...v,
        interval_months: v.interval_months as unknown as number,
        issue_day: v.issue_day as unknown as number,
        lines: v.lines.map((l) => ({ item_id: l.item_id || null, description: l.description, quantity: l.quantity as unknown as number, unit: l.unit, unit_price: l.unit_price.replaceAll(",", "") as unknown as number, tax_rate: l.tax_rate as unknown as number })),
      };
      const result = await safeAction(() => saveRecurring(id, input));
      if (result.ok) {
        toast.success("定期請求を保存しました");
        router.push("/recurring");
        router.refresh();
      } else {
        for (const [k, msg] of Object.entries(result.fieldErrors ?? {})) setError(k === "lines" ? "lines.root" as never : (k as keyof RecurringValues), { message: msg });
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  });

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
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card>
        <CardHeader><CardTitle className="text-base">内容とスケジュール</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="取引先" htmlFor="client_id" error={errors.client_id?.message} required>
              <select id="client_id" className={selectClass} {...register("client_id")}>
                <option value="">選んでください</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.code}　{c.name}</option>)}
              </select>
            </Field>
            <Field label="件名" htmlFor="title" error={errors.title?.message} required hint="請求書の件名は「件名（2026年11月分）」になります">
              <Input id="title" placeholder="例：Webサイト保守" {...register("title")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="間隔" htmlFor="interval_months">
              <select id="interval_months" className={selectClass} {...register("interval_months")}>
                <option value="1">毎月</option><option value="2">2か月ごと</option><option value="3">3か月ごと</option>
                <option value="6">半年ごと</option><option value="12">毎年</option>
              </select>
            </Field>
            <Field label="発行日" htmlFor="issue_day">
              <select id="issue_day" className={selectClass} {...register("issue_day")}>
                <option value="0">月末</option>
                {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
              </select>
            </Field>
            <Field label="次回の発行日" htmlFor="next_issue_on" error={errors.next_issue_on?.message} required>
              <Input id="next_issue_on" type="date" {...register("next_issue_on")} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("active")} />
              有効にする
            </label>
          </div>
          <p className="text-xs text-muted-foreground">次回の発行日になると、毎朝の自動処理で請求書の下書きが作られます（支払期限は取引先の支払条件から計算）。作られた下書きは、通常どおり承認・発行します。</p>
        </CardContent>
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-base">明細</CardTitle>
          <span className="text-sm tabular">1回あたり <span className="font-semibold">{formatYen(totals.total)}</span>（税込）</span>
        </CardHeader>
        <div className="divide-y">
          {fields.map((f, index) => (
            <LineRow key={f.id} index={index} control={control as unknown as Control<EditorValues>}
              register={register as never} items={items} rounding={rounding} errors={errors.lines?.[index]} count={fields.length}
              onPick={(i) => pickItem(index, i)} onRemove={() => remove(index)} onMove={(to) => move(index, to)} />
          ))}
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" size="sm" disabled={fields.length >= 50} onClick={() => append({ ...EMPTY_LINE })}><Plus aria-hidden />行を追加</Button>
          {errors.lines?.root?.message && <p className="text-xs text-destructive">{errors.lines.root.message}</p>}
        </div>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">備考</CardTitle></CardHeader>
        <CardContent><Textarea rows={2} aria-label="備考" {...register("notes")} /></CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/recurring")}>キャンセル</Button>
        <Button type="submit" variant="brand" disabled={busy}>{busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}保存</Button>
      </div>
    </form>
  );
}
