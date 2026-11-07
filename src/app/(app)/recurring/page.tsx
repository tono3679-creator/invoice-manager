import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { RecurringRowActions, RunNowButton } from "@/components/recurring/recurring-actions";
import { asCurrentUser } from "@/lib/auth";
import { can } from "@/lib/domain/labels";
import { calcTotals, type RoundingMode, type TaxRate } from "@/lib/domain/tax";
import { todayJst } from "@/lib/domain/terms";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";

export const metadata = { title: "定期請求" };

const INTERVAL: Record<number, string> = { 1: "毎月", 2: "2か月ごと", 3: "3か月ごと", 6: "半年ごと", 12: "毎年" };

type Row = {
  id: string; title: string; client_name: string; interval_months: number; issue_day: number; next_issue_on: string; active: boolean;
  lines: { quantity: number; unit_price: number; tax_rate: TaxRate }[]; last_generated_at: Date | null; generated: number; rounding: RoundingMode;
};

export default async function RecurringPage() {
  const { rows, user } = await asCurrentUser(async (tx, user) => ({
    user,
    rows: await tx<Row[]>`
      select t.id, t.title, c.name client_name, t.interval_months, t.issue_day, t.next_issue_on, t.active, t.lines, t.last_generated_at,
             (select count(*)::int from documents d where d.recurring_id = t.id) generated, s.rounding
        from recurring_templates t join clients c on c.id = t.client_id join company_settings s on s.company_id = t.company_id
       order by t.active desc, t.next_issue_on`,
  }));
  const today = todayJst();
  const due = rows.filter((r) => r.active && r.next_issue_on <= today).length;
  const editable = can.edit(user.role);
  return (
    <div className="space-y-5">
      <PageHeader
        title="定期請求"
        description="保守・運用など毎月同じ内容の請求は、ひな形を登録しておくと発行日に請求書の下書きが自動で作られます。"
        actions={editable && (
          <>
            <RunNowButton due={due} />
            <Button asChild variant="brand"><Link href="/recurring/new"><Plus aria-hidden />定期請求を登録</Link></Button>
          </>
        )}
      />
      <Card className="gap-0 py-0">
        {rows.length === 0 ? (
          <EmptyState icon={Repeat} title="定期請求はまだありません" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>件名・取引先</TableHead>
                <TableHead className="hidden sm:table-cell">間隔</TableHead>
                <TableHead>次回の発行日</TableHead>
                <TableHead className="text-right">1回あたり（税込）</TableHead>
                <TableHead className="hidden md:table-cell">作成済み</TableHead>
                {editable && <TableHead className="w-0"><span className="sr-only">操作</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const total = calcTotals(r.lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unit_price), taxRate: Number(l.tax_rate) as TaxRate })), r.rounding).total;
                return (
                  <TableRow key={r.id} className={r.active ? undefined : "text-muted-foreground"}>
                    <TableCell>
                      {editable ? <Link href={`/recurring/${r.id}`} className="font-medium hover:underline">{r.title}</Link> : <span className="font-medium">{r.title}</span>}
                      {!r.active && <Badge variant="neutral" className="ml-2">停止中</Badge>}
                      <div className="text-xs text-muted-foreground">{r.client_name}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{INTERVAL[r.interval_months]}・{r.issue_day === 0 ? "月末" : `${r.issue_day}日`}</TableCell>
                    <TableCell className="tabular">
                      {formatDate(r.next_issue_on)}
                      {r.active && r.next_issue_on <= today && <Badge variant="warning" className="ml-2">作成待ち</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatYen(total)}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <Link href={`/invoices?q=${encodeURIComponent(r.title)}`} className="hover:underline">{r.generated}件</Link>
                      {r.last_generated_at && <div className="text-xs text-muted-foreground">最終 {formatDateTime(r.last_generated_at)}</div>}
                    </TableCell>
                    {editable && <TableCell><RecurringRowActions id={r.id} title={r.title} active={r.active} canDelete={can.deleteMaster(user.role)} /></TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
