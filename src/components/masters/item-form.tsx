"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, PackagePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { saveItem } from "@/lib/actions/masters";
import { safeAction } from "@/lib/client/safe-action";
import { TAX_RATES, TAX_RATE_LABEL } from "@/lib/domain/tax";
import type { ItemInput } from "@/lib/validation";

export type ItemFormValues = { code: string; name: string; unit: string; unit_price: string; tax_rate: string; description: string };
const EMPTY: ItemFormValues = { code: "", name: "", unit: "式", unit_price: "", tax_rate: "10", description: "" };
const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function ItemFormButton({ initial, id, size }: { initial?: ItemFormValues; id?: string; size?: "sm" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults = initial ?? EMPTY;
  const form = useForm<ItemFormValues>({ defaultValues: defaults });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;

  const submit = handleSubmit(async (values) => {
    const result = await safeAction(() => saveItem(id ?? null, values as unknown as ItemInput));
    if (result.ok) {
      toast.success(id ? `${values.name} を更新しました` : `${values.name} を登録しました`);
      setOpen(false);
      router.refresh();
    } else {
      for (const [k, msg] of Object.entries(result.fieldErrors ?? {})) setError(k as keyof ItemFormValues, { message: msg });
      toast.error(result.error);
    }
  });

  return (
    <>
      {id ? (
        <Button variant="ghost" size={size ?? "sm"} onClick={() => { form.reset(defaults); setOpen(true); }} aria-label={`${defaults.name} を編集`}>
          <Pencil aria-hidden />編集
        </Button>
      ) : (
        <Button onClick={() => { form.reset(defaults); setOpen(true); }}><PackagePlus aria-hidden />品目を登録</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{id ? "品目を編集" : "品目を登録"}</DialogTitle>
            <DialogDescription>単価は税抜きです。値引きはマイナスの単価で登録します。変更しても、作成済みの書類の明細は変わりません。</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="コード" htmlFor="code" error={errors.code?.message} required>
                <Input id="code" placeholder="WEB-010" aria-invalid={!!errors.code} {...register("code")} />
              </Field>
              <Field label="品目名" htmlFor="name" error={errors.name?.message} required>
                <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="単価（税抜）" htmlFor="unit_price" error={errors.unit_price?.message} required>
                <Input id="unit_price" inputMode="numeric" className="text-right tabular" aria-invalid={!!errors.unit_price} {...register("unit_price")} />
              </Field>
              <Field label="単位" htmlFor="unit" error={errors.unit?.message} required>
                <Input id="unit" {...register("unit")} />
              </Field>
              <Field label="税率" htmlFor="tax_rate">
                <select id="tax_rate" className={selectClass} {...register("tax_rate")}>
                  {TAX_RATES.map((r) => <option key={r} value={r}>{TAX_RATE_LABEL[r]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="説明" htmlFor="description" error={errors.description?.message}>
              <Input id="description" {...register("description")} />
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
