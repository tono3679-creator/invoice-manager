/**
 * 金額の計算（画面のプレビュー用）。DB の app_private.recalc_document と同じ計算で、
 * 保存した後の金額は DB が計算し直す（tests/db/documents.test.ts で一致を確かめている）。
 *   明細の金額 = 数量 × 単価（端数処理）
 *   消費税 = 税率ごとの合計 × 税率（税率ごとに1回だけ端数処理する。インボイス制度のルール）
 */
export type RoundingMode = "floor" | "round" | "ceil";
export type TaxRate = 10 | 8 | 0;

export const TAX_RATES: TaxRate[] = [10, 8, 0];
export const TAX_RATE_LABEL: Record<TaxRate, string> = { 10: "10%", 8: "8%（軽減）", 0: "対象外" };
export const ROUNDING_LABEL: Record<RoundingMode, string> = { floor: "切り捨て", round: "四捨五入", ceil: "切り上げ" };

/** 円未満の端数処理。負の金額（値引き）は絶対値で処理して符号を戻す */
export function roundYen(value: number, mode: RoundingMode): number {
  // 浮動小数点の誤差（0.1 × 3 = 0.30000000000000004 など）で切り上げ・切り捨てがずれないよう、
  // 小数第6位で一度丸めてから処理する（数量は小数第2位まで、単価は整数なので十分）
  const abs = Math.round(Math.abs(value) * 1e6) / 1e6;
  const r = mode === "floor" ? Math.floor(abs) : mode === "ceil" ? Math.ceil(abs) : Math.round(abs);
  return value < 0 ? -r : r;
}

export type LineInput = { quantity: number; unitPrice: number; taxRate: TaxRate };

export function lineAmount(line: LineInput, mode: RoundingMode): number {
  return roundYen(line.quantity * line.unitPrice, mode);
}

export type Totals = {
  subtotal: number;
  taxable10: number;
  tax10: number;
  taxable8: number;
  tax8: number;
  taxable0: number;
  taxTotal: number;
  total: number;
};

export function calcTotals(lines: LineInput[], mode: RoundingMode): Totals {
  let taxable10 = 0;
  let taxable8 = 0;
  let taxable0 = 0;
  for (const line of lines) {
    const amount = lineAmount(line, mode);
    if (line.taxRate === 10) taxable10 += amount;
    else if (line.taxRate === 8) taxable8 += amount;
    else taxable0 += amount;
  }
  const tax10 = roundYen(taxable10 * 0.1, mode);
  const tax8 = roundYen(taxable8 * 0.08, mode);
  const subtotal = taxable10 + taxable8 + taxable0;
  return { subtotal, taxable10, tax10, taxable8, tax8, taxable0, taxTotal: tax10 + tax8, total: subtotal + tax10 + tax8 };
}
