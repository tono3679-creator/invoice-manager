import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcDueDate } from "@/lib/domain/terms";
import { connect, createTenant, dropTenant, type TestTenant } from "./helpers";

const sql = connect();
let t: TestTenant;

beforeAll(async () => { t = await createTenant(sql, 11); });
afterAll(async () => { await dropTenant(sql, t); await sql.end(); });

describe("画面（TS）と DB の計算が一致する", () => {
  it("生成した金額は DB の recalc_document の結果と同じ", async () => {
    const before = await sql<{ id: string; subtotal: number; tax_10: number; tax_8: number; total: number }[]>`
      select id, subtotal, tax_10, tax_8, total from documents where company_id = ${t.companyId} order by id`;
    expect(before.length).toBeGreaterThan(150);
    // 全部の書類を DB で計算し直して比べる（比べたあとはロールバックして元に戻す）
    let after: unknown[] = [];
    await sql.begin(async (tx) => {
      await tx`select app_private.recalc_document(id) from documents where company_id = ${t.companyId}`;
      after = [...await tx<typeof before>`select id, subtotal, tax_10, tax_8, total from documents where company_id = ${t.companyId} order by id`];
      throw new Error("rollback");
    }).catch((e) => { if ((e as Error).message !== "rollback") throw e; });
    expect(after).toEqual([...before]);
    // 明細の金額の合計と小計も一致する
    const mismatch = await sql`
      select d.id from documents d
      join (select document_id, sum(amount) s from document_lines group by document_id) l on l.document_id = d.id
      where d.company_id = ${t.companyId} and l.s <> d.subtotal`;
    expect(mismatch).toHaveLength(0);
  });

  it("支払期限：SQL の calc_due_date と TS の calcDueDate が同じ", async () => {
    const cases: [string, number, number, number][] = [];
    const dates = ["2026-01-01", "2026-01-31", "2026-02-15", "2026-02-28", "2028-02-29", "2026-11-07", "2026-11-20", "2026-11-21", "2026-12-31"];
    for (const d of dates) for (const closing of [0, 10, 15, 20, 25]) for (const off of [0, 1, 2]) for (const pay of [0, 5, 10, 20, 25]) cases.push([d, closing, off, pay]);
    const rows = await sql<{ i: number; due: string }[]>`
      select i, public.calc_due_date(d::date, c, o, p)::text as due
      from jsonb_to_recordset(${sql.json(cases.map(([d, c, o, p], i) => ({ i, d, c, o, p })))}) as x(i int, d text, c int, o int, p int)`;
    for (const r of rows) {
      const [d, c, o, p] = cases[r.i];
      expect(r.due, `${d} ${c}/${o}/${p}`).toBe(calcDueDate(d, { closingDay: c, payMonthOffset: o, payDay: p }));
    }
  });

  it("入金額の合計は請求書の入金済み額と一致する", async () => {
    const rows = await sql`
      select d.id from documents d
      left join (select invoice_id, sum(amount) s from payments group by invoice_id) p on p.invoice_id = d.id
      where d.company_id = ${t.companyId} and d.kind = 'invoice' and coalesce(p.s, 0) <> d.paid_amount`;
    expect(rows).toHaveLength(0);
  });
});
