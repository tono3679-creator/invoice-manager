-- 請求書作成システムの表
--
-- 会社（companies）ごとにデータを分ける（マルチテナント）。すべての業務データは company_id を持ち、
-- RLS で「ログイン中の利用者の会社」のものだけが見える（20261107000003_rls.sql）。
-- 金額はすべて円単位の整数（bigint）。単価は税抜き。

create type public.app_role as enum ('admin', 'approver', 'member', 'viewer');
comment on type public.app_role is 'admin=管理者 / approver=承認者 / member=作成者 / viewer=閲覧のみ';

create type public.doc_kind as enum ('quote', 'invoice');
create type public.doc_status as enum ('draft', 'pending', 'approved', 'issued', 'accepted', 'void');
comment on type public.doc_status is
  'draft=下書き / pending=承認待ち / approved=承認済み / issued=発行済み / accepted=受注（見積のみ） / void=取り消し';
create type public.rounding_mode as enum ('floor', 'round', 'ceil');
create type public.payment_method as enum ('bank', 'cash', 'card', 'other');

-- ---------------------------------------------------------------
-- 会社と利用者
-- ---------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  is_demo boolean not null default false,
  is_showcase boolean not null default false,
  demo_owner uuid references auth.users (id) on delete set null,
  demo_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (not is_demo or demo_expires_at is not null)
);
create index companies_demo_idx on public.companies (demo_expires_at) where is_demo;

create table public.company_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  legal_name text not null check (length(legal_name) between 1 and 100),
  postal_code text check (postal_code ~ '^\d{3}-\d{4}$'),
  address text check (length(address) <= 200),
  phone text check (length(phone) <= 30),
  email text check (length(email) <= 200),
  -- 適格請求書発行事業者の登録番号（T + 13桁）。未登録の会社は空
  registration_number text check (registration_number ~ '^T\d{13}$'),
  bank_account text check (length(bank_account) <= 300),
  rounding public.rounding_mode not null default 'floor',
  -- この金額（税込）以上の書類は、作成者以外の承認者の承認が必要。作成者（member）の書類は金額にかかわらず承認が必要
  approval_threshold bigint not null default 300000 check (approval_threshold >= 0),
  quote_valid_days integer not null default 30 check (quote_valid_days between 1 and 365),
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  quote_prefix text not null default 'QT' check (quote_prefix ~ '^[A-Z0-9]{1,8}$'),
  receipt_prefix text not null default 'RC' check (receipt_prefix ~ '^[A-Z0-9]{1,8}$'),
  default_invoice_notes text check (length(default_invoice_notes) <= 1000),
  default_quote_notes text check (length(default_quote_notes) <= 1000),
  -- 社印（角印）を PDF に載せるか。印影は会社名から自動で描く（画像のアップロードは不要）
  show_seal boolean not null default true,
  seal_text text check (length(seal_text) between 1 and 12),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role public.app_role not null,
  display_name text not null check (length(display_name) between 1 and 50),
  title text check (length(title) <= 50),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index profiles_company_idx on public.profiles (company_id);

-- ---------------------------------------------------------------
-- 取引先・品目
-- ---------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9-]{1,20}$'),
  name text not null check (length(name) between 1 and 100),
  honorific text not null default '御中' check (honorific in ('御中', '様')),
  department text check (length(department) <= 100),
  contact_name text check (length(contact_name) <= 50),
  email text check (length(email) <= 200),
  phone text check (length(phone) <= 30),
  postal_code text check (postal_code ~ '^\d{3}-\d{4}$'),
  address text check (length(address) <= 200),
  -- 支払条件：締め日（0=月末、1〜28日）・支払月（0=当月、1=翌月…）・支払日（0=月末、1〜28日）
  closing_day smallint not null default 0 check (closing_day between 0 and 28),
  pay_month_offset smallint not null default 1 check (pay_month_offset between 0 and 3),
  pay_day smallint not null default 0 check (pay_day between 0 and 28),
  notes text check (length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);
create index clients_name_trgm_idx on public.clients using gin (name extensions.gin_trgm_ops);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9-]{1,20}$'),
  name text not null check (length(name) between 1 and 100),
  unit text not null default '式' check (length(unit) between 1 and 10),
  unit_price bigint not null check (unit_price between -100000000 and 100000000),
  tax_rate smallint not null default 10 check (tax_rate in (10, 8, 0)),
  description text check (length(description) <= 300),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

-- ---------------------------------------------------------------
-- 定期請求のひな形（毎月・3か月ごと…に請求書の下書きを自動で作る）
-- ---------------------------------------------------------------
create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  title text not null check (length(title) between 1 and 100),
  interval_months smallint not null default 1 check (interval_months in (1, 2, 3, 6, 12)),
  -- 発行日（0=月末、1〜28日）
  issue_day smallint not null default 0 check (issue_day between 0 and 28),
  next_issue_on date not null,
  active boolean not null default true,
  -- 明細：[{description, quantity, unit, unit_price, tax_rate, item_id?}]
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 50),
  notes text check (length(notes) <= 1000),
  last_generated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, client_id) references public.clients (company_id, id)
);

-- ---------------------------------------------------------------
-- 見積書・請求書
-- ---------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.doc_kind not null,
  status public.doc_status not null default 'draft',
  -- 書類番号は発行したときに採番する（下書きには番号がない＝欠番が出ない）
  number text,
  client_id uuid not null,
  title text not null check (length(title) between 1 and 100),
  issue_date date,
  due_date date,          -- 請求書：支払期限
  valid_until date,       -- 見積書：有効期限
  notes text check (length(notes) <= 1000),
  -- 発行した時点の宛先・発行元（あとで取引先や会社情報を変えても、発行済みの書類は変わらない）
  client_snapshot jsonb,
  issuer_snapshot jsonb,
  rounding public.rounding_mode not null,
  -- 金額（明細から DB が計算する。画面からは書き込めない）
  subtotal bigint not null default 0,
  taxable_10 bigint not null default 0,
  tax_10 bigint not null default 0,
  taxable_8 bigint not null default 0,
  tax_8 bigint not null default 0,
  taxable_0 bigint not null default 0,
  tax_total bigint not null default 0,
  total bigint not null default 0,
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  last_paid_on date,
  source_id uuid references public.documents (id) on delete set null,
  recurring_id uuid references public.recurring_templates (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  sent_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  voided_at timestamptz,
  void_reason text check (length(void_reason) <= 300),
  -- 同時編集の検出（保存のたびに 1 増える）
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, kind, number),
  foreign key (company_id, client_id) references public.clients (company_id, id),
  check (paid_amount <= greatest(total, 0)),
  check ((number is null) = (status in ('draft', 'pending', 'approved'))),
  check (kind = 'invoice' or (due_date is null and paid_amount = 0)),
  check (kind = 'quote' or valid_until is null),
  check (status <> 'accepted' or kind = 'quote'),
  check (status <> 'void' or (voided_at is not null and void_reason is not null))
);
create index documents_list_idx on public.documents (company_id, kind, issue_date desc nulls first, created_at desc);
create index documents_client_idx on public.documents (company_id, client_id);
create index documents_status_idx on public.documents (company_id, kind, status);
create index documents_due_idx on public.documents (company_id, due_date) where kind = 'invoice' and status = 'issued';
create index documents_title_trgm_idx on public.documents using gin (title extensions.gin_trgm_ops);

create table public.document_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  document_id uuid not null,
  position smallint not null check (position between 1 and 100),
  item_id uuid,
  description text not null check (length(description) between 1 and 200),
  quantity numeric(12, 2) not null check (quantity > 0 and quantity <= 1000000),
  unit text not null check (length(unit) between 1 and 10),
  unit_price bigint not null check (unit_price between -100000000 and 100000000),
  tax_rate smallint not null check (tax_rate in (10, 8, 0)),
  amount bigint not null,
  unique (document_id, position),
  foreign key (company_id, document_id) references public.documents (company_id, id) on delete cascade,
  foreign key (company_id, item_id) references public.items (company_id, id) on delete set null (item_id)
);
create index document_lines_doc_idx on public.document_lines (document_id, position);

-- 書類の履歴（作成・承認・差し戻し・発行・入金…）。承認の記録を兼ねる
create table public.document_events (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  document_id uuid not null,
  action text not null check (action in (
    'created', 'updated', 'submitted', 'withdrawn', 'approved', 'rejected', 'issued', 'sent', 'voided',
    'converted', 'payment_recorded', 'payment_deleted', 'receipt_issued', 'duplicated', 'generated'
  )),
  actor uuid references auth.users (id) on delete set null,
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now(),
  foreign key (company_id, document_id) references public.documents (company_id, id) on delete cascade
);
create index document_events_doc_idx on public.document_events (document_id, id);

-- ---------------------------------------------------------------
-- 入金
-- ---------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_id uuid not null,
  paid_on date not null,
  amount bigint not null check (amount > 0),
  method public.payment_method not null default 'bank',
  note text check (length(note) <= 200),
  -- 領収書を発行したときに採番する
  receipt_number text,
  receipt_issued_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, receipt_number),
  foreign key (company_id, invoice_id) references public.documents (company_id, id) on delete cascade
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_company_date_idx on public.payments (company_id, paid_on desc);

-- 採番（会社・種類・年ごとの連番）
create table public.number_counters (
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice', 'receipt')),
  year integer not null,
  last_value integer not null default 0,
  primary key (company_id, kind, year)
);
