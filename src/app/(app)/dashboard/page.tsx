import Link from "next/link";
import { AlarmClock, ArrowRight, CircleCheckBig, FilePlus2, Hourglass, Stamp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniStat } from "@/components/common/detail";
import { PageHeader } from "@/components/common/page-header";
import { BillingChart } from "@/components/dashboard/billing-chart";
import { asCurrentUser } from "@/lib/auth";
import { getDashboard } from "@/lib/data/dashboard";
import { listMyWork, listPending } from "@/lib/data/documents";
import { KIND_LABEL, KIND_PATH, ROLE_LABEL, can } from "@/lib/domain/labels";
import { todayJst } from "@/lib/domain/terms";
import { formatDate, formatSignedPercent, formatYen } from "@/lib/format";

export const metadata = { title: "ダッシュボード" };

const change = (now: number, prev: number) => (prev > 0 ? `先月比 ${formatSignedPercent(((now - prev) / prev) * 100)}` : "先月の実績なし");

export default async function DashboardPage() {
  const today = todayJst();
  const month = `${today.slice(0, 7)}-01`;
  const { dash, pending, mine, user } = await asCurrentUser(async (tx, user) => {
    const [dash, pending, mine] = await Promise.all([getDashboard(tx, month), listPending(tx), listMyWork(tx, user.userId)]);
    return { dash, pending, mine, user };
  });
  const s = dash.summary;
  const approver = can.approve(user.role);
  const toApprove = approver ? pending.filter((p) => p.created_by !== user.userId && p.updated_by !== user.userId) : [];
  const myPending = pending.filter((p) => p.created_by === user.userId);
  return (
    <div className="space-y-5">
      <PageHeader
        title={`${user.displayName}さん、こんにちは`}
        description={`${ROLE_LABEL[user.role]}としてログインしています。${Number(today.slice(5, 7))}月の数字と、対応が必要な書類です。`}
        actions={can.edit(user.role) && (
          <>
            <Button asChild variant="outline"><Link href="/quotes/new"><FilePlus2 aria-hidden />見積書を作成</Link></Button>
            <Button asChild variant="brand"><Link href="/invoices/new"><FilePlus2 aria-hidden />請求書を作成</Link></Button>
          </>
        )}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label="今月の請求額（税込）" value={formatYen(s.billed)} sub={change(s.billed, s.billed_prev)} />
        <MiniStat label="今月の入金額" value={formatYen(s.collected)} sub={change(s.collected, s.collected_prev)} />
        <MiniStat label="未回収の残高" value={formatYen(s.outstanding)} sub={`${s.outstanding_count}件・今月末までの期限 ${formatYen(s.due_this_month)}`} />
        <MiniStat label="期限超過" value={formatYen(s.overdue)} tone={s.overdue > 0 ? "danger" : undefined} sub={`${s.overdue_count}件`} />
        <MiniStat label="回答待ちの見積" value={formatYen(s.quotes_open)} sub={`${s.quotes_open_count}件（有効期限内）`} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">請求額と入金額（直近12か月）</CardTitle>
            <Link href="/receivables" className="text-sm text-brand hover:underline">売掛金を見る</Link>
          </CardHeader>
          <CardContent><BillingChart data={dash.monthly} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">対応が必要な書類</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {approver && (
              <TaskGroup icon={Stamp} title={`あなたの承認待ち（${toApprove.length}件）`} empty="承認待ちの書類はありません" href="/approvals"
                items={toApprove.slice(0, 4).map((d) => ({ id: d.id, href: `${KIND_PATH[d.kind]}/${d.id}`, title: d.title, sub: `${KIND_LABEL[d.kind]}・${d.client_name}・${d.created_by_name}`, amount: d.total }))} />
            )}
            {can.edit(user.role) && (
              <>
                {mine.length > 0 && (
                  <TaskGroup icon={Undo2} title="あなたの書類（発行待ち・差し戻し）" empty=""
                    items={mine.slice(0, 4).map((d) => ({
                      id: d.id, href: `${KIND_PATH[d.kind]}/${d.id}`, title: d.title,
                      sub: d.status === "approved" ? `承認済み・発行できます（${d.last_actor ?? ""}）` : `差し戻し：${d.last_comment ?? ""}`,
                      amount: d.total, tone: d.status === "approved" ? "ok" as const : "warn" as const,
                    }))} />
                )}
                {myPending.length > 0 && (
                  <TaskGroup icon={Hourglass} title={`承認を依頼中（${myPending.length}件）`} empty=""
                    items={myPending.slice(0, 3).map((d) => ({ id: d.id, href: `${KIND_PATH[d.kind]}/${d.id}`, title: d.title, sub: `${KIND_LABEL[d.kind]}・${d.client_name}`, amount: d.total }))} />
                )}
              </>
            )}
            <TaskGroup icon={AlarmClock} title={`期限を過ぎた請求書（${s.overdue_count}件）`} empty="期限を過ぎた請求書はありません" href="/invoices?payment=overdue"
              items={dash.overdue.map((d) => ({ id: d.id, href: `/invoices/${d.id}`, title: d.client_name, sub: `${d.number}・期限 ${formatDate(d.due_date)}（${d.days_overdue}日超過）`, amount: d.balance, tone: "danger" as const }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TaskGroup({ icon: Icon, title, items, empty, href }: {
  icon: typeof Stamp; title: string; empty: string; href?: string;
  items: { id: string; href: string; title: string; sub: string; amount: number; tone?: "ok" | "warn" | "danger" }[];
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="size-4 text-muted-foreground" aria-hidden />{title}</h3>
        {href && items.length > 0 && <Link href={href} className="flex items-center text-xs text-brand hover:underline">すべて<ArrowRight className="size-3" aria-hidden /></Link>}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CircleCheckBig className="size-4 text-success" aria-hidden />{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={i.href} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.title}</div>
                  <div className={`truncate text-xs ${i.tone === "danger" ? "text-danger-strong" : i.tone === "warn" ? "text-warning-strong" : i.tone === "ok" ? "text-success-strong" : "text-muted-foreground"}`}>{i.sub}</div>
                </div>
                <div className="text-sm font-semibold tabular">{formatYen(i.amount)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
