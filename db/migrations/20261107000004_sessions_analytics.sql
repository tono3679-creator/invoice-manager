-- ログインのセッション、デモの片付け、集計
--
-- * auth.sessions：Cookie にはランダムな値、DB にはその SHA-256 だけを保存する
-- * auth.rate_limits：ログインの失敗・デモの作成の回数（総当たり・大量作成の対策）
-- * invoice_balances：請求書ごとの残高と入金の状態（一覧・ダッシュボード・売掛金で同じ定義を使う）
-- * 集計関数：ダッシュボードと売掛金の数字は、ここの関数だけで出す（画面ごとに数字がずれないように）

create table if not exists auth.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on auth.sessions (user_id);
create index if not exists sessions_expires_idx on auth.sessions (expires_at);

create table if not exists auth.rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limits_bucket_idx on auth.rate_limits (bucket, created_at);
revoke all on auth.sessions, auth.rate_limits from public, anon, authenticated;
create unique index if not exists users_email_lower_idx on auth.users (lower(email)) where email is not null;

-- ---------------------------------------------------------------
-- 毎日の片付け：期限切れのデモ会社とその利用者、期限切れのセッション、古い回数の記録
-- ---------------------------------------------------------------
create or replace function app_private.demo_cleanup() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_users uuid[];
  v_count integer;
begin
  select array_agg(p.id) into v_users
    from public.profiles p join public.companies c on c.id = p.company_id
   where c.is_demo and c.demo_expires_at < now();
  delete from public.companies where is_demo and demo_expires_at < now();
  get diagnostics v_count = row_count;
  if v_users is not null then
    delete from auth.users where id = any (v_users) and is_anonymous;
  end if;
  delete from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '1 day'
     and not exists (select 1 from public.profiles p where p.id = u.id);
  delete from auth.sessions where expires_at < now();
  delete from auth.rate_limits where created_at < now() - interval '1 day';
  return v_count;
end $$;
revoke all on function app_private.demo_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 請求書の残高と入金の状態
--   paid=入金済み / partial=一部入金 / overdue=期限超過（未入金・一部入金で期限を過ぎたもの）/ unpaid=未入金
--   発行済み・受注の請求書だけ（下書き・承認待ち・取り消しは対象外）
-- ---------------------------------------------------------------
create view public.invoice_balances with (security_invoker = true) as
select d.id, d.company_id, d.client_id, d.number, d.title, d.issue_date, d.due_date, d.total, d.paid_amount,
       d.total - d.paid_amount as balance,
       case
         when d.paid_amount >= d.total then 'paid'
         when d.due_date < (now() at time zone 'Asia/Tokyo')::date then 'overdue'
         when d.paid_amount > 0 then 'partial'
         else 'unpaid'
       end as payment_state,
       greatest(0, (now() at time zone 'Asia/Tokyo')::date - d.due_date) as days_overdue
  from public.documents d
 where d.kind = 'invoice' and d.status = 'issued';
grant select on public.invoice_balances to authenticated;

/**
 * ダッシュボードの数字（ログイン中の利用者の会社。RLS が効く）
 *   p_month の月の請求額（発行日がその月の請求書の税込合計）・入金額（入金日がその月）・前月の同じ値
 *   未回収の残高・期限超過の残高と件数・承認待ちの件数・下書きの件数・今月末までに期限が来る残高
 */
create or replace function public.dashboard_summary(p_month date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with m as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_end,
           (date_trunc('month', p_month) - interval '1 month')::date as p_start
  )
  select jsonb_build_object(
    'billed', (select coalesce(sum(total), 0) from public.documents, m
                where kind = 'invoice' and status = 'issued' and issue_date >= m.m_start and issue_date < m.m_end),
    'billed_prev', (select coalesce(sum(total), 0) from public.documents, m
                where kind = 'invoice' and status = 'issued' and issue_date >= m.p_start and issue_date < m.m_start),
    'collected', (select coalesce(sum(p.amount), 0) from public.payments p, m where p.paid_on >= m.m_start and p.paid_on < m.m_end),
    'collected_prev', (select coalesce(sum(p.amount), 0) from public.payments p, m where p.paid_on >= m.p_start and p.paid_on < m.m_start),
    'outstanding', (select coalesce(sum(balance), 0) from public.invoice_balances where balance > 0),
    'outstanding_count', (select count(*) from public.invoice_balances where balance > 0),
    'overdue', (select coalesce(sum(balance), 0) from public.invoice_balances where payment_state = 'overdue'),
    'overdue_count', (select count(*) from public.invoice_balances where payment_state = 'overdue'),
    'due_this_month', (select coalesce(sum(balance), 0) from public.invoice_balances, m
                where balance > 0 and payment_state <> 'overdue' and due_date < m.m_end),
    'pending_count', (select count(*) from public.documents where status = 'pending'),
    'draft_count', (select count(*) from public.documents where status = 'draft'),
    'quotes_open', (select coalesce(sum(total), 0) from public.documents
                where kind = 'quote' and status = 'issued' and valid_until >= (now() at time zone 'Asia/Tokyo')::date),
    'quotes_open_count', (select count(*) from public.documents
                where kind = 'quote' and status = 'issued' and valid_until >= (now() at time zone 'Asia/Tokyo')::date)
  )
$$;

/** 月別の請求額と入金額（p_months か月分。p_month の月が最後） */
create or replace function public.monthly_billing(p_month date, p_months integer)
returns table (month date, billed bigint, collected bigint)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select (date_trunc('month', p_month) - make_interval(months => g))::date as month
      from generate_series(0, least(greatest(p_months, 1), 36) - 1) g
  )
  select ms.month,
         coalesce((select sum(total) from public.documents
                    where kind = 'invoice' and status = 'issued'
                      and issue_date >= ms.month and issue_date < (ms.month + interval '1 month')::date), 0)::bigint,
         coalesce((select sum(amount) from public.payments
                    where paid_on >= ms.month and paid_on < (ms.month + interval '1 month')::date), 0)::bigint
    from months ms
   order by ms.month
$$;

/**
 * 売掛金の年齢表（取引先ごと）：期限内・1〜30日超過・31〜60日超過・61日以上超過
 */
create or replace function public.receivables_aging()
returns table (client_id uuid, client_name text, invoices bigint, current_amount bigint, d1_30 bigint, d31_60 bigint, d61_plus bigint, total bigint, oldest_due date)
language sql stable security invoker set search_path = '' as $$
  select b.client_id, c.name,
         count(*),
         coalesce(sum(b.balance) filter (where b.days_overdue = 0), 0)::bigint,
         coalesce(sum(b.balance) filter (where b.days_overdue between 1 and 30), 0)::bigint,
         coalesce(sum(b.balance) filter (where b.days_overdue between 31 and 60), 0)::bigint,
         coalesce(sum(b.balance) filter (where b.days_overdue > 60), 0)::bigint,
         sum(b.balance)::bigint,
         min(b.due_date)
    from public.invoice_balances b join public.clients c on c.id = b.client_id
   where b.balance > 0
   group by b.client_id, c.name
   order by sum(b.balance) desc
$$;

grant execute on function public.dashboard_summary(date), public.monthly_billing(date, integer), public.receivables_aging() to authenticated;
