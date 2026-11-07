import type { DocKind, DocStatus } from "@/lib/domain/labels";
import type { TaxRate } from "@/lib/domain/tax";
import { formatDate, formatNumber, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PaperParty = {
  name: string; honorific?: string | null; department?: string | null; contact_name?: string | null;
  postal_code?: string | null; address?: string | null;
};
export type PaperIssuer = {
  legal_name: string; postal_code?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  registration_number?: string | null; bank_account?: string | null; show_seal?: boolean | null; seal_text?: string | null;
};
export type PaperData = {
  kind: DocKind; status: DocStatus; number: string | null; title: string; issue_date: string | null; due_date: string | null;
  valid_until: string | null; notes: string | null;
  subtotal: number; taxable_10: number; tax_10: number; taxable_8: number; tax_8: number; taxable_0: number; tax_total: number; total: number;
  lines: { position: number; description: string; quantity: number; unit: string; unit_price: number; tax_rate: TaxRate; amount: number }[];
  client: PaperParty;
  issuer: PaperIssuer;
};

/** 角印（会社名の文字から描く。画像は使わない）。PDF でも同じ形で描く（src/lib/pdf/render.ts） */
export function Seal({ text, size = 64 }: { text: string; size?: number }) {
  const chars = [...text].slice(0, 12);
  const cols = chars.length <= 3 ? 1 : chars.length <= 4 ? 2 : chars.length <= 9 ? 3 : 4;
  const rows = Math.ceil(chars.length / cols);
  // 縦書き・右の列から（印鑑の並び）
  const cells: { ch: string; x: number; y: number }[] = chars.map((ch, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    return { ch, x: (cols - 1 - col + 0.5) / cols, y: (row + 0.5) / rows };
  });
  const fs = (size * 0.78) / Math.max(cols, rows);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`社印（${text}）`} role="img" className="text-[#c8282d]">
      <rect x={2} y={2} width={size - 4} height={size - 4} rx={3} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.88} />
      {cells.map((c, i) => (
        <text key={i} x={6 + c.x * (size - 12)} y={6 + c.y * (size - 12)} fontSize={fs} textAnchor="middle" dominantBaseline="central"
          fill="currentColor" opacity={0.88} fontWeight={700} style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>
          {c.ch}
        </text>
      ))}
    </svg>
  );
}

const TITLE: Record<DocKind, string> = { quote: "御見積書", invoice: "請求書" };

/**
 * 書類の見た目（A4 の紙）。PDF（src/lib/pdf/render.ts）と同じ項目・同じ並びにしている。
 * 適格請求書の記載事項：発行者の名称と登録番号・取引年月日・取引内容（軽減税率の対象は※）・
 * 税率ごとの対価の額と消費税額・宛先
 */
export function DocumentPaper({ data, className }: { data: PaperData; className?: string }) {
  const watermark = data.status === "void" ? "取り消し" : ["draft", "pending", "approved"].includes(data.status) ? "下書き" : null;
  const hasReduced = data.lines.some((l) => l.tax_rate === 8);
  const c = data.client;
  const s = data.issuer;
  return (
    <div className={cn("print-area relative mx-auto w-full max-w-[794px] overflow-hidden rounded-sm border bg-white text-[#1d2430] shadow-sm", className)}>
      {watermark && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
          <span className="-rotate-[24deg] text-[110px] font-bold tracking-widest text-[#c8282d]/10 select-none">{watermark}</span>
        </div>
      )}
      <div className="paper aspect-[210/297] w-full px-[6%] py-[6%] text-[12px] leading-relaxed">
        <div className="flex items-start justify-between">
          <h2 className="text-[26px] font-bold tracking-[0.5em]">{TITLE[data.kind]}</h2>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-right tabular">
            <dt className="text-[#5b6472]">{data.kind === "invoice" ? "請求書番号" : "見積番号"}</dt>
            <dd>{data.number ?? "（発行時に採番）"}</dd>
            <dt className="text-[#5b6472]">発行日</dt>
            <dd>{data.issue_date ? formatDate(data.issue_date) : "（発行日）"}</dd>
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-[1.15fr_1fr] gap-6">
          <div>
            {c.postal_code && <div className="text-[#5b6472]">〒{c.postal_code}</div>}
            {c.address && <div className="text-[#5b6472]">{c.address}</div>}
            <div className="mt-2 border-b border-[#1d2430] pb-1 text-[17px] font-bold">
              {c.name}
              <span className="ml-2 text-[13px] font-normal">{c.honorific ?? "御中"}</span>
            </div>
            {(c.department || c.contact_name) && (
              <div className="mt-1 text-[#5b6472]">{[c.department, c.contact_name].filter(Boolean).join("　")}</div>
            )}
            <p className="mt-4">
              {data.kind === "invoice" ? "下記のとおりご請求申し上げます。" : "下記のとおりお見積り申し上げます。"}
            </p>
            <div className="mt-3 grid grid-cols-[5.5em_1fr] gap-y-1">
              <span className="text-[#5b6472]">件名</span><span className="font-medium">{data.title}</span>
              {data.kind === "invoice" ? (
                <><span className="text-[#5b6472]">お支払期限</span><span className="tabular">{data.due_date ? formatDate(data.due_date) : "（支払条件から自動）"}</span></>
              ) : (
                <><span className="text-[#5b6472]">有効期限</span><span className="tabular">{data.valid_until ? formatDate(data.valid_until) : "（発行日から自動）"}</span></>
              )}
            </div>
            <div className="mt-4 flex items-baseline justify-between rounded-sm bg-[#eef3f5] px-3 py-2">
              <span className="font-medium">{data.kind === "invoice" ? "ご請求金額" : "お見積金額"}（税込）</span>
              <span className="text-[22px] font-bold tabular">{formatYen(data.total)}</span>
            </div>
          </div>
          <div className="pt-1 text-right">
            <div className="text-[14px] font-bold">{s.legal_name}</div>
            <div className="mt-1 flex items-start justify-end gap-2">
              <div>
                {s.postal_code && <div>〒{s.postal_code}</div>}
                {s.address && <div>{s.address}</div>}
                {s.phone && <div className="tabular">TEL {s.phone}</div>}
                {s.email && <div className="break-all">{s.email}</div>}
                {s.registration_number && <div className="mt-1 tabular">登録番号：{s.registration_number}</div>}
              </div>
              {s.show_seal && s.seal_text && <div className="shrink-0 opacity-90"><Seal text={s.seal_text} size={58} /></div>}
            </div>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse tabular">
          <thead>
            <tr className="bg-[#1f3340] text-white">
              <th className="px-2 py-1.5 text-left font-medium">品名</th>
              <th className="w-[10%] px-2 py-1.5 text-right font-medium">数量</th>
              <th className="w-[10%] whitespace-nowrap px-2 py-1.5 text-left font-medium">単位</th>
              <th className="w-[16%] px-2 py-1.5 text-right font-medium">単価</th>
              <th className="w-[18%] px-2 py-1.5 text-right font-medium">金額</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.position} className="border-b border-[#dde3e8]">
                <td className="px-2 py-1.5">
                  {l.description}
                  {l.tax_rate === 8 && <span className="ml-1">※</span>}
                  {l.tax_rate === 0 && <span className="ml-1 text-[#5b6472]">（非課税・対象外）</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{formatNumber(l.quantity)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{l.unit}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(l.unit_price)}</td>
                <td className={cn("px-2 py-1.5 text-right", l.amount < 0 && "text-[#c8282d]")}>{formatNumber(l.amount)}</td>
              </tr>
            ))}
            {data.lines.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-[#5b6472]">明細がありません</td></tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <dl className="grid w-[58%] grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular">
            <dt>小計（税抜）</dt><dd className="text-right">{formatYen(data.subtotal)}</dd>
            {data.taxable_10 !== 0 && <><dt>10%対象　{formatYen(data.taxable_10)}</dt><dd className="text-right">消費税 {formatYen(data.tax_10)}</dd></>}
            {data.taxable_8 !== 0 && <><dt>8%対象※　{formatYen(data.taxable_8)}</dt><dd className="text-right">消費税 {formatYen(data.tax_8)}</dd></>}
            {data.taxable_0 !== 0 && <><dt>対象外</dt><dd className="text-right">{formatYen(data.taxable_0)}</dd></>}
            <dt className="border-t border-[#1d2430] pt-1 font-bold">合計（税込）</dt>
            <dd className="border-t border-[#1d2430] pt-1 text-right font-bold">{formatYen(data.total)}</dd>
          </dl>
        </div>
        {hasReduced && <p className="mt-1 text-right text-[10px] text-[#5b6472]">※は軽減税率（8%）の対象です</p>}

        {data.kind === "invoice" && s.bank_account && (
          <div className="mt-5 rounded-sm border border-[#dde3e8] px-3 py-2">
            <div className="text-[#5b6472]">お振込先</div>
            <div>{s.bank_account}</div>
          </div>
        )}
        {data.notes && (
          <div className="mt-3 px-1">
            <div className="text-[#5b6472]">備考</div>
            <div className="whitespace-pre-wrap">{data.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
