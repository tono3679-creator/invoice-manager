import "server-only";
import type { Tx } from "@/lib/db";

export type DashboardSummary = {
  billed: number; billed_prev: number; collected: number; collected_prev: number;
  outstanding: number; outstanding_count: number; overdue: number; overdue_count: number; due_this_month: number;
  pending_count: number; draft_count: number; quotes_open: number; quotes_open_count: number;
};

export async function getDashboard(tx: Tx, month: string) {
  const [[summary], monthly, overdue] = await Promise.all([
    tx<{ s: DashboardSummary }[]>`select dashboard_summary(${month}::date) s`,
    tx<{ month: string; billed: number; collected: number }[]>`select * from monthly_billing(${month}::date, 12)`,
    tx<{ id: string; number: string; title: string; client_name: string; due_date: string; balance: number; days_overdue: number }[]>`
      select b.id, b.number, b.title, c.name client_name, b.due_date, b.balance, b.days_overdue
        from invoice_balances b join clients c on c.id = b.client_id
       where b.payment_state = 'overdue' order by b.days_overdue desc, b.balance desc limit 6`,
  ]);
  return { summary: summary.s, monthly, overdue };
}
