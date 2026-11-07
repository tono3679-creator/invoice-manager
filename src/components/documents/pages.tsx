/**
 * 見積書・請求書の画面（一覧・新規・編集・詳細）。2つの書類で同じ画面を使い、kind で出し分ける。
 * app/(app)/quotes と app/(app)/invoices の各ページはここを呼ぶだけ。
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, FilePlus2, FileText, History, Link2, Repeat, UserRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentBadge, StatusBadge } from "@/components/common/badges";
import { BackLink, DetailItem, Muted } from "@/components/common/detail";
import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { asCurrentUser } from "@/lib/auth";
import { getDocument, getIssuerSettings, listDocuments, PAGE_SIZE, type DocumentFilters } from "@/lib/data/documents";
import { clientOptions, itemOptions } from "@/lib/data/masters";
import {
  EVENT_LABEL, KIND_LABEL, KIND_PATH, PAYMENT_STATE_LABEL, STATUS_LABEL, can, type DocKind, type DocStatus, type PaymentState,
} from "@/lib/domain/labels";
import { termsLabel } from "@/lib/domain/terms";
import { formatDate, formatDateTimeFull, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocumentActions } from "./document-actions";
import { EMPTY_LINE } from "@/lib/domain/lines";
import { DocumentEditor, type EditorValues } from "./document-editor";
import { PaperFit } from "./paper-fit";
import { DocumentPaper, type PaperData } from "./document-paper";
import { DocumentTable } from "./document-table";
import { PaymentsList } from "./payments-panel";

type SP = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------
// 一覧
// ---------------------------------------------------------------
export async function DocumentListPage({ kind, searchParams }: { kind: DocKind; searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const statuses: DocStatus[] = kind === "quote" ? ["draft", "pending", "approved", "issued", "accepted", "void"] : ["draft", "pending", "approved", "issued", "void"];
  const filters: DocumentFilters = {
    kind,
    status: statuses.includes(sp.status as DocStatus) || sp.status === "open" ? (sp.status as DocStatus) : undefined,
    payment: kind === "invoice" && ["paid", "partial", "overdue", "unpaid", "outstanding"].includes(sp.payment ?? "") ? (sp.payment as PaymentState) : undefined,
    clientId: sp.client && UUID.test(sp.client) ? sp.client : undefined,
    q: sp.q,
    month: sp.month,
    page,
  };
  const { data, clients, user, months } = await asCurrentUser(async (tx, user) => {
    const [data, clients, months] = await Promise.all([
      listDocuments(tx, filters),
      clientOptions(tx),
      tx<{ m: string }[]>`
        select to_char(date_trunc('month', issue_date), 'YYYY-MM') m from documents
         where kind = ${kind} and issue_date is not null group by 1 order by 1 desc limit 24`,
    ]);
    return { data, clients, user, months };
  });
  const label = KIND_LABEL[kind];
  const qs = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    next.set("page", String(p));
    return `${KIND_PATH[kind]}?${next.toString()}`;
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title={label}
        description={kind === "invoice"
          ? "発行済みの請求書は、入金の状態（未入金・一部入金・期限超過・入金済み）で絞り込めます。"
          : "発行した見積書は「受注して請求書を作成」で、同じ明細の請求書になります。"}
        actions={can.edit(user.role) && (
          <Button asChild variant="brand"><Link href={`${KIND_PATH[kind]}/new`}><FilePlus2 aria-hidden />{label}を作成</Link></Button>
        )}
      />
      <Card className="gap-0 py-0">
        <ListFilters
          placeholder="件名・番号・取引先で検索"
          selects={[
            {
              key: "status", label: "状態", allLabel: "すべての状態",
              options: [{ value: "open", label: "作業中（下書き〜承認済み）" }, ...statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))],
            },
            ...(kind === "invoice" ? [{
              key: "payment", label: "入金", allLabel: "入金の状態（すべて）",
              options: [{ value: "outstanding", label: "未回収（すべて）" }, ...(["overdue", "unpaid", "partial", "paid"] as PaymentState[]).map((s) => ({ value: s, label: PAYMENT_STATE_LABEL[s] }))],
            }] : []),
            { key: "client", label: "取引先", allLabel: "すべての取引先", options: clients.map((c) => ({ value: c.id, label: c.name })) },
            { key: "month", label: "発行月", allLabel: "すべての月", options: months.map((m) => ({ value: m.m, label: m.m.replace("-", "年") + "月" })) },
          ]}
        />
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-muted-foreground sm:px-5">
          <span className="tabular">{data.total.toLocaleString("ja-JP")}件</span>
          <span className="tabular">合計（取り消しを除く）<span className="ml-1 font-semibold text-foreground">{formatYen(data.sum)}</span></span>
        </div>
        {data.rows.length === 0 ? (
          <EmptyState icon={FileText} title={`条件に合う${label}はありません`} />
        ) : (
          <DocumentTable rows={data.rows} />
        )}
        <Pagination page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE_SIZE))} total={data.total} pageSize={PAGE_SIZE} hrefFor={qs} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// 新規・編集
// ---------------------------------------------------------------
async function editorData() {
  return asCurrentUser(async (tx, user) => {
    const [clients, items, settings] = await Promise.all([clientOptions(tx), itemOptions(tx), getIssuerSettings(tx)]);
    return { clients, items, settings, user };
  });
}

export async function DocumentNewPage({ kind, searchParams }: { kind: DocKind; searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { clients, items, settings, user } = await editorData();
  if (!can.edit(user.role)) redirect(KIND_PATH[kind]);
  const initial: EditorValues = {
    client_id: sp.client && clients.some((c) => c.id === sp.client) ? sp.client : "",
    title: "", issue_date: "", due_date: "", valid_until: "",
    notes: (kind === "invoice" ? settings.default_invoice_notes : settings.default_quote_notes) ?? "",
    lines: [{ ...EMPTY_LINE }],
  };
  return (
    <div className="space-y-5">
      <BackLink href={KIND_PATH[kind]} label={`${KIND_LABEL[kind]}一覧へ`} />
      <PageHeader title={`${KIND_LABEL[kind]}を作成`} />
      <DocumentEditor kind={kind} docId={null} version={null} initial={initial} clients={clients} items={items}
        rounding={settings.rounding} threshold={settings.approval_threshold} role={user.role} quoteValidDays={settings.quote_valid_days} />
    </div>
  );
}

export async function DocumentEditPage({ kind, params }: { kind: DocKind; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { clients, items, settings, user } = await editorData();
  const data = await asCurrentUser((tx) => getDocument(tx, id, kind));
  if (!data) notFound();
  const { doc, lines } = data;
  if (doc.status !== "draft" || !can.edit(user.role)) redirect(`${KIND_PATH[kind]}/${id}`);
  // アーカイブした取引先の下書きを開いたときも選べるようにする
  const options = clients.some((c) => c.id === doc.client_id) ? clients : [...clients, { id: doc.client_id, code: "—", name: `${data.client.name}（アーカイブ済み）`, honorific: data.client.honorific, closing_day: data.client.closing_day, pay_month_offset: data.client.pay_month_offset, pay_day: data.client.pay_day }];
  const initial: EditorValues = {
    client_id: doc.client_id, title: doc.title, issue_date: doc.issue_date ?? "", due_date: doc.due_date ?? "", valid_until: doc.valid_until ?? "",
    notes: doc.notes ?? "",
    lines: lines.map((l) => ({
      item_id: l.item_id ?? "", description: l.description, quantity: String(l.quantity), unit: l.unit,
      unit_price: String(l.unit_price), tax_rate: String(l.tax_rate),
    })),
  };
  return (
    <div className="space-y-5">
      <BackLink href={`${KIND_PATH[kind]}/${id}`} label="書類に戻る" />
      <PageHeader title={`${KIND_LABEL[kind]}を編集`} description="下書きのあいだは何度でも編集できます。" />
      <DocumentEditor kind={kind} docId={id} version={doc.version} initial={initial} clients={options} items={items}
        rounding={settings.rounding} threshold={settings.approval_threshold} role={user.role} quoteValidDays={settings.quote_valid_days} />
    </div>
  );
}

// ---------------------------------------------------------------
// 詳細
// ---------------------------------------------------------------
export async function DocumentDetailPage({ kind, params }: { kind: DocKind; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const result = await asCurrentUser(async (tx, user) => {
    const data = await getDocument(tx, id, kind);
    if (!data) return null;
    const settings = await getIssuerSettings(tx);
    return { ...data, settings, user };
  });
  if (!result) notFound();
  const { doc, lines, events, payments, related, client, settings, user } = result;
  const frozen = doc.client_snapshot && doc.issuer_snapshot;
  const paper: PaperData = {
    ...doc,
    lines,
    client: frozen ? (doc.client_snapshot as unknown as PaperData["client"]) : client,
    issuer: frozen ? (doc.issuer_snapshot as unknown as PaperData["issuer"]) : { ...settings, seal_text: settings.seal_text ?? settings.legal_name },
  };
  const balance = doc.total - doc.paid_amount;
  const label = KIND_LABEL[kind];

  return (
    <div className="space-y-5">
      <BackLink href={KIND_PATH[kind]} label={`${label}一覧へ`} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={doc.status} />
            {doc.payment_state && <PaymentBadge state={doc.payment_state} daysOverdue={doc.days_overdue} />}
            {doc.sent_at && <span className="text-xs text-muted-foreground">送付済み {formatDateTimeFull(doc.sent_at)}</span>}
          </div>
          <h1 className="text-keep mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">{doc.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular">
            {doc.number ?? "番号は発行時に付きます"}・
            <Link href={`/clients/${doc.client_id}`} className="hover:underline">{client.name}</Link>・{formatYen(doc.total)}
          </p>
        </div>
        <DocumentActions
          doc={{
            id: doc.id, kind: doc.kind, status: doc.status, version: doc.version, total: doc.total, balance, sent: !!doc.sent_at,
            createdBy: doc.created_by, updatedBy: doc.updated_by, number: doc.number, issueDate: doc.issue_date,
          }}
          role={user.role} userId={user.userId} threshold={settings.approval_threshold}
        />
      </div>

      {doc.status === "void" && (
        <div className="rounded-lg border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong" role="note">
          この{label}は取り消されました（{formatDateTimeFull(doc.voided_at)}）。理由：{doc.void_reason}
        </div>
      )}
      <LastReject events={events} status={doc.status} />

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 rounded-xl bg-muted/60 p-3 sm:p-6">
          <PaperFit><DocumentPaper data={paper} /></PaperFit>
        </div>
        <div className="space-y-5">
          {kind === "invoice" && doc.status === "issued" && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" aria-hidden />入金</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-muted px-2 py-2"><div className="text-muted-foreground">請求額</div><div className="mt-0.5 text-sm font-semibold tabular">{formatYen(doc.total)}</div></div>
                  <div className="rounded-md bg-muted px-2 py-2"><div className="text-muted-foreground">入金済み</div><div className="mt-0.5 text-sm font-semibold tabular">{formatYen(doc.paid_amount)}</div></div>
                  <div className={cn("rounded-md px-2 py-2", balance > 0 && doc.payment_state === "overdue" ? "bg-danger-soft text-danger-strong" : "bg-muted")}>
                    <div className={balance > 0 && doc.payment_state === "overdue" ? "" : "text-muted-foreground"}>残高</div>
                    <div className="mt-0.5 text-sm font-semibold tabular">{formatYen(balance)}</div>
                  </div>
                </div>
                <PaymentsList payments={payments} role={user.role} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">情報</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3.5 text-sm">
                <DetailItem icon={UserRound} label="作成">{doc.created_by_name ?? (doc.recurring_id ? "定期請求（自動）" : <Muted />)}</DetailItem>
                <DetailItem icon={UserRound} label="承認">
                  {doc.approved_by_name ? <>{doc.approved_by_name}<span className="ml-1 text-xs text-muted-foreground">{formatDateTimeFull(doc.approved_at)}</span></>
                    : doc.issued_at ? "承認不要（基準額未満）" : <Muted>未承認</Muted>}
                </DetailItem>
                {kind === "invoice" && (
                  <DetailItem icon={CalendarClock} label="支払条件">
                    {termsLabel({ closingDay: client.closing_day, payMonthOffset: client.pay_month_offset, payDay: client.pay_day })}
                    {doc.due_date && <div className="text-xs text-muted-foreground tabular">期限 {formatDate(doc.due_date)}</div>}
                  </DetailItem>
                )}
                {doc.recurring_id && (
                  <DetailItem icon={Repeat} label="定期請求"><Link href="/recurring" className="hover:underline">定期請求から自動で作成</Link></DetailItem>
                )}
                {related.length > 0 && (
                  <DetailItem icon={Link2} label="関連する書類">
                    <ul className="grid gap-1">
                      {related.map((r) => (
                        <li key={r.id}>
                          <Link href={`${KIND_PATH[r.kind]}/${r.id}`} className="hover:underline">
                            {r.relation === "source" ? "元の" : ""}{KIND_LABEL[r.kind]} {r.number ?? "（下書き）"}
                          </Link>
                          <span className="ml-1 text-xs text-muted-foreground">{STATUS_LABEL[r.status]}・{formatYen(r.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </DetailItem>
                )}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" aria-hidden />履歴</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative grid gap-3 border-l pl-4 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={cn("absolute top-1.5 -left-[1.3rem] size-2 rounded-full",
                      e.action === "rejected" || e.action === "voided" ? "bg-destructive" : e.action === "approved" || e.action === "issued" ? "bg-success" : "bg-border")} aria-hidden />
                    <div className="font-medium">{EVENT_LABEL[e.action] ?? e.action}<span className="ml-1.5 font-normal text-muted-foreground">{e.actor_name ?? "システム"}</span></div>
                    <div className="text-xs text-muted-foreground tabular">{formatDateTimeFull(e.created_at)}</div>
                    {e.comment && <div className="mt-0.5 rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">{e.comment}</div>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LastReject({ events, status }: { events: { action: string; comment: string | null; actor_name: string | null }[]; status: DocStatus }) {
  const last = events[0];
  if (status !== "draft" || last?.action !== "rejected") return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-strong" role="note">
      <span className="font-semibold">{last.actor_name ?? "承認者"}さんから差し戻されました：</span>{last.comment}
    </div>
  );
}
