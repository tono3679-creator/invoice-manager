import Link from "next/link";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { asCurrentUser } from "@/lib/auth";
import { listPending } from "@/lib/data/documents";
import { KIND_LABEL, KIND_PATH, can } from "@/lib/domain/labels";
import { formatDateTime, formatYen } from "@/lib/format";

export const metadata = { title: "承認" };

export default async function ApprovalsPage() {
  const { rows, user } = await asCurrentUser(async (tx, user) => ({ rows: await listPending(tx), user }));
  const approver = can.approve(user.role);
  const mine = (r: (typeof rows)[number]) => r.created_by === user.userId || r.updated_by === user.userId;
  const groups = [
    { title: approver ? "あなたが承認する書類" : "承認待ちの書類", rows: approver ? rows.filter((r) => !mine(r)) : rows.filter((r) => !mine(r)) },
    { title: "あなたが承認を依頼している書類", rows: rows.filter(mine) },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="承認"
        description={`作成者の書類と、基準額（${formatYen(user.approvalThreshold)}）以上の書類は、作成した人以外の承認者が承認してから発行します。`}
      />
      {groups.map((g) => (
        <Card key={g.title} className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle className="text-base">{g.title}（{g.rows.length}件）</CardTitle></CardHeader>
          {g.rows.length === 0 ? (
            <EmptyState icon={Stamp} title="ありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>書類</TableHead>
                  <TableHead className="hidden md:table-cell">依頼者・メッセージ</TableHead>
                  <TableHead className="hidden sm:table-cell">依頼日時</TableHead>
                  <TableHead className="text-right">金額（税込）</TableHead>
                  <TableHead className="w-0"><span className="sr-only">操作</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]}・{r.client_name}</div>
                      <Link href={`${KIND_PATH[r.kind]}/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                    </TableCell>
                    <TableCell className="hidden max-w-80 md:table-cell">
                      <div className="text-sm">{r.created_by_name}</div>
                      {r.comment && <div className="line-clamp-2 text-xs text-muted-foreground">{r.comment}</div>}
                    </TableCell>
                    <TableCell className="hidden tabular sm:table-cell">{formatDateTime(r.submitted_at)}</TableCell>
                    <TableCell className="text-right font-medium tabular">{formatYen(r.total)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant={approver && !mine(r) ? "brand" : "outline"}>
                        <Link href={`${KIND_PATH[r.kind]}/${r.id}`}>{approver && !mine(r) ? "確認して承認" : "開く"}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ))}
    </div>
  );
}
