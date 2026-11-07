import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/generator";
import { calcTotals, type TaxRate } from "@/lib/domain/tax";

const now = new Date("2026-11-07T01:00:00Z");
const make = () => generateDemoData({ seed: 42, now, companyId: crypto.randomUUID(), mode: { kind: "demo", expiresAt: new Date(now.getTime() + 86400_000) } });

describe("デモデータの生成", () => {
  const data = make();
  const linesOf = (id: string) => data.lines.filter((l) => l.document_id === id);

  it("内容は seed で決まり、ID は毎回変わる", () => {
    const again = make();
    const key = (ds: typeof data.documents) => ds.map((d) => `${d.status}|${d.title}|${d.total}`).sort();
    expect(key(again.documents)).toEqual(key(data.documents));
    expect(again.documents[0].id).not.toBe(data.documents[0].id);
  });

  it("書類の金額は明細から計算した値と一致する", () => {
    for (const d of data.documents) {
      const t = calcTotals(linesOf(d.id as string).map((l) => ({
        quantity: Number(l.quantity), unitPrice: Number(l.unit_price), taxRate: Number(l.tax_rate) as TaxRate,
      })), d.rounding as "floor");
      expect(d.total, String(d.title)).toBe(t.total);
      expect(d.tax_10).toBe(t.tax10);
      expect(d.tax_8).toBe(t.tax8);
    }
  });

  it("発行済みには番号があり、下書きにはない。番号は重複しない", () => {
    const issued = data.documents.filter((d) => ["issued", "accepted", "void"].includes(d.status as string));
    expect(issued.every((d) => d.number)).toBe(true);
    expect(data.documents.filter((d) => ["draft", "pending", "approved"].includes(d.status as string)).every((d) => !d.number)).toBe(true);
    const numbers = issued.map((d) => d.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("入金は請求額を超えず、未来の日付もない", () => {
    for (const inv of data.documents.filter((d) => d.kind === "invoice")) {
      const paid = data.payments.filter((p) => p.invoice_id === inv.id).reduce((s, p) => s + Number(p.amount), 0);
      expect(paid).toBeLessThanOrEqual(Number(inv.total));
      expect(paid).toBe(Number(inv.paid_amount ?? 0));
    }
    expect(data.payments.every((p) => String(p.paid_on) <= "2026-11-07")).toBe(true);
  });

  it("承認待ち・期限超過・一部入金など、見せたい状態がそろっている", () => {
    const st = new Set(data.documents.map((d) => d.status));
    for (const s of ["draft", "pending", "approved", "issued", "accepted", "void"]) expect(st.has(s), s).toBe(true);
    const overdue = data.documents.filter((d) => d.kind === "invoice" && d.status === "issued" && String(d.due_date) < "2026-11-07"
      && Number(d.paid_amount ?? 0) < Number(d.total));
    expect(overdue.length).toBeGreaterThan(0);
  });
});
