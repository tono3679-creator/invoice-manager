"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatYen, formatYenCompact } from "@/lib/format";

/** 月別の請求額と入金額（同じ単位なので1つの軸） */
export const SERIES = [
  { key: "billed", label: "請求額", color: "#0f9488" },
  { key: "collected", label: "入金額", color: "#4a6fd0" },
] as const;

export function BillingChart({ data }: { data: { month: string; billed: number; collected: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${Number(d.month.slice(5, 7))}月` }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="h-64" role="img" aria-label="直近12か月の請求額と入金額の棒グラフ（下に表があります）">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tickFormatter={(v: number) => formatYenCompact(v)} tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.6 }}
              formatter={(v, name) => [formatYen(Number(v)), SERIES.find((s) => s.key === name)?.label ?? String(name)]}
              labelFormatter={(_, p) => (p?.[0]?.payload?.month ? `${p[0].payload.month.slice(0, 4)}年${Number(p[0].payload.month.slice(5, 7))}月` : "")}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
            />
            {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">表で見る</summary>
        <table className="mt-2 w-full tabular">
          <thead><tr className="text-muted-foreground"><th className="text-left font-medium">月</th><th className="text-right font-medium">請求額</th><th className="text-right font-medium">入金額</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.month}><td>{r.month.slice(0, 7)}</td><td className="text-right">{formatYen(r.billed)}</td><td className="text-right">{formatYen(r.collected)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
