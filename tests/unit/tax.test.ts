import { describe, expect, it } from "vitest";
import { calcTotals, lineAmount, roundYen } from "@/lib/domain/tax";

describe("roundYen", () => {
  it("切り捨て・四捨五入・切り上げ", () => {
    expect(roundYen(100.5, "floor")).toBe(100);
    expect(roundYen(100.5, "round")).toBe(101);
    expect(roundYen(100.1, "ceil")).toBe(101);
  });
  it("負の金額（値引き）は絶対値で処理して符号を戻す", () => {
    expect(roundYen(-100.5, "floor")).toBe(-100);
    expect(roundYen(-100.5, "round")).toBe(-101);
    expect(roundYen(-100.1, "ceil")).toBe(-101);
  });
  it("浮動小数点の誤差で切り上げがずれない", () => {
    // 0.1 × 3 = 0.30000000000000004 → そのまま ceil すると 1 になってしまう
    expect(roundYen(0.1 * 3 * 10, "ceil")).toBe(3);
    expect(lineAmount({ quantity: 1.1, unitPrice: 100, taxRate: 10 }, "ceil")).toBe(110);
  });
});

describe("calcTotals（インボイス制度：税率ごとに1回だけ端数処理）", () => {
  it("明細ごとではなく税率ごとの合計に税をかける", () => {
    // 明細ごとに税を計算すると 33×0.1=3.3→3 が3行で 9円。税率ごとなら 99×0.1=9.9→9円（切り捨て）
    const t = calcTotals([
      { quantity: 1, unitPrice: 33, taxRate: 10 },
      { quantity: 1, unitPrice: 33, taxRate: 10 },
      { quantity: 1, unitPrice: 33, taxRate: 10 },
    ], "floor");
    expect(t).toMatchObject({ subtotal: 99, taxable10: 99, tax10: 9, total: 108 });
    expect(calcTotals([{ quantity: 1, unitPrice: 99, taxRate: 10 }], "round").tax10).toBe(10);
  });
  it("10%・8%（軽減）・対象外を分けて集計する", () => {
    const t = calcTotals([
      { quantity: 4, unitPrice: 30000, taxRate: 10 },
      { quantity: 7, unitPrice: 1200, taxRate: 8 },
      { quantity: 1.5, unitPrice: 333, taxRate: 10 },
      { quantity: 1, unitPrice: 5000, taxRate: 0 },
    ], "floor");
    expect(t).toEqual({
      subtotal: 120000 + 8400 + 499 + 5000,
      taxable10: 120499, tax10: 12049,
      taxable8: 8400, tax8: 672,
      taxable0: 5000,
      taxTotal: 12721,
      total: 133899 + 12721,
    });
  });
  it("値引きの行は同じ税率の合計から差し引く", () => {
    const t = calcTotals([
      { quantity: 1, unitPrice: 100000, taxRate: 10 },
      { quantity: 1, unitPrice: -10000, taxRate: 10 },
    ], "floor");
    expect(t).toMatchObject({ taxable10: 90000, tax10: 9000, total: 99000 });
  });
  it("明細がなければ 0 円", () => {
    expect(calcTotals([], "floor").total).toBe(0);
  });
});
