/**
 * デモ・見本の会社のデータを作る（DB には触らない。登録は load.ts）。
 * 「今」を基準に過去12か月分の見積書・請求書・入金を作るので、いつ開いても稼働中の会社に見える。
 * 同じ seed と同じ日付なら、同じデータになる（テストで確かめている）。
 */
import { calcTotals, lineAmount, type TaxRate } from "@/lib/domain/tax";
import { addDays, calcDueDate, monthDay, todayJst } from "@/lib/domain/terms";
import type { AppRole, DocKind, DocStatus, PaymentMethod } from "@/lib/domain/labels";
import { CLIENTS, COMPANY, ITEMS, PROJECTS, RECURRING, STAFF, type ClientSeed } from "./master-data";
import { Random } from "./random";

export const DEFAULT_DEMO_SEED = 20261107;
const THRESHOLD = 300000;
const ROUNDING = "floor" as const;

type Row = Record<string, unknown>;

export type DemoDataset = {
  users: Row[];
  company: Row;
  settings: Row;
  profiles: Row[];
  clients: Row[];
  items: Row[];
  recurring: Row[];
  documents: Row[];
  lines: Row[];
  events: Row[];
  payments: Row[];
  counters: Row[];
  /** 役割のキー（STAFF の key）→ 利用者 ID */
  staff: Record<string, string>;
};

export type GenerateOptions = {
  seed: number;
  now: Date;
  companyId: string;
  /** 訪問者ごとのデモ（匿名の利用者で作る）か、見本の会社（メールアドレスとパスワードでログインする）か */
  mode: { kind: "demo"; expiresAt: Date } | { kind: "showcase"; passwordHash: string };
  /** ID の作り方（テストで固定するときに使う） */
  newId?: () => string;
};

type DraftLine = { item_id: string | null; description: string; quantity: number; unit: string; unit_price: number; tax_rate: TaxRate };

type Doc = {
  row: Row;
  lines: DraftLine[];
  sortKey: string;
};

const jst = (date: string, hh = 10, mm = 0) => new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);

export function generateDemoData(options: GenerateOptions): DemoDataset {
  const rnd = new Random(options.seed);
  // ID は毎回ランダム（デモは訪問者ごとに作るため、同じ ID にならないように）。内容は seed で決まる
  const newId = options.newId ?? (() => crypto.randomUUID());
  const today = todayJst(options.now);
  const [ty, tm] = today.split("-").map(Number);
  const companyId = options.companyId;
  const isDemo = options.mode.kind === "demo";

  // ---- 利用者 ----
  const staff: Record<string, string> = {};
  const users: Row[] = [];
  const profiles: Row[] = [];
  for (const s of STAFF) {
    const id = newId();
    staff[s.key] = id;
    users.push({
      id,
      email: isDemo ? null : s.email,
      encrypted_password: options.mode.kind === "showcase" ? options.mode.passwordHash : null,
      is_anonymous: isDemo,
      created_at: options.now,
    });
    profiles.push({ id, company_id: companyId, role: s.role, display_name: s.name, title: s.title });
  }
  const roleOf = (id: string): AppRole => STAFF.find((s) => staff[s.key] === id)!.role;

  const company: Row = {
    id: companyId,
    name: COMPANY.name,
    is_demo: isDemo,
    is_showcase: !isDemo,
    demo_owner: isDemo ? staff.member : null,
    demo_expires_at: options.mode.kind === "demo" ? options.mode.expiresAt : null,
    created_at: options.now,
  };
  const settings: Row = {
    company_id: companyId,
    legal_name: COMPANY.legalName,
    postal_code: COMPANY.postalCode,
    address: COMPANY.address,
    phone: COMPANY.phone,
    email: COMPANY.email,
    registration_number: COMPANY.registrationNumber,
    bank_account: COMPANY.bankAccount,
    rounding: ROUNDING,
    approval_threshold: THRESHOLD,
    quote_valid_days: 30,
    default_invoice_notes: "お振込手数料は貴社にてご負担くださいますようお願いいたします。",
    default_quote_notes: "本見積書の有効期限は発行日から30日間です。",
    show_seal: true,
    seal_text: COMPANY.sealText,
  };

  // ---- 取引先・品目 ----
  const clientIds = new Map<string, string>();
  const clients: Row[] = CLIENTS.map((c) => {
    const id = newId();
    clientIds.set(c.code, id);
    return {
      id, company_id: companyId, code: c.code, name: c.name, honorific: c.honorific, department: c.department ?? null,
      contact_name: c.contact ?? null, email: null, phone: null, postal_code: c.postalCode, address: c.address,
      closing_day: c.terms[0], pay_month_offset: c.terms[1], pay_day: c.terms[2], notes: null,
      archived_at: null, created_at: jst(addDays(today, -400)), updated_at: jst(addDays(today, -400)),
    };
  });
  const itemIds = new Map<string, string>();
  const items: Row[] = ITEMS.map((it) => {
    const id = newId();
    itemIds.set(it.code, id);
    return {
      id, company_id: companyId, code: it.code, name: it.name, unit: it.unit, unit_price: it.price, tax_rate: it.tax,
      description: it.description ?? null, archived_at: null, created_at: jst(addDays(today, -400)), updated_at: jst(addDays(today, -400)),
    };
  });
  const itemLine = (code: string, qty: number, priceFactor = 1): DraftLine => {
    const it = ITEMS.find((i) => i.code === code)!;
    // 単価は品目の単価を基準に、案件ごとに少し変える（1,000円単位）
    const price = it.price < 0 || Math.abs(it.price) < 10000 || priceFactor === 1 ? it.price : Math.round((it.price * priceFactor) / 1000) * 1000;
    return { item_id: itemIds.get(code)!, description: it.name, quantity: qty, unit: it.unit, unit_price: price, tax_rate: it.tax };
  };

  const settingsSnapshot = {
    legal_name: COMPANY.legalName, postal_code: COMPANY.postalCode, address: COMPANY.address, phone: COMPANY.phone,
    email: COMPANY.email, registration_number: COMPANY.registrationNumber, bank_account: COMPANY.bankAccount,
    show_seal: true, seal_text: COMPANY.sealText,
  };
  const clientSnapshot = (c: ClientSeed) => ({
    name: c.name, honorific: c.honorific, department: c.department ?? null, contact_name: c.contact ?? null,
    postal_code: c.postalCode, address: c.address,
  });

  // ---- 書類 ----
  const docs: Doc[] = [];
  const events: Row[] = [];
  const payments: Row[] = [];
  const event = (docId: string, action: string, actor: string | null, at: Date, comment: string | null = null) =>
    events.push({ company_id: companyId, document_id: docId, action, actor, comment, created_at: at });

  /** 承認の流れ（作成 → 承認依頼・承認 → 発行）の履歴を作り、承認者を返す */
  const approvalFlow = (docId: string, creator: string, total: number, createdOn: string, issueOn: string) => {
    event(docId, "created", creator, jst(createdOn, 9, rnd.int(0, 59)));
    const role = roleOf(creator);
    if (role !== "member" && total < THRESHOLD) return { approver: null as string | null, note: "承認不要（基準額未満）" };
    const approver = creator === staff.approver ? staff.admin : staff.approver;
    event(docId, "submitted", creator, jst(createdOn, 11, rnd.int(0, 59)));
    event(docId, "approved", approver, jst(issueOn < createdOn ? createdOn : issueOn, 9, rnd.int(0, 30)));
    return { approver: approver as string | null, note: null as string | null };
  };

  const newDoc = (p: {
    kind: DocKind; status: DocStatus; client: ClientSeed; title: string; lines: DraftLine[]; creator: string;
    issueDate: string | null; createdOn: string; sourceId?: string | null; recurringId?: string | null; notes?: string | null;
  }): Doc => {
    const id = newId();
    const totals = calcTotals(p.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price, taxRate: l.tax_rate })), ROUNDING);
    const issued = p.status === "issued" || p.status === "accepted" || p.status === "void";
    const c = p.client;
    const terms = { closingDay: c.terms[0], payMonthOffset: c.terms[1], payDay: c.terms[2] };
    const row: Row = {
      id, company_id: companyId, kind: p.kind, status: p.status, number: null, client_id: clientIds.get(c.code)!,
      title: p.title, issue_date: p.issueDate,
      due_date: p.kind === "invoice" && p.issueDate ? calcDueDate(p.issueDate, terms) : null,
      valid_until: p.kind === "quote" && p.issueDate ? addDays(p.issueDate, 30) : null,
      notes: p.notes ?? (p.kind === "invoice" ? settings.default_invoice_notes : settings.default_quote_notes),
      client_snapshot: issued ? clientSnapshot(c) : null,
      issuer_snapshot: issued ? settingsSnapshot : null,
      rounding: ROUNDING,
      subtotal: totals.subtotal, taxable_10: totals.taxable10, tax_10: totals.tax10, taxable_8: totals.taxable8, tax_8: totals.tax8,
      taxable_0: totals.taxable0, tax_total: totals.taxTotal, total: totals.total, paid_amount: 0, last_paid_on: null,
      source_id: p.sourceId ?? null, recurring_id: p.recurringId ?? null,
      created_by: p.creator, updated_by: p.creator, submitted_at: null, approved_by: null, approved_at: null,
      issued_by: null, issued_at: null, sent_at: null, voided_by: null, voided_at: null, void_reason: null,
      version: 1, created_at: jst(p.createdOn, 9), updated_at: jst(p.createdOn, 9),
    };
    const doc: Doc = { row, lines: p.lines, sortKey: `${p.issueDate ?? "9999"}-${p.createdOn}-${id}` };
    docs.push(doc);
    if (issued && p.issueDate) {
      const flow = approvalFlow(id, p.creator, totals.total, p.createdOn, p.issueDate);
      const issuer = flow.approver && roleOf(p.creator) === "viewer" ? flow.approver : p.creator;
      row.approved_by = flow.approver;
      row.approved_at = flow.approver ? jst(p.issueDate, 9, 30) : null;
      row.submitted_at = flow.approver ? jst(p.createdOn, 11) : null;
      row.issued_by = issuer;
      row.issued_at = jst(p.issueDate, 10, rnd.int(0, 59));
      row.sent_at = jst(p.issueDate, 10 + rnd.int(1, 5), rnd.int(0, 59));
      row.updated_at = row.sent_at;
      event(id, "issued", issuer, row.issued_at as Date, flow.note);
      event(id, "sent", issuer, row.sent_at as Date);
    }
    return doc;
  };

  /** 支払いの記録（期限との関係で、期限内・遅れ・未入金・一部入金を作る） */
  const settle = (doc: Doc, c: ClientSeed) => {
    const row = doc.row;
    const issue = row.issue_date as string;
    const due = row.due_date as string;
    const total = row.total as number;
    const method: PaymentMethod = c.honorific === "様" ? rnd.pick(["bank", "cash"] as const) : "bank";
    const pay = (amount: number, on: string) => {
      const id = newId();
      const receipt = method === "cash" || rnd.chance(0.08);
      payments.push({
        id, company_id: companyId, invoice_id: row.id, paid_on: on, amount, method, note: null,
        receipt_number: receipt ? "pending" : null, receipt_issued_at: receipt ? jst(on, 15) : null,
        created_by: staff.approver, created_at: jst(on, 14, rnd.int(0, 59)),
      });
      row.paid_amount = (row.paid_amount as number) + amount;
      row.last_paid_on = on;
      event(row.id as string, "payment_recorded", staff.approver, jst(on, 14), `${amount.toLocaleString("ja-JP")}円（${on.replaceAll("-", "/")}）`);
    };
    const r = rnd.next();
    if (due < today) {
      const overdueDays = (Date.parse(today) - Date.parse(due)) / 86400_000;
      if (r < c.lateRate * 3 && overdueDays < 100) return; // 期限超過（未入金）
      if (r < c.lateRate * 3 + 0.03 && overdueDays < 100) {
        const half = Math.floor(total / 2 / 1000) * 1000;
        if (half > 0) {
          pay(half, maxDate(issue, addDays(due, -rnd.int(0, 3))));
          return;
        }
      }
      const late = r < c.lateRate * 5;
      const on = late ? addDays(due, rnd.int(3, 25)) : addDays(due, -rnd.int(0, 6));
      pay(total, minDate(maxDate(issue, on), addDays(today, -1)));
    } else if (rnd.chance(0.18)) {
      const on = addDays(issue, rnd.int(5, 20));
      if (on < today) pay(total, on);
    }
  };

  const weightedClient = () => rnd.weighted(CLIENTS.filter((c) => c.code !== "C-014" || rnd.chance(0.5)), (c) => c.weight);
  const creators = [staff.member, staff.member, staff.member2, staff.member2, staff.approver, staff.admin];
  /** その月の営業日（土日を除く）からランダムに1日。今日より後にはしない */
  const businessDay = (y: number, m: number, maxDay = 28) => {
    for (let i = 0; i < 20; i++) {
      const d = monthDay(y, m, rnd.int(1, maxDay));
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6 && d <= today) return d;
    }
    return minDate(monthDay(y, m, 1), today);
  };

  // 定期請求のひな形
  const recurring: Row[] = RECURRING.map((t) => {
    const id = newId();
    const next = monthDay(ty, tm, 0);
    return {
      id, company_id: companyId, client_id: clientIds.get(t.client)!, title: t.title, interval_months: t.interval, issue_day: 0,
      next_issue_on: t.interval === 1 ? next : nextQuarterEnd(ty, tm),
      active: true,
      lines: t.items.map(([code, qty]) => {
        const l = itemLine(code, qty);
        return { item_id: l.item_id, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate };
      }),
      notes: settings.default_invoice_notes, last_generated_at: jst(monthDay(ty, tm - 1, 0), 6),
      created_by: staff.approver, created_at: jst(addDays(today, -380)), updated_at: jst(addDays(today, -380)),
    };
  });

  for (let back = 11; back >= 0; back--) {
    const y = ty + Math.floor((tm - 1 - back) / 12);
    const m = ((((tm - 1 - back) % 12) + 12) % 12) + 1;

    // 定期請求（月末発行。今月分はまだ）
    if (back > 0) {
      const issue = monthDay(y, m, 0);
      RECURRING.forEach((t, i) => {
        if (t.interval === 3 && m % 3 !== 0) return;
        const c = CLIENTS.find((x) => x.code === t.client)!;
        const doc = newDoc({
          kind: "invoice", status: "issued", client: c, title: `${t.title}（${y}年${m}月分）`,
          lines: recurring[i].lines as DraftLine[], creator: staff.approver, issueDate: issue, createdOn: issue,
          recurringId: recurring[i].id as string,
        });
        // 定期請求は自動で下書きが作られ、経理が発行する
        events.splice(events.findIndex((e) => e.document_id === doc.row.id && e.action === "created"), 1);
        event(doc.row.id as string, "generated", null, jst(issue, 6), `定期請求「${t.title}」から自動作成`);
        doc.row.created_by = null;
        doc.row.updated_by = null;
        settle(doc, c);
      });
    }

    // 案件：見積 → 受注 → 請求
    const quoteCount = rnd.int(5, 8);
    for (let q = 0; q < quoteCount; q++) {
      const c = weightedClient();
      const project = rnd.pick(PROJECTS);
      const factor = rnd.pick([0.8, 0.9, 1, 1, 1.1, 1.2, 1.5]);
      const lines = project.items.map(([code, qty]) => itemLine(code, Math.max(1, Math.round(qty * rnd.pick([1, 1, 1, 0.5, 2]))), factor));
      const qDate = businessDay(y, m, back === 0 ? 31 : 28);
      if (qDate > today) continue;
      const creator = rnd.pick(creators);
      const accepted = rnd.chance(0.65);
      const invoiceDate = addDays(qDate, rnd.int(14, 45));
      const toInvoice = accepted && invoiceDate < today;
      const quote = newDoc({
        kind: "quote", status: toInvoice ? "accepted" : "issued", client: c, title: project.title, lines, creator,
        issueDate: qDate, createdOn: addDays(qDate, -rnd.int(0, 2)),
      });
      if (!toInvoice) continue;
      event(quote.row.id as string, "converted", creator, jst(invoiceDate, 9), "請求書の下書きを作成");
      const inv = newDoc({
        kind: "invoice", status: "issued", client: c, title: project.title, lines, creator, issueDate: invoiceDate,
        createdOn: invoiceDate, sourceId: quote.row.id as string,
      });
      settle(inv, c);
    }

    // 単発の請求（見積なし）
    const spotCount = rnd.int(2, 4);
    for (let s = 0; s < spotCount; s++) {
      const c = weightedClient();
      const kind = rnd.pick([["DSN-002", rnd.int(2, 6)], ["WEB-003", rnd.int(1, 3)], ["PHT-001", 1], ["DSN-004", rnd.int(2, 8)]] as const);
      const lines = [itemLine(kind[0], kind[1])];
      if (rnd.chance(0.3)) lines.push(itemLine("EXP-001", 1));
      const date = businessDay(y, m, back === 0 ? 31 : 28);
      if (date > today) continue;
      const inv = newDoc({
        kind: "invoice", status: "issued", client: c, title: lines[0].description, lines, creator: rnd.pick(creators),
        issueDate: date, createdOn: date,
      });
      settle(inv, c);
    }
  }

  // 取り消しの例（金額の誤りで取り消し → 正しい金額で再発行）
  {
    const c = CLIENTS[1];
    const date = businessDay(ty, tm - 1);
    const wrong = [itemLine("WEB-003", 5), itemLine("EXP-001", 1)];
    const voided = newDoc({ kind: "invoice", status: "void", client: c, title: "ページ追加・更新", lines: wrong, creator: staff.member, issueDate: date, createdOn: date });
    voided.row.voided_by = staff.approver;
    voided.row.voided_at = jst(addDays(date, 1), 11);
    voided.row.void_reason = "数量の誤り（5ページ→3ページ）のため。正しい請求書を再発行しました";
    event(voided.row.id as string, "voided", staff.approver, voided.row.voided_at as Date, voided.row.void_reason as string);
    const fixed = newDoc({
      kind: "invoice", status: "issued", client: c, title: "ページ追加・更新", lines: [itemLine("WEB-003", 3), itemLine("EXP-001", 1)],
      creator: staff.member, issueDate: addDays(date, 1), createdOn: addDays(date, 1), sourceId: voided.row.id as string,
    });
    settle(fixed, c);
  }

  // ---- 今月の作業中の書類（承認待ち・差し戻し・下書き）----
  const recent = (days: number) => maxDate(addDays(today, -days), monthDay(ty, tm, 1));
  const work = (p: { kind: DocKind; status: DocStatus; client: string; title: string; items: [string, number][]; creator: string; created: string; factor?: number }) => {
    const c = CLIENTS.find((x) => x.code === p.client)!;
    const doc = newDoc({
      kind: p.kind, status: p.status, client: c, title: p.title, lines: p.items.map(([code, qty]) => itemLine(code, qty, p.factor ?? 1)),
      creator: p.creator, issueDate: p.status === "draft" ? null : today, createdOn: p.created,
    });
    if (p.status === "pending" || p.status === "approved") doc.row.issue_date = null;
    event(doc.row.id as string, "created", p.creator, jst(p.created, 9, 10));
    return doc;
  };
  const p1 = work({ kind: "invoice", status: "pending", client: "C-001", title: "コーポレートサイト リニューアル（第1期）", items: [["MTG-001", 1], ["WEB-001", 1], ["PHT-001", 2], ["PHT-002", 30]], creator: staff.member, created: recent(1), factor: 1.5 });
  event(p1.row.id as string, "submitted", staff.member, jst(recent(1), 15), "第1期分です。検収書は共有フォルダにあります。");
  p1.row.submitted_at = jst(recent(1), 15);
  const p2 = work({ kind: "quote", status: "pending", client: "C-009", title: "予約サイト リニューアル", items: [["MTG-001", 1], ["WEB-001", 1], ["WEB-002", 1]], creator: staff.member2, created: recent(0) });
  event(p2.row.id as string, "submitted", staff.member2, jst(recent(0), 11));
  p2.row.submitted_at = jst(recent(0), 11);
  const p3 = work({ kind: "invoice", status: "pending", client: "C-013", title: "医院案内パンフレット制作", items: [["DSN-003", 1], ["PHT-001", 1], ["EXP-001", 1]], creator: staff.member, created: recent(2) });
  event(p3.row.id as string, "submitted", staff.member, jst(recent(2), 16));
  p3.row.submitted_at = jst(recent(2), 16);
  const a1 = work({ kind: "invoice", status: "approved", client: "C-005", title: "キャンペーンバナー制作", items: [["DSN-002", 10], ["PHT-002", 10]], creator: staff.member2, created: recent(3) });
  event(a1.row.id as string, "submitted", staff.member2, jst(recent(3), 13));
  event(a1.row.id as string, "approved", staff.approver, jst(recent(2), 10), "確認しました。発行をお願いします。");
  Object.assign(a1.row, { submitted_at: jst(recent(3), 13), approved_by: staff.approver, approved_at: jst(recent(2), 10) });
  const r1 = work({ kind: "invoice", status: "draft", client: "C-004", title: "採用ページ追加", items: [["WEB-003", 4], ["PHT-001", 1], ["EXP-001", 1]], creator: staff.member, created: recent(4) });
  event(r1.row.id as string, "submitted", staff.member, jst(recent(4), 14));
  event(r1.row.id as string, "rejected", staff.approver, jst(recent(3), 10), "撮影は見積に含まれていません。見積書の内容と明細を合わせてください。");
  work({ kind: "quote", status: "draft", client: "C-015", title: "展示会用ツール制作", items: [["DSN-003", 1], ["DSN-002", 3], ["EXP-002", 1]], creator: staff.member2, created: recent(0) });
  work({ kind: "invoice", status: "draft", client: "C-014", title: "ロゴデザイン", items: [["DSN-001", 1], ["DSN-004", 1]], creator: staff.admin, created: recent(1) });

  // ---- 番号（発行日の順に、種類・年ごとの連番）----
  docs.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  const counters = new Map<string, number>();
  const prefix: Record<string, string> = { quote: "QT", invoice: "INV", receipt: "RC" };
  for (const d of docs) {
    if (!["issued", "accepted", "void"].includes(d.row.status as string)) continue;
    const year = Number((d.row.issue_date as string).slice(0, 4));
    const key = `${d.row.kind}:${year}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    d.row.number = `${prefix[d.row.kind as string]}-${year}-${String(n).padStart(4, "0")}`;
  }
  payments.sort((a, b) => ((a.paid_on as string) < (b.paid_on as string) ? -1 : 1));
  for (const p of payments) {
    if (p.receipt_number !== "pending") continue;
    const year = Number((p.paid_on as string).slice(0, 4));
    const key = `receipt:${year}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    p.receipt_number = `RC-${year}-${String(n).padStart(4, "0")}`;
    const docId = p.invoice_id as string;
    event(docId, "receipt_issued", staff.approver, p.receipt_issued_at as Date, p.receipt_number as string);
  }

  const lines: Row[] = [];
  for (const d of docs) {
    d.lines.forEach((l, i) => {
      lines.push({
        company_id: companyId, document_id: d.row.id, position: i + 1, item_id: l.item_id, description: l.description,
        quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate,
        amount: lineAmount({ quantity: l.quantity, unitPrice: l.unit_price, taxRate: l.tax_rate }, ROUNDING),
      });
    });
  }
  // 見積（元の書類）を先に登録する（source_id の参照のため）
  const documents = docs.map((d) => d.row).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "quote" ? -1 : 1));
  const voidFirst = documents.filter((d) => d.status === "void");
  const ordered = [...documents.filter((d) => d.kind === "quote"), ...voidFirst, ...documents.filter((d) => d.kind === "invoice" && d.status !== "void")];

  return {
    users, company, settings, profiles, clients, items, recurring,
    documents: ordered,
    lines,
    events: events.sort((a, b) => (a.created_at as Date).getTime() - (b.created_at as Date).getTime()),
    payments,
    counters: [...counters.entries()].map(([key, last]) => {
      const [kind, year] = key.split(":");
      return { company_id: companyId, kind, year: Number(year), last_value: last };
    }),
    staff,
  };
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}
function minDate(a: string, b: string) {
  return a < b ? a : b;
}
function nextQuarterEnd(y: number, m: number) {
  const q = Math.ceil(m / 3) * 3;
  return monthDay(y, q, 0);
}
