import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { ArchiveButton, DeleteMasterButton } from "@/components/masters/archive-button";
import { ItemFormButton } from "@/components/masters/item-form";
import { asCurrentUser } from "@/lib/auth";
import { listItems } from "@/lib/data/masters";
import { can } from "@/lib/domain/labels";
import { TAX_RATE_LABEL } from "@/lib/domain/tax";
import { formatNumber, formatYen } from "@/lib/format";

export const metadata = { title: "品目" };

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const { rows, user } = await asCurrentUser(async (tx, user) => ({ rows: await listItems(tx, { q: sp.q, archived }), user }));
  const editable = can.edit(user.role);
  return (
    <div className="space-y-5">
      <PageHeader
        title="品目"
        description="よく使う商品・サービスの単価（税抜）と税率。書類の明細で選ぶと自動で入ります。"
        actions={editable && <ItemFormButton />}
      />
      <Card className="gap-0 py-0">
        <ListFilters placeholder="品目名・コードで検索" toggles={[{ key: "archived", label: "アーカイブ済みを表示" }]} />
        {rows.length === 0 ? (
          <EmptyState icon={Package} title="品目がありません" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">コード</TableHead>
                <TableHead>品目名</TableHead>
                <TableHead className="text-right">単価（税抜）</TableHead>
                <TableHead className="hidden sm:table-cell">単位</TableHead>
                <TableHead>税率</TableHead>
                <TableHead className="hidden text-right md:table-cell">使用回数</TableHead>
                {editable && <TableHead className="w-0"><span className="sr-only">操作</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-muted-foreground tabular">{i.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{i.name}</div>
                    {i.description && <div className="text-xs text-muted-foreground">{i.description}</div>}
                  </TableCell>
                  <TableCell className={`text-right tabular ${i.unit_price < 0 ? "text-danger-strong" : ""}`}>{formatYen(i.unit_price)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{i.unit}</TableCell>
                  <TableCell>
                    <Badge variant={i.tax_rate === 8 ? "warning" : i.tax_rate === 0 ? "neutral" : "info"}>{TAX_RATE_LABEL[i.tax_rate]}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">{formatNumber(i.used)}</TableCell>
                  {editable && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <ItemFormButton
                          id={i.id}
                          initial={{ code: i.code, name: i.name, unit: i.unit, unit_price: String(i.unit_price), tax_rate: String(i.tax_rate), description: i.description ?? "" }}
                        />
                        <ArchiveButton kind="item" id={i.id} name={i.name} archived={archived} />
                        {can.deleteMaster(user.role) && i.used === 0 && <DeleteMasterButton kind="item" id={i.id} name={i.name} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
