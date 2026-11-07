import Link from "next/link";
import { Download, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MiniStat } from "@/components/common/detail";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { asCurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/domain/labels";
import { formatDate, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "入金・売掛金" };

type Aging = { client_id: string; client_name: string; invoices: number; current_amount: number; d1_30: number; d31_60: number; d61_plus: number; total: number; oldest_due: string };

export default async function ReceivablesPage() {
  const { aging, payments } = await asCurrentUser(async (tx) => {
    const [aging, payments] = await Promise.all([
      tx<Aging[]>`select * from receivables_aging()`,
      tx<{ id: string; paid_on: string; amount: number; method: PaymentMethod; receipt_number: string | null; invoice_id: string; number: string; client_name: string }[]>`
        select p.id, p.paid_on, p.amount, p.method, p.receipt_number, d.id invoice_id, d.number, c.name client_name
          from payments p join documents d on d.id = p.invoice_id join clients c on c.id = d.client_id
         order by p.paid_on desc, p.created_at desc limit 20`,
    ]);
    return { aging, payments };
  });
  const sum = (k: keyof Aging) => aging.reduce((a, r) => a + (r[k] as number), 0);
  const cols = [
    { key: "current_amount", label: "期限内" },
    { key: "d1_30", label: "1〜30日超過" },
    { key: "d31_60", label: "31〜60日超過" },
    { key: "d61_plus", label: "61日以上超過" },
  ] as const;
  return (
    <div className="space-y-5">
      <PageHeader title="入金・売掛金" description="未回収の請求書を、取引先ごと・期限からの経過日数ごとにまとめた年齢表です。入金は各請求書の画面で記録します。" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cols.map((c, i) => (
          <MiniStat key={c.key} label={c.label} value={formatYen(sum(c.key))} tone={i >= 2 && sum(c.key) > 0 ? "danger" : i === 1 && sum(c.key) > 0 ? "warning" : undefined} />
        ))}
      </div>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle className="text-base">売掛金の年齢表</CardTitle></CardHeader>
        {aging.length === 0 ? (
          <EmptyState icon={Wallet} title="未回収の請求書はありません" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>取引先</TableHead>
                <TableHead className="hidden text-right sm:table-cell">件数</TableHead>
                {cols.map((c) => <TableHead key={c.key} className="hidden text-right md:table-cell">{c.label}</TableHead>)}
                <TableHead className="text-right">合計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aging.map((r) => (
                <TableRow key={r.client_id}>
                  <TableCell>
                    <Link href={`/invoices?client=${r.client_id}&payment=outstanding`} className="font-medium hover:underline">{r.client_name}</Link>
                    <div className="text-xs text-muted-foreground tabular">最も古い期限 {formatDate(r.oldest_due)}</div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">{r.invoices}</TableCell>
                  {cols.map((c, i) => (
                    <TableCell key={c.key} className={cn("hidden text-right tabular md:table-cell", r[c.key] === 0 && "text-muted-foreground", r[c.key] > 0 && i >= 2 && "font-medium text-danger-strong")}>
                      {r[c.key] === 0 ? "—" : formatYen(r[c.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular">{formatYen(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>合計</TableCell>
                <TableCell className="hidden text-right tabular sm:table-cell">{sum("invoices")}</TableCell>
                {cols.map((c) => <TableCell key={c.key} className="hidden text-right tabular md:table-cell">{formatYen(sum(c.key))}</TableCell>)}
                <TableCell className="text-right tabular">{formatYen(sum("total"))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle className="text-base">最近の入金</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>入金日</TableHead>
              <TableHead>取引先・請求書</TableHead>
              <TableHead className="hidden sm:table-cell">方法</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead className="hidden md:table-cell">領収書</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="tabular">{formatDate(p.paid_on)}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.client_name}</div>
                  <Link href={`/invoices/${p.invoice_id}`} className="text-xs text-muted-foreground tabular hover:underline">{p.number}</Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                <TableCell className="text-right tabular">{formatYen(p.amount)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {p.receipt_number ? (
                    <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                      <Download className="size-3.5" aria-hidden />{p.receipt_number}
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
