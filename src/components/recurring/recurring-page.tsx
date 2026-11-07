import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/common/detail";
import { PageHeader } from "@/components/common/page-header";
import { EMPTY_LINE } from "@/lib/domain/lines";
import { asCurrentUser } from "@/lib/auth";
import { getIssuerSettings } from "@/lib/data/documents";
import { clientOptions, itemOptions } from "@/lib/data/masters";
import { can } from "@/lib/domain/labels";
import { monthDay, todayJst } from "@/lib/domain/terms";
import type { TaxRate } from "@/lib/domain/tax";
import { RecurringEditor, type RecurringValues } from "./recurring-editor";

type Template = {
  client_id: string; title: string; interval_months: number; issue_day: number; next_issue_on: string; active: boolean; notes: string | null;
  lines: { item_id: string | null; description: string; quantity: number; unit: string; unit_price: number; tax_rate: TaxRate }[];
};

export async function RecurringFormPage({ id }: { id: string | null }) {
  const data = await asCurrentUser(async (tx, user) => {
    const [clients, items, settings] = await Promise.all([clientOptions(tx), itemOptions(tx), getIssuerSettings(tx)]);
    const [t] = id ? await tx<Template[]>`select * from recurring_templates where id = ${id}` : [];
    return { clients, items, settings, user, t };
  });
  if (!can.edit(data.user.role)) redirect("/recurring");
  if (id && !data.t) notFound();
  const today = todayJst();
  const [y, m] = today.split("-").map(Number);
  const t = data.t;
  const initial: RecurringValues = t
    ? {
        client_id: t.client_id, title: t.title, interval_months: String(t.interval_months), issue_day: String(t.issue_day),
        next_issue_on: t.next_issue_on, active: t.active, notes: t.notes ?? "",
        lines: t.lines.map((l) => ({ item_id: l.item_id ?? "", description: l.description, quantity: String(l.quantity), unit: l.unit, unit_price: String(l.unit_price), tax_rate: String(l.tax_rate) })),
      }
    : { client_id: "", title: "", interval_months: "1", issue_day: "0", next_issue_on: monthDay(y, m, 0), active: true, notes: data.settings.default_invoice_notes ?? "", lines: [{ ...EMPTY_LINE }] };
  return (
    <div className="space-y-5">
      <BackLink href="/recurring" label="定期請求の一覧へ" />
      <PageHeader title={id ? "定期請求を編集" : "定期請求を登録"} />
      <RecurringEditor id={id} initial={initial} clients={data.clients} items={data.items} rounding={data.settings.rounding} />
    </div>
  );
}
