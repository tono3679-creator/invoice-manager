/** 入力の検証（画面とサーバーで同じものを使う。DB の制約・関数が最後の守り） */
import { z } from "zod";

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}は${max}文字以内で入力してください`).transform((v) => (v === "" ? null : v)).nullable();

const yen = (label: string) =>
  z.coerce.number({ error: `${label}を数字で入力してください` }).int(`${label}は円単位の整数で入力してください`)
    .min(-100_000_000, `${label}が大きすぎます`).max(100_000_000, `${label}は1億円以下にしてください`);

export const clientSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, "コードは半角英数字とハイフン（20文字以内）で入力してください"),
  name: z.string().trim().min(1, "取引先名を入力してください").max(100, "取引先名は100文字以内で入力してください"),
  honorific: z.enum(["御中", "様"]),
  department: optionalText(100, "部署"),
  contact_name: optionalText(50, "担当者"),
  email: z.string().trim().max(200).refine((v) => v === "" || z.email().safeParse(v).success, "メールアドレスの形式が正しくありません")
    .transform((v) => (v === "" ? null : v)).nullable(),
  phone: optionalText(30, "電話番号"),
  postal_code: z.string().trim().refine((v) => v === "" || /^\d{3}-\d{4}$/.test(v), "郵便番号は 123-4567 の形で入力してください")
    .transform((v) => (v === "" ? null : v)).nullable(),
  address: optionalText(200, "住所"),
  closing_day: z.coerce.number().int().min(0).max(28),
  pay_month_offset: z.coerce.number().int().min(0).max(3),
  pay_day: z.coerce.number().int().min(0).max(28),
  notes: optionalText(1000, "メモ"),
});
export type ClientInput = z.input<typeof clientSchema>;

export const itemSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, "コードは半角英数字とハイフン（20文字以内）で入力してください"),
  name: z.string().trim().min(1, "品目名を入力してください").max(100, "品目名は100文字以内で入力してください"),
  unit: z.string().trim().min(1, "単位を入力してください").max(10, "単位は10文字以内で入力してください"),
  unit_price: yen("単価"),
  tax_rate: z.coerce.number().refine((v) => v === 10 || v === 8 || v === 0, "税率を選んでください"),
  description: optionalText(300, "説明"),
});
export type ItemInput = z.input<typeof itemSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください");
const optionalDate = z.string().transform((v) => (v === "" ? null : v)).pipe(dateString.nullable()).nullable();

export const lineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "品名を入力してください").max(200, "品名は200文字以内で入力してください"),
  quantity: z.coerce.number({ error: "数量を数字で入力してください" }).gt(0, "数量は0より大きくしてください").max(1_000_000, "数量が大きすぎます")
    .refine((v) => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "数量は小数第2位までです"),
  unit: z.string().trim().min(1, "単位を入力してください").max(10, "単位は10文字以内です"),
  unit_price: yen("単価"),
  tax_rate: z.coerce.number().refine((v) => v === 10 || v === 8 || v === 0, "税率を選んでください"),
});

export const documentSchema = z.object({
  client_id: z.string().uuid("取引先を選んでください"),
  title: z.string().trim().min(1, "件名を入力してください").max(100, "件名は100文字以内で入力してください"),
  issue_date: optionalDate,
  due_date: optionalDate,
  valid_until: optionalDate,
  notes: optionalText(1000, "備考"),
  lines: z.array(lineSchema).min(1, "明細を1行以上入力してください").max(100, "明細は100行までです"),
}).refine((d) => !d.issue_date || !d.due_date || d.due_date >= d.issue_date, { message: "支払期限は発行日以降にしてください", path: ["due_date"] });
export type DocumentInput = z.input<typeof documentSchema>;

export const paymentSchema = z.object({
  paid_on: dateString,
  amount: z.coerce.number({ error: "入金額を数字で入力してください" }).int("入金額は円単位で入力してください").min(1, "入金額は1円以上にしてください"),
  method: z.enum(["bank", "cash", "card", "other"]),
  note: optionalText(200, "メモ"),
});

export const recurringSchema = z.object({
  client_id: z.string().uuid("取引先を選んでください"),
  title: z.string().trim().min(1, "件名を入力してください").max(100, "件名は100文字以内で入力してください"),
  interval_months: z.coerce.number().refine((v) => [1, 2, 3, 6, 12].includes(v), "間隔を選んでください"),
  issue_day: z.coerce.number().int().min(0).max(28),
  next_issue_on: dateString,
  active: z.boolean(),
  notes: optionalText(1000, "備考"),
  lines: z.array(lineSchema).min(1, "明細を1行以上入力してください").max(50, "明細は50行までです"),
});

export const settingsSchema = z.object({
  company_name: z.string().trim().min(1, "会社名を入力してください").max(100),
  legal_name: z.string().trim().min(1, "書類に載せる名称を入力してください").max(100),
  postal_code: clientSchema.shape.postal_code,
  address: optionalText(200, "住所"),
  phone: optionalText(30, "電話番号"),
  email: clientSchema.shape.email,
  registration_number: z.string().trim().toUpperCase()
    .refine((v) => v === "" || /^T\d{13}$/.test(v), "登録番号は T と13桁の数字で入力してください（例：T1234567890123）")
    .transform((v) => (v === "" ? null : v)).nullable(),
  bank_account: optionalText(300, "振込先"),
  rounding: z.enum(["floor", "round", "ceil"]),
  approval_threshold: z.coerce.number().int().min(0, "0円以上で入力してください").max(10_000_000_000),
  quote_valid_days: z.coerce.number().int().min(1).max(365),
  invoice_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "半角の英大文字・数字（8文字以内）で入力してください"),
  quote_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "半角の英大文字・数字（8文字以内）で入力してください"),
  receipt_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "半角の英大文字・数字（8文字以内）で入力してください"),
  default_invoice_notes: optionalText(1000, "請求書の備考"),
  default_quote_notes: optionalText(1000, "見積書の備考"),
  show_seal: z.boolean(),
  seal_text: z.string().trim().min(1, "印影の文字を入力してください").max(12, "印影の文字は12文字以内です"),
});
