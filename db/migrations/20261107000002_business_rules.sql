-- 業務ルール。書類（見積書・請求書）と入金の書き込みは、すべてこのファイルの関数を通す
-- （表への直接の書き込みは 20261107000003_rls.sql で禁止する）。
-- 関数はログイン中の利用者の権限・会社を確かめてから動く（security definer）。
-- エラーは利用者にそのまま見せられる日本語で返す（アプリの toUserMessage がそのまま表示する）。
--   42501 … 権限がない / 22023 … 入力・状態の誤り / 40001 … 同時編集（ほかの人が先に保存した）/ P0002 … 見つからない

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ---------------------------------------------------------------
-- 共通
-- ---------------------------------------------------------------
create or replace function app_private.today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

/** ログイン中の利用者の会社（RLS で使う） */
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

/** 権限の確認。許可された役割でなければ 42501 */
create or replace function app_private.require_role(p_roles public.app_role[]) returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.profiles;
begin
  select * into v from public.profiles where id = auth.uid();
  if v.id is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  if not (v.role = any (p_roles)) then
    raise exception 'この操作を行う権限がありません' using errcode = '42501';
  end if;
  return v;
end $$;

/** 端数処理（円未満）。負の金額（値引き）は絶対値で処理して符号を戻す（-10.5 円の切り捨ては -10 円） */
create or replace function public.round_yen(p_value numeric, p_mode public.rounding_mode) returns bigint
language sql immutable set search_path = '' as $$
  select (sign(p_value) * case p_mode
    when 'floor' then floor(abs(p_value))
    when 'ceil' then ceil(abs(p_value))
    else round(abs(p_value))
  end)::bigint
$$;

/** その月の day 日（0 は月末。月の日数を超えるときも月末） */
create or replace function public.month_day(p_month date, p_day integer) returns date
language sql immutable set search_path = '' as $$
  select case
    when p_day = 0 then (date_trunc('month', p_month) + interval '1 month - 1 day')::date
    else least(
      (date_trunc('month', p_month) + make_interval(days => p_day - 1))::date,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date)
  end
$$;

/**
 * 支払期限：発行日の後の最初の締め日 → その締め日の月から pay_month_offset か月後の pay_day 日。
 * 例）月末締め翌月末払い（0, 1, 0）で 2026-11-07 発行 → 2026-12-31
 *     20日締め翌月10日払い（20, 1, 10）で 2026-11-25 発行 → 締め 12/20 → 2027-01-10
 * 支払日が締め日より前になる設定（当月払いで支払日 < 締め日）のときは、1か月後ろにずらす。
 * src/lib/domain/terms.ts と同じ計算（テストで一致を確かめている）。
 */
create or replace function public.calc_due_date(p_issue date, p_closing_day integer, p_offset integer, p_pay_day integer) returns date
language plpgsql immutable set search_path = '' as $$
declare
  v_closing date;
  v_due date;
begin
  v_closing := public.month_day(p_issue, p_closing_day);
  if v_closing < p_issue then
    v_closing := public.month_day((date_trunc('month', p_issue) + interval '1 month')::date, p_closing_day);
  end if;
  v_due := public.month_day((date_trunc('month', v_closing) + make_interval(months => p_offset))::date, p_pay_day);
  if v_due < v_closing then
    v_due := public.month_day((date_trunc('month', v_due) + interval '1 month')::date, p_pay_day);
  end if;
  return v_due;
end $$;

/** 書類番号：PREFIX-2026-0001（会社・種類・年ごとの連番。同時に発行しても重ならない） */
create or replace function app_private.next_number(p_company uuid, p_kind text, p_prefix text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from p_date)::integer;
  v_next integer;
begin
  insert into public.number_counters (company_id, kind, year, last_value) values (p_company, p_kind, v_year, 1)
  on conflict (company_id, kind, year) do update set last_value = public.number_counters.last_value + 1
  returning last_value into v_next;
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end $$;

/** 書類を取得して行をロックする（会社が違えば「見つからない」） */
create or replace function app_private.lock_document(p_id uuid, p_company uuid) returns public.documents
language plpgsql security definer set search_path = '' as $$
declare
  v public.documents;
begin
  select * into v from public.documents where id = p_id and company_id = p_company for update;
  if v.id is null then
    raise exception '書類が見つかりません' using errcode = 'P0002';
  end if;
  return v;
end $$;

create or replace function app_private.check_version(p_doc public.documents, p_version integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_version is not null and p_doc.version <> p_version then
    raise exception 'ほかの人が先にこの書類を更新しました。画面を読み込み直してから、もう一度お試しください' using errcode = '40001';
  end if;
end $$;

create or replace function app_private.log_event(p_doc public.documents, p_action text, p_comment text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.document_events (company_id, document_id, action, actor, comment)
  values (p_doc.company_id, p_doc.id, p_action, auth.uid(), nullif(btrim(p_comment), ''))
$$;

/**
 * 明細から金額を計算し直す。
 *   明細の金額 = 数量 × 単価（端数処理）
 *   消費税 = 税率ごとの合計 × 税率（税率ごとに1回だけ端数処理する。インボイス制度のルール）
 * src/lib/domain/tax.ts と同じ計算（テストで一致を確かめている）。
 */
create or replace function app_private.recalc_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_mode public.rounding_mode;
  v_t10 bigint; v_t8 bigint; v_t0 bigint;
begin
  select rounding into v_mode from public.documents where id = p_id;
  update public.document_lines set amount = public.round_yen(quantity * unit_price, v_mode) where document_id = p_id;
  select coalesce(sum(amount) filter (where tax_rate = 10), 0),
         coalesce(sum(amount) filter (where tax_rate = 8), 0),
         coalesce(sum(amount) filter (where tax_rate = 0), 0)
    into v_t10, v_t8, v_t0
    from public.document_lines where document_id = p_id;
  update public.documents d set
    subtotal = v_t10 + v_t8 + v_t0,
    taxable_10 = v_t10, tax_10 = public.round_yen(v_t10 * 0.10, v_mode),
    taxable_8 = v_t8, tax_8 = public.round_yen(v_t8 * 0.08, v_mode),
    taxable_0 = v_t0,
    tax_total = public.round_yen(v_t10 * 0.10, v_mode) + public.round_yen(v_t8 * 0.08, v_mode),
    total = v_t10 + v_t8 + v_t0 + public.round_yen(v_t10 * 0.10, v_mode) + public.round_yen(v_t8 * 0.08, v_mode)
  where d.id = p_id;
end $$;

/** 発行・承認依頼の前の確認（明細があり、合計が正、税率ごとの合計が負でない） */
create or replace function app_private.check_ready(p_doc public.documents) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.document_lines where document_id = p_doc.id) then
    raise exception '明細を1行以上入力してください' using errcode = '22023';
  end if;
  if p_doc.total <= 0 then
    raise exception '合計金額が0円以下の書類は発行できません' using errcode = '22023';
  end if;
  if p_doc.taxable_10 < 0 or p_doc.taxable_8 < 0 or p_doc.taxable_0 < 0 then
    raise exception '値引きが大きすぎます（税率ごとの合計がマイナスになっています）' using errcode = '22023';
  end if;
  if exists (select 1 from public.clients where id = p_doc.client_id and archived_at is not null) then
    raise exception '取引先がアーカイブされています。取引先を元に戻すか、別の取引先を選んでください' using errcode = '22023';
  end if;
end $$;

/** 承認が必要か：作成者（member）の書類は常に、それ以外は合計が基準額以上のとき */
create or replace function app_private.approval_required(p_doc public.documents, p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_role = 'member'
      or p_doc.total >= (select approval_threshold from public.company_settings where company_id = p_doc.company_id)
$$;

-- ---------------------------------------------------------------
-- 書類の作成・編集（下書きのみ）
-- ---------------------------------------------------------------
/**
 * 書類を保存する（新規または下書きの更新）。明細はまとめて置き換える。
 *   p_data: { client_id, title, issue_date?, due_date?, valid_until?, notes?, lines: [{ item_id?, description, quantity, unit, unit_price, tax_rate }] }
 *   p_version: 画面を開いたときの version（新規は null）。違っていたら同時編集として断る
 */
create or replace function public.save_document(p_id uuid, p_kind public.doc_kind, p_data jsonb, p_version integer)
returns table (id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents;
  v_client uuid := (p_data ->> 'client_id')::uuid;
  v_lines jsonb := coalesce(p_data -> 'lines', '[]'::jsonb);
  v_line jsonb;
  v_pos integer := 0;
begin
  if not exists (select 1 from public.clients c where c.id = v_client and c.company_id = me.company_id and c.archived_at is null) then
    raise exception '取引先を選んでください' using errcode = '22023';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) > 100 then
    raise exception '明細は100行までです' using errcode = '22023';
  end if;
  if nullif(btrim(p_data ->> 'title'), '') is null then
    raise exception '件名を入力してください' using errcode = '22023';
  end if;
  if (p_data ->> 'due_date') is not null and (p_data ->> 'issue_date') is not null
     and (p_data ->> 'due_date')::date < (p_data ->> 'issue_date')::date then
    raise exception '支払期限は発行日以降にしてください' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.documents (company_id, kind, client_id, title, issue_date, due_date, valid_until, notes, rounding, created_by, updated_by)
    values (me.company_id, p_kind, v_client, btrim(p_data ->> 'title'),
            (p_data ->> 'issue_date')::date,
            case when p_kind = 'invoice' then (p_data ->> 'due_date')::date end,
            case when p_kind = 'quote' then (p_data ->> 'valid_until')::date end,
            nullif(p_data ->> 'notes', ''),
            (select s.rounding from public.company_settings s where s.company_id = me.company_id),
            me.id, me.id)
    returning * into v;
    perform app_private.log_event(v, 'created');
  else
    v := app_private.lock_document(p_id, me.company_id);
    perform app_private.check_version(v, p_version);
    if v.status <> 'draft' then
      raise exception '下書き以外の書類は編集できません（承認待ちは取り下げてから編集してください）' using errcode = '22023';
    end if;
    update public.documents d set
      client_id = v_client, title = btrim(p_data ->> 'title'),
      issue_date = (p_data ->> 'issue_date')::date,
      due_date = case when v.kind = 'invoice' then (p_data ->> 'due_date')::date end,
      valid_until = case when v.kind = 'quote' then (p_data ->> 'valid_until')::date end,
      notes = nullif(p_data ->> 'notes', ''),
      updated_by = me.id, updated_at = now(), version = d.version + 1
    where d.id = v.id
    returning * into v;
    delete from public.document_lines l where l.document_id = v.id;
    perform app_private.log_event(v, 'updated');
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_pos := v_pos + 1;
    if nullif(btrim(v_line ->> 'description'), '') is null then
      raise exception '%行目：品名を入力してください', v_pos using errcode = '22023';
    end if;
    if coalesce((v_line ->> 'quantity')::numeric, 0) <= 0 then
      raise exception '%行目：数量は0より大きくしてください', v_pos using errcode = '22023';
    end if;
    if (v_line ->> 'tax_rate')::smallint not in (10, 8, 0) then
      raise exception '%行目：税率は10%%・8%%・対象外から選んでください', v_pos using errcode = '22023';
    end if;
    insert into public.document_lines (company_id, document_id, position, item_id, description, quantity, unit, unit_price, tax_rate, amount)
    values (me.company_id, v.id, v_pos,
            (select i.id from public.items i where i.id = (v_line ->> 'item_id')::uuid and i.company_id = me.company_id),
            btrim(v_line ->> 'description'), (v_line ->> 'quantity')::numeric,
            coalesce(nullif(btrim(v_line ->> 'unit'), ''), '式'), (v_line ->> 'unit_price')::bigint,
            (v_line ->> 'tax_rate')::smallint, 0);
  end loop;
  perform app_private.recalc_document(v.id);
  return query select d.id, d.version from public.documents d where d.id = v.id;
end $$;

/** 下書きを削除する（発行前の書類だけ。番号がないので欠番は出ない） */
create or replace function public.delete_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status <> 'draft' then
    raise exception '削除できるのは下書きだけです。発行済みの書類は「取り消し」を使ってください' using errcode = '22023';
  end if;
  delete from public.documents where id = v.id;
end $$;

/** 書類を複製して新しい下書きにする（見積書から請求書の下書きを作るときにも使う） */
create or replace function public.duplicate_document(p_id uuid, p_kind public.doc_kind default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  src public.documents;
  v public.documents;
begin
  select * into src from public.documents where id = p_id and company_id = me.company_id;
  if src.id is null then
    raise exception '書類が見つかりません' using errcode = 'P0002';
  end if;
  insert into public.documents (company_id, kind, client_id, title, notes, rounding, source_id, created_by, updated_by)
  values (me.company_id, coalesce(p_kind, src.kind), src.client_id, src.title, src.notes,
          (select s.rounding from public.company_settings s where s.company_id = me.company_id), src.id, me.id, me.id)
  returning * into v;
  insert into public.document_lines (company_id, document_id, position, item_id, description, quantity, unit, unit_price, tax_rate, amount)
  select me.company_id, v.id, position, item_id, description, quantity, unit, unit_price, tax_rate, 0
    from public.document_lines where document_id = src.id;
  perform app_private.recalc_document(v.id);
  perform app_private.log_event(v, 'duplicated', coalesce(src.number, '下書き') || ' から複製');
  return v.id;
end $$;

-- ---------------------------------------------------------------
-- 承認の流れ：下書き →（承認依頼）→ 承認待ち →（承認）→ 承認済み →（発行）→ 発行済み
-- ---------------------------------------------------------------
create or replace function public.submit_document(p_id uuid, p_version integer, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  perform app_private.check_version(v, p_version);
  if v.status <> 'draft' then
    raise exception '承認を依頼できるのは下書きだけです' using errcode = '22023';
  end if;
  perform app_private.check_ready(v);
  update public.documents set status = 'pending', submitted_at = now(), version = version + 1, updated_at = now() where id = v.id
  returning * into v;
  perform app_private.log_event(v, 'submitted', p_comment);
end $$;

/** 承認依頼の取り下げ（承認待ち → 下書き） */
create or replace function public.withdraw_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status <> 'pending' then
    raise exception '承認待ちの書類ではありません' using errcode = '22023';
  end if;
  update public.documents set status = 'draft', submitted_at = null, version = version + 1, updated_at = now() where id = v.id
  returning * into v;
  perform app_private.log_event(v, 'withdrawn');
end $$;

/** 承認。作成・最後に編集した本人は承認できない（職務の分離） */
create or replace function public.approve_document(p_id uuid, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status <> 'pending' then
    raise exception '承認待ちの書類ではありません（ほかの人が先に処理した可能性があります）' using errcode = '22023';
  end if;
  if me.id = v.created_by or me.id = v.updated_by then
    raise exception '自分で作成・編集した書類は承認できません。ほかの承認者に依頼してください' using errcode = '42501';
  end if;
  update public.documents set status = 'approved', approved_by = me.id, approved_at = now(), version = version + 1, updated_at = now()
   where id = v.id returning * into v;
  perform app_private.log_event(v, 'approved', p_comment);
end $$;

/** 差し戻し（承認待ち → 下書き）。理由は必須 */
create or replace function public.reject_document(p_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status <> 'pending' then
    raise exception '承認待ちの書類ではありません（ほかの人が先に処理した可能性があります）' using errcode = '22023';
  end if;
  if nullif(btrim(p_comment), '') is null then
    raise exception '差し戻しの理由を入力してください' using errcode = '22023';
  end if;
  update public.documents set status = 'draft', submitted_at = null, version = version + 1, updated_at = now() where id = v.id
  returning * into v;
  perform app_private.log_event(v, 'rejected', p_comment);
end $$;

/**
 * 発行。承認済みの書類、または承認が不要な下書き（承認者・管理者が作った基準額未満の書類）を発行する。
 * 番号を採番し、宛先・発行元を記録して、以後は変更できなくする。
 */
create or replace function public.issue_document(p_id uuid, p_version integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
  s public.company_settings;
  c public.clients;
  v_issue date;
  v_number text;
  v_note text;
begin
  perform app_private.check_version(v, p_version);
  if v.status = 'draft' then
    if app_private.approval_required(v, me.role) then
      raise exception 'この書類は承認が必要です。「承認を依頼」してください' using errcode = '42501';
    end if;
    v_note := '承認不要（基準額未満）';
  elsif v.status <> 'approved' then
    raise exception 'この書類は発行できません（%）', v.status using errcode = '22023';
  end if;
  perform app_private.check_ready(v);
  select * into s from public.company_settings where company_id = me.company_id;
  select * into c from public.clients where id = v.client_id;
  v_issue := coalesce(v.issue_date, app_private.today());
  if v.kind = 'invoice' and v.due_date is not null and v.due_date < v_issue then
    raise exception '支払期限は発行日以降にしてください' using errcode = '22023';
  end if;
  v_number := app_private.next_number(me.company_id, v.kind::text, case v.kind when 'invoice' then s.invoice_prefix else s.quote_prefix end, v_issue);
  update public.documents set
    status = 'issued', number = v_number, issue_date = v_issue,
    due_date = case when kind = 'invoice' then coalesce(due_date, public.calc_due_date(v_issue, c.closing_day, c.pay_month_offset, c.pay_day)) end,
    valid_until = case when kind = 'quote' then coalesce(valid_until, v_issue + s.quote_valid_days) end,
    client_snapshot = jsonb_build_object(
      'name', c.name, 'honorific', c.honorific, 'department', c.department, 'contact_name', c.contact_name,
      'postal_code', c.postal_code, 'address', c.address),
    issuer_snapshot = jsonb_build_object(
      'legal_name', s.legal_name, 'postal_code', s.postal_code, 'address', s.address, 'phone', s.phone, 'email', s.email,
      'registration_number', s.registration_number, 'bank_account', s.bank_account,
      'show_seal', s.show_seal, 'seal_text', coalesce(s.seal_text, s.legal_name)),
    issued_by = me.id, issued_at = now(), version = version + 1, updated_at = now()
  where id = v.id
  returning * into v;
  perform app_private.log_event(v, 'issued', v_note);
  return v_number;
end $$;

/** 送付済みにする（メールや郵送で取引先に送ったことを記録する） */
create or replace function public.mark_document_sent(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status not in ('issued', 'accepted') then
    raise exception '発行済みの書類だけ送付済みにできます' using errcode = '22023';
  end if;
  update public.documents set sent_at = coalesce(sent_at, now()), updated_at = now() where id = v.id returning * into v;
  perform app_private.log_event(v, 'sent');
end $$;

/** 取り消し（発行済み → 取り消し）。番号は欠番として残す。入金がある請求書は取り消せない */
create or replace function public.void_document(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver']::public.app_role[]);
  v public.documents := app_private.lock_document(p_id, me.company_id);
begin
  if v.status not in ('issued', 'accepted') then
    raise exception '取り消せるのは発行済みの書類だけです' using errcode = '22023';
  end if;
  if v.paid_amount > 0 then
    raise exception '入金が記録されている請求書は取り消せません。先に入金の記録を削除してください' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception '取り消しの理由を入力してください' using errcode = '22023';
  end if;
  update public.documents set status = 'void', voided_by = me.id, voided_at = now(), void_reason = btrim(p_reason),
         version = version + 1, updated_at = now()
   where id = v.id returning * into v;
  perform app_private.log_event(v, 'voided', p_reason);
end $$;

/** 見積書から請求書を作る（見積は「受注」になり、同じ明細の請求書の下書きができる） */
create or replace function public.convert_quote_to_invoice(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  q public.documents := app_private.lock_document(p_quote_id, me.company_id);
  v_new uuid;
begin
  if q.kind <> 'quote' or q.status <> 'issued' then
    raise exception '請求書にできるのは発行済みの見積書だけです' using errcode = '22023';
  end if;
  v_new := public.duplicate_document(q.id, 'invoice');
  update public.documents set status = 'accepted', version = version + 1, updated_at = now() where id = q.id returning * into q;
  perform app_private.log_event(q, 'converted', '請求書の下書きを作成');
  return v_new;
end $$;

-- ---------------------------------------------------------------
-- 入金と領収書
-- ---------------------------------------------------------------
create or replace function app_private.refresh_paid(p_invoice uuid) returns void
language sql security definer set search_path = '' as $$
  update public.documents d set
    paid_amount = coalesce((select sum(amount) from public.payments where invoice_id = d.id), 0),
    last_paid_on = (select max(paid_on) from public.payments where invoice_id = d.id),
    updated_at = now()
  where d.id = p_invoice
$$;

create or replace function public.record_payment(
  p_invoice_id uuid, p_paid_on date, p_amount bigint, p_method public.payment_method, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  v public.documents := app_private.lock_document(p_invoice_id, me.company_id);
  v_id uuid;
begin
  if v.kind <> 'invoice' or v.status <> 'issued' then
    raise exception '入金を記録できるのは発行済みの請求書だけです' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '入金額は1円以上にしてください' using errcode = '22023';
  end if;
  if p_amount > v.total - v.paid_amount then
    raise exception '入金額が未入金の残高（% 円）を超えています', to_char(v.total - v.paid_amount, 'FM999,999,999,999') using errcode = '22023';
  end if;
  if p_paid_on > app_private.today() then
    raise exception '入金日に未来の日付は入力できません' using errcode = '22023';
  end if;
  if p_paid_on < v.issue_date then
    raise exception '入金日は請求書の発行日以降にしてください' using errcode = '22023';
  end if;
  insert into public.payments (company_id, invoice_id, paid_on, amount, method, note, created_by)
  values (me.company_id, v.id, p_paid_on, p_amount, p_method, nullif(btrim(p_note), ''), me.id)
  returning id into v_id;
  perform app_private.refresh_paid(v.id);
  perform app_private.log_event(v, 'payment_recorded', to_char(p_amount, 'FM999,999,999,999') || '円（' || to_char(p_paid_on, 'YYYY/MM/DD') || '）');
  return v_id;
end $$;

create or replace function public.delete_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver']::public.app_role[]);
  p public.payments;
  v public.documents;
begin
  select * into p from public.payments where id = p_payment_id and company_id = me.company_id;
  if p.id is null then
    raise exception '入金の記録が見つかりません' using errcode = 'P0002';
  end if;
  v := app_private.lock_document(p.invoice_id, me.company_id);
  delete from public.payments where id = p.id;
  perform app_private.refresh_paid(v.id);
  perform app_private.log_event(v, 'payment_deleted', to_char(p.amount, 'FM999,999,999,999') || '円（' || to_char(p.paid_on, 'YYYY/MM/DD') || '）'
    || case when p.receipt_number is not null then '・領収書 ' || p.receipt_number || ' は無効' else '' end);
end $$;

/** 領収書を発行する（入金1件につき1枚。2回目以降は同じ番号のまま再発行） */
create or replace function public.issue_receipt(p_payment_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
  p public.payments;
  v public.documents;
  v_number text;
begin
  select * into p from public.payments where id = p_payment_id and company_id = me.company_id for update;
  if p.id is null then
    raise exception '入金の記録が見つかりません' using errcode = 'P0002';
  end if;
  if p.receipt_number is not null then
    return p.receipt_number;
  end if;
  v_number := app_private.next_number(me.company_id, 'receipt',
    (select receipt_prefix from public.company_settings where company_id = me.company_id), p.paid_on);
  update public.payments set receipt_number = v_number, receipt_issued_at = now() where id = p.id;
  select * into v from public.documents where id = p.invoice_id;
  perform app_private.log_event(v, 'receipt_issued', v_number);
  return v_number;
end $$;

-- ---------------------------------------------------------------
-- 定期請求
-- ---------------------------------------------------------------
/** 次回の発行日（interval_months か月後の issue_day 日） */
create or replace function public.next_recurring_date(p_from date, p_interval integer, p_issue_day integer) returns date
language sql immutable set search_path = '' as $$
  select public.month_day((date_trunc('month', p_from) + make_interval(months => p_interval))::date, p_issue_day)
$$;

/** 定期請求のひな形から、発行日を迎えたものの請求書（下書き）を作る。1つのひな形で一度に最大12回分 */
create or replace function app_private.generate_recurring(p_company uuid, p_as_of date, p_actor uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t public.recurring_templates;
  c public.clients;
  v public.documents;
  v_line jsonb;
  v_pos integer;
  v_count integer := 0;
  v_rounds integer;
begin
  for t in
    select * from public.recurring_templates
     where company_id = p_company and active and next_issue_on <= p_as_of
     order by next_issue_on for update
  loop
    select * into c from public.clients where id = t.client_id;
    if c.archived_at is not null then continue; end if;
    v_rounds := 0;
    while t.next_issue_on <= p_as_of and v_rounds < 12 loop
      insert into public.documents (company_id, kind, client_id, title, issue_date, due_date, notes, rounding, recurring_id, created_by, updated_by)
      values (p_company, 'invoice', t.client_id,
              t.title || '（' || to_char(t.next_issue_on, 'YYYY年FMMM月') || '分）',
              t.next_issue_on, public.calc_due_date(t.next_issue_on, c.closing_day, c.pay_month_offset, c.pay_day),
              t.notes, (select rounding from public.company_settings where company_id = p_company), t.id, p_actor, p_actor)
      returning * into v;
      v_pos := 0;
      for v_line in select * from jsonb_array_elements(t.lines) loop
        v_pos := v_pos + 1;
        insert into public.document_lines (company_id, document_id, position, item_id, description, quantity, unit, unit_price, tax_rate, amount)
        values (p_company, v.id, v_pos,
                (select i.id from public.items i where i.id = (v_line ->> 'item_id')::uuid and i.company_id = p_company),
                v_line ->> 'description', (v_line ->> 'quantity')::numeric, coalesce(v_line ->> 'unit', '式'),
                (v_line ->> 'unit_price')::bigint, (v_line ->> 'tax_rate')::smallint, 0);
      end loop;
      perform app_private.recalc_document(v.id);
      insert into public.document_events (company_id, document_id, action, actor, comment)
      values (p_company, v.id, 'generated', p_actor, '定期請求「' || t.title || '」から自動作成');
      t.next_issue_on := public.next_recurring_date(t.next_issue_on, t.interval_months, t.issue_day);
      v_rounds := v_rounds + 1;
      v_count := v_count + 1;
    end loop;
    update public.recurring_templates set next_issue_on = t.next_issue_on, last_generated_at = now() where id = t.id;
  end loop;
  return v_count;
end $$;

/** 画面の「今すぐ作成」：自分の会社の、今日までに発行日を迎えた定期請求を作る */
create or replace function public.run_recurring_now() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles := app_private.require_role(array['admin', 'approver', 'member']::public.app_role[]);
begin
  return app_private.generate_recurring(me.company_id, app_private.today(), me.id);
end $$;

/** 毎日の定期実行（すべての会社）。アプリのサーバーだけが呼ぶ */
create or replace function app_private.generate_recurring_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_total integer := 0;
begin
  for v_company in select distinct company_id from public.recurring_templates where active and next_issue_on <= app_private.today() loop
    v_total := v_total + app_private.generate_recurring(v_company, app_private.today(), null);
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------
-- マスタ・会社・利用者の整合性
-- ---------------------------------------------------------------
create or replace function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger clients_touch before update on public.clients for each row execute function app_private.touch_updated_at();
create trigger items_touch before update on public.items for each row execute function app_private.touch_updated_at();
create trigger recurring_touch before update on public.recurring_templates for each row execute function app_private.touch_updated_at();
create trigger settings_touch before update on public.company_settings for each row execute function app_private.touch_updated_at();

/** 定期請求の明細の形を確かめる（品名・数量・単価・税率） */
create or replace function app_private.check_recurring_lines() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_line jsonb;
begin
  for v_line in select * from jsonb_array_elements(new.lines) loop
    if nullif(btrim(v_line ->> 'description'), '') is null or length(v_line ->> 'description') > 200
       or coalesce((v_line ->> 'quantity')::numeric, 0) <= 0
       or (v_line ->> 'unit_price') is null or abs((v_line ->> 'unit_price')::bigint) > 100000000
       or (v_line ->> 'tax_rate')::smallint not in (10, 8, 0) then
      raise exception '定期請求の明細に不正な行があります' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
create trigger recurring_lines_check before insert or update of lines on public.recurring_templates
  for each row execute function app_private.check_recurring_lines();

/** 管理者が1人もいなくなる変更は断る（自分の権限を誤って下げて、誰も設定を変えられなくなるのを防ぐ） */
create or replace function app_private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where company_id = old.company_id and role = 'admin' and id <> old.id) then
    raise exception '管理者が1人もいなくなるため変更できません' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_keep_admin before update of role on public.profiles for each row execute function app_private.keep_one_admin();
