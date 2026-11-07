import "server-only";
import type { Tx } from "@/lib/db";
import type { TaxRate } from "@/lib/domain/tax";

export type ClientRow = {
  id: string; code: string; name: string; honorific: "御中" | "様"; department: string | null; contact_name: string | null;
  email: string | null; phone: string | null; postal_code: string | null; address: string | null;
  closing_day: number; pay_month_offset: number; pay_day: number; notes: string | null; archived_at: Date | null;
};
export type ClientListRow = ClientRow & { balance: number; overdue: number; billed_12m: number; last_issue: string | null };

export async function listClients(tx: Tx, opts: { q?: string; archived?: boolean } = {}): Promise<ClientListRow[]> {
  const q = opts.q?.trim();
  return tx<ClientListRow[]>`
    select c.*,
           coalesce((select sum(balance) from invoice_balances b where b.client_id = c.id), 0)::bigint balance,
           coalesce((select sum(balance) from invoice_balances b where b.client_id = c.id and b.payment_state = 'overdue'), 0)::bigint overdue,
           coalesce((select sum(total) from documents d where d.client_id = c.id and d.kind = 'invoice' and d.status = 'issued'
                      and d.issue_date >= (now() at time zone 'Asia/Tokyo')::date - 365), 0)::bigint billed_12m,
           (select max(issue_date) from documents d where d.client_id = c.id and d.kind = 'invoice' and d.status = 'issued') last_issue
      from clients c
     where (${opts.archived ?? false} = (c.archived_at is not null))
       and (${q ?? null}::text is null or c.name ilike '%' || ${q ?? ""} || '%' or c.code ilike '%' || ${q ?? ""} || '%')
     order by c.code`;
}

export async function getClient(tx: Tx, id: string): Promise<ClientRow | null> {
  const [row] = await tx<ClientRow[]>`select * from clients where id = ${id}`;
  return row ?? null;
}

/** 書類の作成画面で選べる取引先（アーカイブしたものは除く） */
export async function clientOptions(tx: Tx) {
  return tx<{ id: string; code: string; name: string; honorific: string; closing_day: number; pay_month_offset: number; pay_day: number }[]>`
    select id, code, name, honorific, closing_day, pay_month_offset, pay_day from clients where archived_at is null order by code`;
}

export type ItemRow = {
  id: string; code: string; name: string; unit: string; unit_price: number; tax_rate: TaxRate; description: string | null;
  archived_at: Date | null; used: number;
};

export async function listItems(tx: Tx, opts: { q?: string; archived?: boolean } = {}): Promise<ItemRow[]> {
  const q = opts.q?.trim();
  return tx<ItemRow[]>`
    select i.*, (select count(*)::int from document_lines l where l.item_id = i.id) used
      from items i
     where (${opts.archived ?? false} = (i.archived_at is not null))
       and (${q ?? null}::text is null or i.name ilike '%' || ${q ?? ""} || '%' or i.code ilike '%' || ${q ?? ""} || '%')
     order by i.code`;
}

export async function itemOptions(tx: Tx) {
  return tx<{ id: string; code: string; name: string; unit: string; unit_price: number; tax_rate: TaxRate }[]>`
    select id, code, name, unit, unit_price, tax_rate from items where archived_at is null order by code`;
}
