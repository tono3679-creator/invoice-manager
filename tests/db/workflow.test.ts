import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TransactionSql } from "postgres";
import { as, connect, createTenant, dropTenant, errorOf, type TestTenant } from "./helpers";

const sql = connect();
let t: TestTenant;
let other: TestTenant;
let clientId: string;
let itemId: string;

beforeAll(async () => {
  t = await createTenant(sql, 21);
  other = await createTenant(sql, 22);
  clientId = t.data.clients[0].id as string;
  itemId = t.data.items[0].id as string;
});
afterAll(async () => {
  await dropTenant(sql, t);
  await dropTenant(sql, other);
  await sql.end();
});

const lines = (price: number) => [
  { item_id: null, description: "作業費", quantity: 1, unit: "式", unit_price: price, tax_rate: 10 },
  { item_id: null, description: "お弁当", quantity: 3, unit: "個", unit_price: 1000, tax_rate: 8 },
];
async function save(tx: TransactionSql, price: number, kind: "invoice" | "quote" = "invoice") {
  const [r] = await tx<{ id: string; version: number }[]>`
    select * from save_document(null, ${kind}, ${tx.json({ client_id: clientId, title: "テスト", issue_date: null, due_date: null, valid_until: null, notes: null, lines: lines(price) } as never)}, null)`;
  return r;
}
const doc = async (id: string) => (await sql<{ status: string; version: number; number: string | null; total: number; tax_10: number; tax_8: number; due_date: string | null; client_snapshot: unknown }[]>`
  select status, version, number, total, tax_10, tax_8, due_date::text, client_snapshot from documents where id = ${id}`)[0];

describe("承認の流れ", () => {
  it("保存すると DB が金額を計算する（税率ごとに1回だけ端数処理）", async () => {
    const r = await as(sql, t.staff.member, (tx) => save(tx, 10005));
    const d = await doc(r.id);
    expect(d).toMatchObject({ status: "draft", number: null, tax_10: 1000, tax_8: 240, total: 10005 + 3000 + 1240 });
  });

  it("作成者は承認なしで発行できない。依頼 → 承認 → 発行で番号が付く", async () => {
    const r = await as(sql, t.staff.member, (tx) => save(tx, 1000));
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select issue_document(${r.id}, ${r.version})`))).toMatch(/承認が必要/);
    await as(sql, t.staff.member, (tx) => tx`select submit_document(${r.id}, ${r.version}, 'お願いします')`);
    // 承認待ちは編集できない
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select * from save_document(${r.id}, 'invoice', ${tx.json({ client_id: clientId, title: "x", lines: lines(1) } as never)}, ${r.version + 1})`)))
      .toMatch(/下書き以外/);
    // 作成者は承認できない
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select approve_document(${r.id})`))).toMatch(/権限/);
    await as(sql, t.staff.approver, (tx) => tx`select approve_document(${r.id}, 'OK')`);
    const approved = await doc(r.id);
    const [{ issue_document: number }] = await as(sql, t.staff.member, (tx) => tx`select issue_document(${r.id}, ${approved.version})`);
    const d = await doc(r.id);
    expect(d.status).toBe("issued");
    expect(d.number).toBe(number);
    expect(number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(d.due_date).not.toBeNull();
    expect(d.client_snapshot).toMatchObject({ name: t.data.clients[0].name });
    const events = await sql`select action from document_events where document_id = ${r.id} order by created_at, id`;
    expect(events.map((e) => e.action)).toEqual(["created", "submitted", "approved", "issued"]);
  });

  it("自分で作成・編集した書類は承認できない（職務の分離）", async () => {
    const r = await as(sql, t.staff.approver, (tx) => save(tx, 500000));
    await as(sql, t.staff.approver, (tx) => tx`select submit_document(${r.id}, ${r.version})`);
    expect(await errorOf(as(sql, t.staff.approver, (tx) => tx`select approve_document(${r.id})`))).toMatch(/自分で作成/);
    await as(sql, t.staff.admin, (tx) => tx`select approve_document(${r.id})`);
    expect((await doc(r.id)).status).toBe("approved");
  });

  it("承認者は基準額未満なら承認なしで発行できる。基準額以上は承認が必要", async () => {
    const small = await as(sql, t.staff.approver, (tx) => save(tx, 1000));
    await as(sql, t.staff.approver, (tx) => tx`select issue_document(${small.id}, ${small.version})`);
    expect((await doc(small.id)).status).toBe("issued");
    const big = await as(sql, t.staff.approver, (tx) => save(tx, 400000));
    expect(await errorOf(as(sql, t.staff.approver, (tx) => tx`select issue_document(${big.id}, ${big.version})`))).toMatch(/承認が必要/);
  });

  it("差し戻しには理由が必要で、下書きに戻る", async () => {
    const r = await as(sql, t.staff.member, (tx) => save(tx, 2000));
    await as(sql, t.staff.member, (tx) => tx`select submit_document(${r.id}, ${r.version})`);
    expect(await errorOf(as(sql, t.staff.approver, (tx) => tx`select reject_document(${r.id}, '  ')`))).toMatch(/理由/);
    await as(sql, t.staff.approver, (tx) => tx`select reject_document(${r.id}, '単価が違います')`);
    expect((await doc(r.id)).status).toBe("draft");
  });

  it("古い版で保存すると競合として止める", async () => {
    const r = await as(sql, t.staff.member, (tx) => save(tx, 3000));
    const body = { client_id: clientId, title: "更新", lines: lines(3000) };
    await as(sql, t.staff.member, (tx) => tx`select * from save_document(${r.id}, 'invoice', ${tx.json(body as never)}, ${r.version})`);
    const err = await as(sql, t.staff.member2, (tx) => tx`select * from save_document(${r.id}, 'invoice', ${tx.json(body as never)}, ${r.version})`)
      .then(() => null, (e) => e as { code: string });
    expect(err?.code).toBe("40001");
  });

  it("閲覧のみは書類を作れない", async () => {
    expect(await errorOf(as(sql, t.staff.viewer, (tx) => save(tx, 1000)))).toMatch(/権限/);
  });
});

describe("入金と領収書", () => {
  let invoiceId: string;
  beforeAll(async () => {
    const r = await as(sql, t.staff.admin, (tx) => save(tx, 10000));
    await as(sql, t.staff.admin, (tx) => tx`select issue_document(${r.id}, ${r.version})`);
    invoiceId = r.id;
  });

  it("残高を超える入金や未来の日付は記録できない", async () => {
    const total = (await doc(invoiceId)).total;
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select record_payment(${invoiceId}, current_date, ${total + 1}, 'bank')`))).toMatch(/残高/);
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select record_payment(${invoiceId}, current_date + 3, 1, 'bank')`))).toMatch(/未来/);
  });

  it("分割で入金して、領収書に番号が付く。入金がある請求書は取り消せない", async () => {
    const total = (await doc(invoiceId)).total;
    const [{ record_payment: p1 }] = await as(sql, t.staff.member, (tx) => tx`select record_payment(${invoiceId}, (now() at time zone 'Asia/Tokyo')::date, 5000, 'bank')`);
    await as(sql, t.staff.member, (tx) => tx`select record_payment(${invoiceId}, (now() at time zone 'Asia/Tokyo')::date, ${total - 5000}, 'cash')`);
    const [b] = await sql`select payment_state, balance from invoice_balances where id = ${invoiceId}`;
    expect(b).toMatchObject({ payment_state: "paid", balance: 0 });
    const [{ issue_receipt: rc }] = await as(sql, t.staff.member, (tx) => tx`select issue_receipt(${p1})`);
    expect(rc).toMatch(/^RC-\d{4}-\d{4}$/);
    expect(await errorOf(as(sql, t.staff.approver, (tx) => tx`select void_document(${invoiceId}, '誤り')`))).toMatch(/入金/);
    // 入金の削除は承認者以上
    expect(await errorOf(as(sql, t.staff.member, (tx) => tx`select delete_payment(${p1})`))).toMatch(/権限/);
  });
});

describe("見積から請求へ", () => {
  it("発行済みの見積を受注にすると、同じ明細の請求書の下書きができる", async () => {
    const q = await as(sql, t.staff.admin, (tx) => save(tx, 20000, "quote"));
    await as(sql, t.staff.admin, (tx) => tx`select issue_document(${q.id}, ${q.version})`);
    const [{ convert_quote_to_invoice: inv }] = await as(sql, t.staff.member, (tx) => tx`select convert_quote_to_invoice(${q.id})`);
    expect((await doc(q.id)).status).toBe("accepted");
    const d = await doc(inv);
    expect(d).toMatchObject({ status: "draft", total: (await doc(q.id)).total });
  });
});

describe("会社ごとの分離と直接の書き込み", () => {
  it("ほかの会社の書類は見えず、操作もできない", async () => {
    const theirs = other.data.documents.find((d) => d.status === "draft")!.id as string;
    const seen = await as(sql, t.staff.admin, (tx) => tx`select count(*)::int n from documents where company_id = ${other.companyId}`);
    expect(seen[0].n).toBe(0);
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`select delete_draft(${theirs})`))).toMatch(/見つかりません|ありません/);
  });

  it("書類・入金の表には直接書き込めない（関数を通す）", async () => {
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`update documents set total = 1 where company_id = ${t.companyId}`))).toMatch(/permission denied/);
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`delete from payments where company_id = ${t.companyId}`))).toMatch(/permission denied/);
  });

  it("ほかの会社の取引先を指定して保存できない", async () => {
    const theirClient = other.data.clients[0].id as string;
    const body = { client_id: theirClient, title: "x", lines: lines(1) };
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`select * from save_document(null, 'invoice', ${tx.json(body as never)}, null)`))).toMatch(/取引先/);
  });

  it("品目の登録は作成者以上、削除は承認者以上", async () => {
    expect(await errorOf(as(sql, t.staff.viewer, (tx) => tx`insert into items (company_id, code, name, unit, unit_price, tax_rate) values (${t.companyId}, 'X-1', 'x', '式', 1, 10)`))).not.toBeNull();
    await as(sql, t.staff.member, (tx) => tx`insert into items (company_id, code, name, unit, unit_price, tax_rate) values (${t.companyId}, 'X-1', 'x', '式', 1, 10)`);
    const del = await as(sql, t.staff.member, (tx) => tx`delete from items where company_id = ${t.companyId} and code = 'X-1' returning id`);
    expect(del).toHaveLength(0);
    const del2 = await as(sql, t.staff.approver, (tx) => tx`delete from items where company_id = ${t.companyId} and code = 'X-1' returning id`);
    expect(del2).toHaveLength(1);
    void itemId;
  });
});
