import "server-only";
import type { Tx } from "@/lib/db";
import type { DocKind, DocStatus, PaymentMethod, PaymentState } from "@/lib/domain/labels";
import type { RoundingMode, TaxRate } from "@/lib/domain/tax";

export const PAGE_SIZE = 30;

export type DocumentListRow = {
  id: string; kind: DocKind; status: DocStatus; number: string | null; title: string; client_id: string; client_name: string;
  issue_date: string | null; due_date: string | null; valid_until: string | null; total: number; paid_amount: number;
  payment_state: PaymentState | null; days_overdue: number | null; created_by_name: string | null; updated_at: Date;
};

export type DocumentFilters = {
  kind: DocKind;
  status?: DocStatus | "open";
  payment?: PaymentState | "outstanding";
  clientId?: string;
  q?: string;
  month?: string; // YYYY-MM
  page?: number;
};

export async function listDocuments(tx: Tx, f: DocumentFilters): Promise<{ rows: DocumentListRow[]; total: number; sum: number }> {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim() || null;
  const monthStart = f.month && /^\d{4}-\d{2}$/.test(f.month) ? `${f.month}-01` : null;
  const status = f.status && f.status !== "open" ? f.status : null;
  const where = tx`
    d.kind = ${f.kind}
    and (${status}::doc_status is null or d.status = ${status}::doc_status)
    and (${f.status === "open"} = false or d.status in ('draft', 'pending', 'approved'))
    and (${f.clientId ?? null}::uuid is null or d.client_id = ${f.clientId ?? null}::uuid)
    and (${q}::text is null or d.title ilike '%' || ${q ?? ""} || '%' or d.number ilike '%' || ${q ?? ""} || '%' or c.name ilike '%' || ${q ?? ""} || '%')
    and (${monthStart}::date is null or (d.issue_date >= ${monthStart}::date and d.issue_date < ${monthStart}::date + interval '1 month'))
    and (${f.payment ?? null}::text is null
         or (${f.payment ?? null} = 'outstanding' and b.balance > 0)
         or b.payment_state = ${f.payment ?? null})`;
  const rows = await tx<DocumentListRow[]>`
    select d.id, d.kind, d.status, d.number, d.title, d.client_id, c.name client_name, d.issue_date, d.due_date, d.valid_until,
           d.total, d.paid_amount, b.payment_state, b.days_overdue, p.display_name created_by_name, d.updated_at
      from documents d
      join clients c on c.id = d.client_id
      left join invoice_balances b on b.id = d.id
      left join profiles p on p.id = d.created_by
     where ${where}
     order by d.issue_date desc nulls first, d.number desc nulls first, d.created_at desc
     limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;
  const [agg] = await tx<{ n: number; sum: number }[]>`
    select count(*)::int n, coalesce(sum(d.total), 0)::bigint sum
      from documents d join clients c on c.id = d.client_id left join invoice_balances b on b.id = d.id
     where ${where} and d.status <> 'void'`;
  const [all] = await tx<{ n: number }[]>`
    select count(*)::int n from documents d join clients c on c.id = d.client_id left join invoice_balances b on b.id = d.id where ${where}`;
  return { rows, total: all.n, sum: agg.sum };
}

export type DocumentLine = {
  id: string; position: number; item_id: string | null; description: string; quantity: number; unit: string;
  unit_price: number; tax_rate: TaxRate; amount: number;
};

export type PartySnapshot = Record<string, string | boolean | null>;

export type DocumentDetail = {
  id: string; kind: DocKind; status: DocStatus; number: string | null; title: string; client_id: string;
  issue_date: string | null; due_date: string | null; valid_until: string | null; notes: string | null;
  client_snapshot: PartySnapshot | null; issuer_snapshot: PartySnapshot | null; rounding: RoundingMode;
  subtotal: number; taxable_10: number; tax_10: number; taxable_8: number; tax_8: number; taxable_0: number; tax_total: number; total: number;
  paid_amount: number; last_paid_on: string | null; source_id: string | null; recurring_id: string | null;
  created_by: string | null; updated_by: string | null; approved_by: string | null; approved_at: Date | null;
  issued_at: Date | null; sent_at: Date | null; voided_at: Date | null; void_reason: string | null; version: number;
  created_at: Date; updated_at: Date;
  created_by_name: string | null; approved_by_name: string | null;
  payment_state: PaymentState | null; days_overdue: number | null;
};

export type DocumentEvent = { id: number; action: string; actor_name: string | null; comment: string | null; created_at: Date };
export type PaymentRow = {
  id: string; paid_on: string; amount: number; method: PaymentMethod; note: string | null; receipt_number: string | null;
  created_by_name: string | null; created_at: Date;
};
export type RelatedDoc = { id: string; kind: DocKind; status: DocStatus; number: string | null; title: string; total: number; relation: "source" | "derived" };

export async function getDocument(tx: Tx, id: string, kind?: DocKind) {
  const [doc] = await tx<DocumentDetail[]>`
    select d.*, pc.display_name created_by_name, pa.display_name approved_by_name, b.payment_state, b.days_overdue
      from documents d
      left join profiles pc on pc.id = d.created_by
      left join profiles pa on pa.id = d.approved_by
      left join invoice_balances b on b.id = d.id
     where d.id = ${id} and (${kind ?? null}::doc_kind is null or d.kind = ${kind ?? null}::doc_kind)`;
  if (!doc) return null;
  const [lines, events, payments, related, client] = await Promise.all([
    tx<DocumentLine[]>`select * from document_lines where document_id = ${id} order by position`,
    tx<DocumentEvent[]>`
      select e.id, e.action, p.display_name actor_name, e.comment, e.created_at
        from document_events e left join profiles p on p.id = e.actor where e.document_id = ${id} order by e.id desc`,
    tx<PaymentRow[]>`
      select pm.id, pm.paid_on, pm.amount, pm.method, pm.note, pm.receipt_number, p.display_name created_by_name, pm.created_at
        from payments pm left join profiles p on p.id = pm.created_by where pm.invoice_id = ${id} order by pm.paid_on, pm.created_at`,
    tx<RelatedDoc[]>`
      select id, kind, status, number, title, total, 'source' relation from documents where id = ${doc.source_id}
      union all
      select id, kind, status, number, title, total, 'derived' relation from documents where source_id = ${id}`,
    tx<{ name: string; honorific: string; department: string | null; contact_name: string | null; postal_code: string | null; address: string | null;
      closing_day: number; pay_month_offset: number; pay_day: number; archived_at: Date | null }[]>`
      select name, honorific, department, contact_name, postal_code, address, closing_day, pay_month_offset, pay_day, archived_at
        from clients where id = ${doc.client_id}`,
  ]);
  return { doc, lines, events, payments, related, client: client[0] };
}

export type IssuerSettings = {
  legal_name: string; postal_code: string | null; address: string | null; phone: string | null; email: string | null;
  registration_number: string | null; bank_account: string | null; show_seal: boolean; seal_text: string | null;
  rounding: RoundingMode; approval_threshold: number; quote_valid_days: number;
  default_invoice_notes: string | null; default_quote_notes: string | null;
  invoice_prefix: string; quote_prefix: string; receipt_prefix: string;
};

export async function getIssuerSettings(tx: Tx): Promise<IssuerSettings> {
  const [row] = await tx<IssuerSettings[]>`select * from company_settings`;
  return row;
}

/** 承認待ちの書類（承認画面） */
export async function listPending(tx: Tx) {
  return tx<(DocumentListRow & { submitted_at: Date; created_by: string | null; updated_by: string | null; comment: string | null })[]>`
    select d.id, d.kind, d.status, d.number, d.title, d.client_id, c.name client_name, d.issue_date, d.due_date, d.valid_until,
           d.total, d.paid_amount, null payment_state, null days_overdue, p.display_name created_by_name, d.updated_at,
           d.submitted_at, d.created_by, d.updated_by,
           (select e.comment from document_events e where e.document_id = d.id and e.action = 'submitted' order by e.id desc limit 1) comment
      from documents d join clients c on c.id = d.client_id left join profiles p on p.id = d.created_by
     where d.status = 'pending'
     order by d.submitted_at`;
}

/** 自分の書類で、承認済み（発行待ち）・差し戻されたもの */
export async function listMyWork(tx: Tx, userId: string) {
  return tx<(DocumentListRow & { last_action: string; last_comment: string | null; last_actor: string | null })[]>`
    select d.id, d.kind, d.status, d.number, d.title, d.client_id, c.name client_name, d.issue_date, d.due_date, d.valid_until,
           d.total, d.paid_amount, null payment_state, null days_overdue, null created_by_name, d.updated_at,
           e.action last_action, e.comment last_comment, pa.display_name last_actor
      from documents d
      join clients c on c.id = d.client_id
      join lateral (select * from document_events e where e.document_id = d.id order by e.id desc limit 1) e on true
      left join profiles pa on pa.id = e.actor
     where d.created_by = ${userId}
       and (d.status = 'approved' or (d.status = 'draft' and e.action = 'rejected'))
     order by d.updated_at desc`;
}
