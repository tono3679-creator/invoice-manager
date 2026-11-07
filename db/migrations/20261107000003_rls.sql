-- 行レベルセキュリティ（RLS）と権限
--
-- * どの表も「自分の会社（current_company_id()）」の行しか見えない
-- * 取引先・品目・定期請求：作成者以上が登録・編集、承認者以上が削除
-- * 会社の設定：管理者だけが変更
-- * 書類・明細・履歴・入金・採番：表への直接の書き込みはできない（20261107000002 の関数だけが書く）
-- * 閲覧のみ（viewer）は見るだけ
-- bootstrap.sql の「新しい表・関数に全権限」をここで締め直し、必要なものだけ許可する。
-- 許可の一覧は tests/db/privileges.test.ts で固定している。

alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.items enable row level security;
alter table public.recurring_templates enable row level security;
alter table public.documents enable row level security;
alter table public.document_lines enable row level security;
alter table public.document_events enable row level security;
alter table public.payments enable row level security;
alter table public.number_counters enable row level security;

-- まず全部取り上げる
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
alter default privileges in schema app_private revoke all on functions from public;

-- 読み取り（ログイン中の利用者のみ）
grant select on public.companies, public.company_settings, public.profiles, public.clients, public.items,
  public.recurring_templates, public.documents, public.document_lines, public.document_events, public.payments
  to authenticated;

-- マスタの書き込み（列を限定する）
grant insert (company_id, code, name, honorific, department, contact_name, email, phone, postal_code, address,
              closing_day, pay_month_offset, pay_day, notes)
  on public.clients to authenticated;
grant update (code, name, honorific, department, contact_name, email, phone, postal_code, address,
              closing_day, pay_month_offset, pay_day, notes, archived_at)
  on public.clients to authenticated;
grant delete on public.clients to authenticated;

grant insert (company_id, code, name, unit, unit_price, tax_rate, description) on public.items to authenticated;
grant update (code, name, unit, unit_price, tax_rate, description, archived_at) on public.items to authenticated;
grant delete on public.items to authenticated;

grant insert (company_id, client_id, title, interval_months, issue_day, next_issue_on, active, lines, notes, created_by)
  on public.recurring_templates to authenticated;
grant update (client_id, title, interval_months, issue_day, next_issue_on, active, lines, notes)
  on public.recurring_templates to authenticated;
grant delete on public.recurring_templates to authenticated;

grant update (legal_name, postal_code, address, phone, email, registration_number, bank_account, rounding,
              approval_threshold, quote_valid_days, invoice_prefix, quote_prefix, receipt_prefix,
              default_invoice_notes, default_quote_notes, show_seal, seal_text)
  on public.company_settings to authenticated;
grant update (name) on public.companies to authenticated;
grant update (role, display_name, title) on public.profiles to authenticated;

-- 関数（業務の操作）
grant execute on function
  public.current_company_id(), public.current_app_role(),
  public.round_yen(numeric, public.rounding_mode), public.month_day(date, integer),
  public.calc_due_date(date, integer, integer, integer), public.next_recurring_date(date, integer, integer),
  public.save_document(uuid, public.doc_kind, jsonb, integer), public.delete_draft(uuid),
  public.duplicate_document(uuid, public.doc_kind), public.submit_document(uuid, integer, text),
  public.withdraw_document(uuid), public.approve_document(uuid, text), public.reject_document(uuid, text),
  public.issue_document(uuid, integer), public.mark_document_sent(uuid), public.void_document(uuid, text),
  public.convert_quote_to_invoice(uuid),
  public.record_payment(uuid, date, bigint, public.payment_method, text), public.delete_payment(uuid),
  public.issue_receipt(uuid), public.run_recurring_now()
  to authenticated;

-- ---------------------------------------------------------------
-- ポリシー
-- ---------------------------------------------------------------
create policy companies_read on public.companies for select to authenticated using (id = public.current_company_id());
create policy companies_update on public.companies for update to authenticated
  using (id = public.current_company_id() and public.current_app_role() = 'admin')
  with check (id = public.current_company_id());

create policy settings_read on public.company_settings for select to authenticated using (company_id = public.current_company_id());
create policy settings_update on public.company_settings for update to authenticated
  using (company_id = public.current_company_id() and public.current_app_role() = 'admin')
  with check (company_id = public.current_company_id());

create policy profiles_read on public.profiles for select to authenticated using (company_id = public.current_company_id());
create policy profiles_update on public.profiles for update to authenticated
  using (company_id = public.current_company_id() and public.current_app_role() = 'admin')
  with check (company_id = public.current_company_id());

-- 取引先・品目・定期請求
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'items', 'recurring_templates'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (company_id = public.current_company_id())', t);
    execute format($p$create policy %1$s_insert on public.%1$s for insert to authenticated
      with check (company_id = public.current_company_id() and public.current_app_role() in ('admin', 'approver', 'member'))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$s for update to authenticated
      using (company_id = public.current_company_id() and public.current_app_role() in ('admin', 'approver', 'member'))
      with check (company_id = public.current_company_id())$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$s for delete to authenticated
      using (company_id = public.current_company_id() and public.current_app_role() in ('admin', 'approver'))$p$, t);
  end loop;
end $$;

-- 書類・入金は読むだけ
create policy documents_read on public.documents for select to authenticated using (company_id = public.current_company_id());
create policy lines_read on public.document_lines for select to authenticated using (company_id = public.current_company_id());
create policy events_read on public.document_events for select to authenticated using (company_id = public.current_company_id());
create policy payments_read on public.payments for select to authenticated using (company_id = public.current_company_id());
