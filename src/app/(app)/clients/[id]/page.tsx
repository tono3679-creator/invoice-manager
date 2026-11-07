import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FilePlus2, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackLink, DetailItem, MiniStat, Muted } from "@/components/common/detail";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DocumentTable } from "@/components/documents/document-table";
import { ArchiveButton, DeleteMasterButton } from "@/components/masters/archive-button";
import { ClientFormButton } from "@/components/masters/client-form";
import { asCurrentUser } from "@/lib/auth";
import { listDocuments } from "@/lib/data/documents";
import { getClient } from "@/lib/data/masters";
import { can } from "@/lib/domain/labels";
import { termsLabel } from "@/lib/domain/terms";
import { formatYen } from "@/lib/format";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await asCurrentUser(async (tx, user) => {
    const client = await getClient(tx, id);
    if (!client) return null;
    const [invoices, quotes, [stats]] = await Promise.all([
      listDocuments(tx, { kind: "invoice", clientId: id }),
      listDocuments(tx, { kind: "quote", clientId: id }),
      tx<{ balance: number; overdue: number; billed: number; paid: number; avg_days: number | null; docs: number }[]>`
        select coalesce((select sum(balance) from invoice_balances where client_id = ${id}), 0)::bigint balance,
               coalesce((select sum(balance) from invoice_balances where client_id = ${id} and payment_state = 'overdue'), 0)::bigint overdue,
               coalesce((select sum(total) from documents where client_id = ${id} and kind = 'invoice' and status = 'issued'
                          and issue_date >= (now() at time zone 'Asia/Tokyo')::date - 365), 0)::bigint billed,
               coalesce((select sum(p.amount) from payments p join documents d on d.id = p.invoice_id where d.client_id = ${id}
                          and p.paid_on >= (now() at time zone 'Asia/Tokyo')::date - 365), 0)::bigint paid,
               (select round(avg(p.paid_on - d.due_date))::int from payments p join documents d on d.id = p.invoice_id
                 where d.client_id = ${id} and d.paid_amount >= d.total) avg_days,
               (select count(*)::int from documents where client_id = ${id}) docs`,
    ]);
    return { client, invoices, quotes, stats, user };
  });
  if (!data) notFound();
  const { client: c, invoices, quotes, stats, user } = data;
  const terms = { closingDay: c.closing_day, payMonthOffset: c.pay_month_offset, payDay: c.pay_day };
  const avg = stats.avg_days;
  return (
    <div className="space-y-5">
      <BackLink href="/clients" label="取引先一覧へ" />
      <PageHeader
        title={`${c.name} ${c.honorific}`}
        description={`${c.code}${c.department ? `・${c.department}` : ""}`}
        actions={
          <>
            {c.archived_at && <Badge variant="neutral">アーカイブ済み</Badge>}
            {can.edit(user.role) && !c.archived_at && (
              <Button asChild variant="brand"><Link href={`/invoices/new?client=${c.id}`}><FilePlus2 aria-hidden />請求書を作成</Link></Button>
            )}
            {can.edit(user.role) && (
              <ClientFormButton
                id={c.id}
                initial={{
                  code: c.code, name: c.name, honorific: c.honorific, department: c.department ?? "", contact_name: c.contact_name ?? "",
                  email: c.email ?? "", phone: c.phone ?? "", postal_code: c.postal_code ?? "", address: c.address ?? "",
                  closing_day: String(c.closing_day), pay_month_offset: String(c.pay_month_offset), pay_day: String(c.pay_day), notes: c.notes ?? "",
                }}
              />
            )}
            {can.edit(user.role) && <ArchiveButton kind="client" id={c.id} name={c.name} archived={!!c.archived_at} />}
            {can.deleteMaster(user.role) && stats.docs === 0 && <DeleteMasterButton kind="client" id={c.id} name={c.name} redirectTo="/clients" />}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="未回収の残高" value={formatYen(stats.balance)} tone={stats.overdue > 0 ? "danger" : undefined}
          sub={stats.overdue > 0 ? `うち期限超過 ${formatYen(stats.overdue)}` : "期限超過なし"} />
        <MiniStat label="直近12か月の請求額" value={formatYen(stats.billed)} />
        <MiniStat label="直近12か月の入金額" value={formatYen(stats.paid)} />
        <MiniStat label="支払いの平均（期限比）" value={avg === null ? "—" : avg <= 0 ? `${Math.abs(avg)}日前` : `${avg}日遅れ`}
          tone={avg !== null && avg > 0 ? "warning" : undefined} sub="入金済みの請求書から" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm">
              <DetailItem icon={CalendarClock} label="支払条件">{termsLabel(terms)}</DetailItem>
              <DetailItem icon={UserRound} label="担当者">{c.contact_name ?? <Muted />}</DetailItem>
              <DetailItem icon={MapPin} label="住所">{c.address ? <>〒{c.postal_code} {c.address}</> : <Muted />}</DetailItem>
              <DetailItem icon={Phone} label="電話番号">{c.phone ?? <Muted />}</DetailItem>
              <DetailItem icon={Mail} label="メールアドレス">{c.email ?? <Muted />}</DetailItem>
            </dl>
            {c.notes && <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{c.notes}</p>}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4"><CardTitle className="text-base">請求書（{invoices.total}件）</CardTitle></CardHeader>
            {invoices.rows.length ? <DocumentTable rows={invoices.rows} showClient={false} /> : <EmptyState title="請求書はまだありません" />}
          </Card>
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4"><CardTitle className="text-base">見積書（{quotes.total}件）</CardTitle></CardHeader>
            {quotes.rows.length ? <DocumentTable rows={quotes.rows} showClient={false} /> : <EmptyState title="見積書はまだありません" />}
          </Card>
        </div>
      </div>
    </div>
  );
}
