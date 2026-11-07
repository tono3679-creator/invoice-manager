import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { ClientFormButton } from "@/components/masters/client-form";
import { asCurrentUser } from "@/lib/auth";
import { listClients } from "@/lib/data/masters";
import { can } from "@/lib/domain/labels";
import { termsLabel } from "@/lib/domain/terms";
import { formatDate, formatYen } from "@/lib/format";

export const metadata = { title: "取引先" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { rows, user, nextCode } = await asCurrentUser(async (tx, user) => {
    const rows = await listClients(tx, { q: sp.q, archived: sp.archived === "1" });
    const [n] = await tx<{ n: number }[]>`select count(*)::int n from clients`;
    return { rows, user, nextCode: `C-${String(n.n + 1).padStart(3, "0")}` };
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title="取引先"
        description="請求先の会社・個人と支払条件。未回収の残高は発行済みの請求書から自動で集計します。"
        actions={can.edit(user.role) && <ClientFormButton nextCode={nextCode} />}
      />
      <Card className="gap-0 py-0">
        <ListFilters placeholder="取引先名・コードで検索" toggles={[{ key: "archived", label: "アーカイブ済みを表示" }]} />
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="取引先がありません" description="「取引先を登録」から追加してください。" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">コード</TableHead>
                <TableHead>取引先名</TableHead>
                <TableHead className="hidden md:table-cell">支払条件</TableHead>
                <TableHead className="hidden text-right lg:table-cell">直近12か月の請求</TableHead>
                <TableHead className="text-right">未回収</TableHead>
                <TableHead className="hidden text-right sm:table-cell">最終請求日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground tabular">{c.code}</TableCell>
                  <TableCell>
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <span className="ml-1 text-xs text-muted-foreground">{c.honorific}</span>
                    {c.department && <div className="text-xs text-muted-foreground">{c.department}</div>}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {termsLabel({ closingDay: c.closing_day, payMonthOffset: c.pay_month_offset, payDay: c.pay_day })}
                  </TableCell>
                  <TableCell className="hidden text-right tabular lg:table-cell">{formatYen(c.billed_12m)}</TableCell>
                  <TableCell className="text-right tabular">
                    {c.balance > 0 ? formatYen(c.balance) : <span className="text-muted-foreground">—</span>}
                    {c.overdue > 0 && <div className="text-xs text-danger-strong">うち期限超過 {formatYen(c.overdue)}</div>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">{formatDate(c.last_issue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
