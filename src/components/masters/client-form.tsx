"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Building2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { saveClient } from "@/lib/actions/masters";
import { safeAction } from "@/lib/client/safe-action";
import { calcDueDate, termsLabel, todayJst } from "@/lib/domain/terms";
import { formatDate } from "@/lib/format";
import type { ClientInput } from "@/lib/validation";

export type ClientFormValues = {
  code: string; name: string; honorific: "御中" | "様"; department: string; contact_name: string; email: string; phone: string;
  postal_code: string; address: string; closing_day: string; pay_month_offset: string; pay_day: string; notes: string;
};

export const EMPTY_CLIENT: ClientFormValues = {
  code: "", name: "", honorific: "御中", department: "", contact_name: "", email: "", phone: "", postal_code: "", address: "",
  closing_day: "0", pay_month_offset: "1", pay_day: "0", notes: "",
};

const DAY_OPTIONS = [{ v: "0", l: "末日" }, ...Array.from({ length: 28 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}日` }))];
const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function ClientFormButton({ initial, id, nextCode }: { initial?: ClientFormValues; id?: string; nextCode?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults = initial ?? { ...EMPTY_CLIENT, code: nextCode ?? "" };
  const form = useForm<ClientFormValues>({ defaultValues: defaults });
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = form;
  const [closing, offset, payDay] = useWatch({ control, name: ["closing_day", "pay_month_offset", "pay_day"] });
  const terms = { closingDay: Number(closing), payMonthOffset: Number(offset), payDay: Number(payDay) };
  const today = todayJst();

  const onOpenChange = (next: boolean) => {
    if (next) form.reset(defaults);
    setOpen(next);
  };

  const submit = handleSubmit(async (values) => {
    const result = await safeAction(() => saveClient(id ?? null, values as unknown as ClientInput));
    if (result.ok) {
      toast.success(id ? `${values.name} を更新しました` : `${values.name} を登録しました`);
      setOpen(false);
      if (!id && "data" in result && result.data) router.push(`/clients/${result.data.id}`);
      else router.refresh();
    } else {
      for (const [k, msg] of Object.entries(result.fieldErrors ?? {})) setError(k as keyof ClientFormValues, { message: msg });
      toast.error(result.error);
    }
  });

  return (
    <>
      {id ? (
        <Button variant="outline" onClick={() => onOpenChange(true)}><Pencil aria-hidden />編集</Button>
      ) : (
        <Button onClick={() => onOpenChange(true)}><Building2 aria-hidden />取引先を登録</Button>
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{id ? "取引先を編集" : "取引先を登録"}</DialogTitle>
            <DialogDescription>宛名と支払条件は、請求書の宛先と支払期限に使われます。発行済みの書類は変わりません。</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr_6rem]">
              <Field label="コード" htmlFor="code" error={errors.code?.message} required>
                <Input id="code" placeholder="C-017" aria-invalid={!!errors.code} {...register("code")} />
              </Field>
              <Field label="取引先名" htmlFor="name" error={errors.name?.message} required>
                <Input id="name" placeholder="例：株式会社あおば食品" aria-invalid={!!errors.name} {...register("name")} />
              </Field>
              <Field label="敬称" htmlFor="honorific">
                <select id="honorific" className={selectClass} {...register("honorific")}>
                  <option value="御中">御中</option>
                  <option value="様">様</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="部署" htmlFor="department" error={errors.department?.message}>
                <Input id="department" placeholder="例：経理部" {...register("department")} />
              </Field>
              <Field label="担当者" htmlFor="contact_name" error={errors.contact_name?.message}>
                <Input id="contact_name" placeholder="例：青木 様" {...register("contact_name")} />
              </Field>
              <Field label="メールアドレス" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" {...register("email")} />
              </Field>
              <Field label="電話番号" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" {...register("phone")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="郵便番号" htmlFor="postal_code" error={errors.postal_code?.message}>
                <Input id="postal_code" placeholder="123-4567" inputMode="numeric" aria-invalid={!!errors.postal_code} {...register("postal_code")} />
              </Field>
              <Field label="住所" htmlFor="address" error={errors.address?.message}>
                <Input id="address" {...register("address")} />
              </Field>
            </div>
            <fieldset className="grid gap-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">支払条件</legend>
              <div className="grid grid-cols-3 gap-3">
                <Field label="締め日" htmlFor="closing_day">
                  <select id="closing_day" className={selectClass} {...register("closing_day")}>
                    {DAY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.v === "0" ? "月末" : o.l}</option>)}
                  </select>
                </Field>
                <Field label="支払月" htmlFor="pay_month_offset">
                  <select id="pay_month_offset" className={selectClass} {...register("pay_month_offset")}>
                    <option value="0">当月</option>
                    <option value="1">翌月</option>
                    <option value="2">翌々月</option>
                    <option value="3">3か月後</option>
                  </select>
                </Field>
                <Field label="支払日" htmlFor="pay_day">
                  <select id="pay_day" className={selectClass} {...register("pay_day")}>
                    {DAY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {termsLabel(terms)}：今日 発行すると支払期限は <span className="font-medium text-foreground tabular">{formatDate(calcDueDate(today, terms))}</span>
              </p>
            </fieldset>
            <Field label="メモ" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} {...register("notes")} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
                {id ? "保存" : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
