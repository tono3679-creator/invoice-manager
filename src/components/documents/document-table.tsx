import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentBadge, StatusBadge } from "@/components/common/badges";
import type { DocumentListRow } from "@/lib/data/documents";
import { KIND_PATH } from "@/lib/domain/labels";
import { formatDate, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 見積書・請求書の一覧（請求書は入金の状態と期限も出す） */
export function DocumentTable({ rows, showClient = true }: { rows: DocumentListRow[]; showClient?: boolean }) {
  const invoice = rows[0]?.kind === "invoice";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">番号</TableHead>
          <TableHead>件名{showClient && "・取引先"}</TableHead>
          <TableHead className="hidden sm:table-cell">発行日</TableHead>
          <TableHead className="hidden md:table-cell">{invoice ? "支払期限" : "有効期限"}</TableHead>
          <TableHead className="text-right">金額（税込）</TableHead>
          <TableHead>状態</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.id} className={cn(d.status === "void" && "text-muted-foreground")}>
            <TableCell className="tabular">
              <Link href={`${KIND_PATH[d.kind]}/${d.id}`} className="font-medium hover:underline">
                {d.number ?? <span className="text-muted-foreground">（未採番）</span>}
              </Link>
            </TableCell>
            <TableCell className="max-w-[22rem]">
              <Link href={`${KIND_PATH[d.kind]}/${d.id}`} className="line-clamp-1 font-medium hover:underline">{d.title}</Link>
              {showClient && <div className="line-clamp-1 text-xs text-muted-foreground">{d.client_name}</div>}
            </TableCell>
            <TableCell className="hidden tabular sm:table-cell">{formatDate(d.issue_date)}</TableCell>
            <TableCell className={cn("hidden tabular md:table-cell", d.payment_state === "overdue" && "font-medium text-danger-strong")}>
              {formatDate(d.kind === "invoice" ? d.due_date : d.valid_until)}
            </TableCell>
            <TableCell className={cn("text-right tabular", d.status === "void" && "line-through")}>
              {formatYen(d.total)}
              {d.payment_state === "partial" && <div className="text-xs text-muted-foreground">残 {formatYen(d.total - d.paid_amount)}</div>}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {d.payment_state && d.status === "issued" ? <PaymentBadge state={d.payment_state} daysOverdue={d.days_overdue} /> : <StatusBadge status={d.status} />}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
