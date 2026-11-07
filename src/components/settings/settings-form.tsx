"use client";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { Seal } from "@/components/documents/document-paper";
import { updateSettings } from "@/lib/actions/settings";
import { safeAction } from "@/lib/client/safe-action";
import { ROUNDING_LABEL } from "@/lib/domain/tax";
import type { settingsSchema } from "@/lib/validation";
import type { z } from "zod";

export type SettingsValues = {
  company_name: string; legal_name: string; postal_code: string; address: string; phone: string; email: string; registration_number: string;
  bank_account: string; rounding: "floor" | "round" | "ceil"; approval_threshold: string; quote_valid_days: string; invoice_prefix: string;
  quote_prefix: string; receipt_prefix: string; default_invoice_notes: string; default_quote_notes: string; show_seal: boolean; seal_text: string;
};
const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs";

export function SettingsForm({ initial, editable }: { initial: SettingsValues; editable: boolean }) {
  const router = useRouter();
  const form = useForm<SettingsValues>({ defaultValues: initial });
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  const [seal, showSeal] = useWatch({ control, name: ["seal_text", "show_seal"] });

  const submit = handleSubmit(async (v) => {
    const result = await safeAction(() => updateSettings(v as unknown as z.input<typeof settingsSchema>));
    if (result.ok) {
      toast.success("設定を保存しました。これから発行する書類に反映されます");
      router.refresh();
    } else {
      for (const [k, msg] of Object.entries(result.fieldErrors ?? {})) setError(k as keyof SettingsValues, { message: msg });
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={!editable} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">発行元の情報</CardTitle>
            <CardDescription>書類の右上に載る内容です。発行済みの書類は、発行したときの内容のまま変わりません。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="会社名（画面の表示）" htmlFor="company_name" error={errors.company_name?.message} required>
                <Input id="company_name" {...register("company_name")} />
              </Field>
              <Field label="書類に載せる名称" htmlFor="legal_name" error={errors.legal_name?.message} required>
                <Input id="legal_name" {...register("legal_name")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="郵便番号" htmlFor="postal_code" error={errors.postal_code?.message}><Input id="postal_code" {...register("postal_code")} /></Field>
              <Field label="住所" htmlFor="address" error={errors.address?.message}><Input id="address" {...register("address")} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="電話番号" htmlFor="phone" error={errors.phone?.message}><Input id="phone" {...register("phone")} /></Field>
              <Field label="メールアドレス" htmlFor="email" error={errors.email?.message}><Input id="email" {...register("email")} /></Field>
            </div>
            <Field label="適格請求書発行事業者の登録番号" htmlFor="registration_number" error={errors.registration_number?.message}
              hint="T と13桁の数字。登録していない場合は空欄（区分記載請求書として発行します）">
              <Input id="registration_number" placeholder="T1234567890123" className="tabular sm:max-w-64" {...register("registration_number")} />
            </Field>
            <Field label="振込先" htmlFor="bank_account" error={errors.bank_account?.message} hint="請求書の下に載ります">
              <Input id="bank_account" {...register("bank_account")} />
            </Field>
            <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("show_seal")} />
                  社印（角印）を書類に載せる
                </label>
                <Field label="印影の文字" htmlFor="seal_text" error={errors.seal_text?.message} hint="12文字まで。会社名の文字から自動で印影を作ります（画像は不要）">
                  <Input id="seal_text" className="sm:max-w-64" {...register("seal_text")} />
                </Field>
              </div>
              {showSeal && seal && <div className="rounded-lg border bg-white p-3"><Seal text={seal} size={72} /></div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">計算・承認・番号</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="端数処理" htmlFor="rounding" hint="明細の金額と、税率ごとの消費税に使います">
                <select id="rounding" className={selectClass} {...register("rounding")}>
                  {Object.entries(ROUNDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="承認が必要な金額（税込）" htmlFor="approval_threshold" error={errors.approval_threshold?.message}
                hint="この金額以上は、作成者以外の承認者の承認が必要。作成者（権限）の書類は金額にかかわらず承認が必要">
                <Input id="approval_threshold" inputMode="numeric" className="text-right tabular" {...register("approval_threshold")} />
              </Field>
              <Field label="見積書の有効期間（日）" htmlFor="quote_valid_days" error={errors.quote_valid_days?.message}>
                <Input id="quote_valid_days" inputMode="numeric" className="text-right tabular" {...register("quote_valid_days")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="請求書番号の頭" htmlFor="invoice_prefix" error={errors.invoice_prefix?.message} hint="例：INV-2026-0001">
                <Input id="invoice_prefix" {...register("invoice_prefix")} />
              </Field>
              <Field label="見積番号の頭" htmlFor="quote_prefix" error={errors.quote_prefix?.message}><Input id="quote_prefix" {...register("quote_prefix")} /></Field>
              <Field label="領収書番号の頭" htmlFor="receipt_prefix" error={errors.receipt_prefix?.message}><Input id="receipt_prefix" {...register("receipt_prefix")} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="請求書の備考（初期値）" htmlFor="default_invoice_notes" error={errors.default_invoice_notes?.message}>
                <Textarea id="default_invoice_notes" rows={2} {...register("default_invoice_notes")} />
              </Field>
              <Field label="見積書の備考（初期値）" htmlFor="default_quote_notes" error={errors.default_quote_notes?.message}>
                <Textarea id="default_quote_notes" rows={2} {...register("default_quote_notes")} />
              </Field>
            </div>
          </CardContent>
        </Card>
      </fieldset>
      {editable ? (
        <div className="flex justify-end">
          <Button type="submit" variant="brand" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}設定を保存</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">会社の設定を変更できるのは管理者だけです。</p>
      )}
    </form>
  );
}
