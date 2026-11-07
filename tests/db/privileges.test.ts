import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, createTenant, dropTenant, errorOf, type TestTenant } from "./helpers";

/**
 * DB の権限の一覧を固定する。権限を足したり外したりしたら、ここも意図して書き換える
 * （うっかり広げてしまうのを防ぐため）。
 */
const sql = connect();
let t: TestTenant;
beforeAll(async () => { t = await createTenant(sql, 31); });
afterAll(async () => { await dropTenant(sql, t); await sql.end(); });

describe("権限の一覧", () => {
  it("表の権限（authenticated）", async () => {
    const rows = await sql<{ g: string }[]>`
      select table_name || ':' || string_agg(privilege_type, ',' order by privilege_type) as g
      from information_schema.role_table_grants where grantee = 'authenticated' and table_schema in ('public', 'auth', 'app_private')
      group by table_schema, table_name order by 1`;
    expect(rows.map((r) => r.g)).toEqual([
      "clients:DELETE,SELECT",
      "companies:SELECT",
      "company_settings:SELECT",
      "document_events:SELECT",
      "document_lines:SELECT",
      "documents:SELECT",
      "invoice_balances:SELECT",
      "items:DELETE,SELECT",
      "payments:SELECT",
      "profiles:SELECT",
      "recurring_templates:DELETE,SELECT",
    ]);
  });

  it("列単位の書き込み権限：書類・入金・採番・セッションの表には無い", async () => {
    const rows = await sql<{ t: string }[]>`
      select distinct table_name as t from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema in ('public', 'auth') and privilege_type in ('INSERT', 'UPDATE') order by 1`;
    expect(rows.map((r) => r.t)).toEqual(["clients", "companies", "company_settings", "items", "profiles", "recurring_templates"]);
    const companies = await sql`select column_name from information_schema.column_privileges
      where grantee = 'authenticated' and table_name = 'companies' and privilege_type = 'UPDATE'`;
    expect(companies.map((r) => r.column_name)).toEqual(["name"]);
  });

  it("anon には何も許可しない。app_private の関数は authenticated から呼べない", async () => {
    const [{ n }] = await sql`select count(*)::int n from information_schema.role_table_grants where grantee = 'anon' and table_schema in ('public', 'auth', 'app_private')`;
    expect(n).toBe(0);
    const priv = await sql`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'app_private' and has_function_privilege('authenticated', p.oid, 'execute')`;
    expect(priv).toHaveLength(0);
  });

  it("authenticated が呼べる public の関数", async () => {
    const rows = await sql<{ f: string }[]>`select p.proname as f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`;
    expect(rows.map((r) => r.f)).toEqual([
      "approve_document", "calc_due_date", "convert_quote_to_invoice", "current_app_role", "current_company_id", "dashboard_summary",
      "delete_draft", "delete_payment", "duplicate_document", "issue_document", "issue_receipt", "mark_document_sent", "month_day",
      "monthly_billing", "next_recurring_date", "receivables_aging", "record_payment", "reject_document", "round_yen",
      "run_recurring_now", "save_document", "submit_document", "void_document", "withdraw_document",
    ]);
  });

  it("security definer の関数は search_path を固定している", async () => {
    const rows = await sql`select s.nspname || '.' || p.proname as f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('public', 'app_private') and p.prosecdef and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`;
    expect(rows).toEqual([]);
  });
});

describe("役割と設定", () => {
  it("管理者以外は役割や会社の設定を変えられない", async () => {
    const r1 = await as(sql, t.staff.member, (tx) => tx`update profiles set role = 'admin' where id = ${t.staff.member} returning id`);
    expect(r1).toHaveLength(0);
    const r2 = await as(sql, t.staff.approver, (tx) => tx`update company_settings set approval_threshold = 0 where company_id = ${t.companyId} returning company_id`);
    expect(r2).toHaveLength(0);
  });

  it("管理者は役割を変えられるが、最後の管理者はいなくならない", async () => {
    const r = await as(sql, t.staff.admin, (tx) => tx`update profiles set role = 'approver' where id = ${t.staff.viewer} returning id`);
    expect(r).toHaveLength(1);
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`update profiles set role = 'member' where id = ${t.staff.admin}`))).toMatch(/管理者/);
  });

  it("自分の会社の ID を書き換えられない", async () => {
    expect(await errorOf(as(sql, t.staff.admin, (tx) => tx`update profiles set company_id = gen_random_uuid() where id = ${t.staff.admin}`))).toMatch(/permission denied/);
  });
});
