/**
 * 見積書・請求書・領収書の PDF（A4 縦）。pdf-lib で直接描く（ブラウザや外部サービスは使わない）。
 * 画面のプレビュー（components/documents/document-paper.tsx）と同じ項目・同じ並び。
 * 日本語は IPAゴシック（assets/fonts）を、使う文字だけ埋め込む。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaperData } from "@/components/documents/document-paper";

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // 余白
const INK = rgb(0.114, 0.141, 0.188);
const MUTED = rgb(0.357, 0.392, 0.447);
const LINE = rgb(0.867, 0.89, 0.91);
const HEAD = rgb(0.122, 0.2, 0.251);
const TINT = rgb(0.933, 0.953, 0.961);
const RED = rgb(0.784, 0.157, 0.176);

let fontBytes: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  fontBytes ??= readFile(path.join(process.cwd(), "assets/fonts/ipag.ttf"));
  return fontBytes;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const num = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
const date = (d: string | null) => (d ? `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : "");

class Canvas {
  page!: PDFPage;
  constructor(readonly doc: PDFDocument, readonly font: PDFFont) {}
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    return this.page;
  }
  width(text: string, size: number) {
    return this.font.widthOfTextAtSize(text, size);
  }
  /** y は上からの距離（pdf-lib は下から数えるので変換する） */
  text(text: string, x: number, y: number, size: number, opts: { align?: "left" | "right" | "center"; color?: ReturnType<typeof rgb>; bold?: boolean } = {}) {
    const w = this.width(text, size);
    const dx = opts.align === "right" ? -w : opts.align === "center" ? -w / 2 : 0;
    const draw = (ox: number) => this.page.drawText(text, { x: x + dx + ox, y: A4.h - y - size, size, font: this.font, color: opts.color ?? INK });
    draw(0);
    // 太字の代わり（IPAゴシックには太字がないため、少しずらして重ね描きする）
    if (opts.bold) draw(0.35);
  }
  rect(x: number, y: number, w: number, h: number, opts: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; width?: number; opacity?: number } = {}) {
    this.page.drawRectangle({
      x, y: A4.h - y - h, width: w, height: h, color: opts.fill, borderColor: opts.stroke, borderWidth: opts.stroke ? (opts.width ?? 1) : 0,
      opacity: opts.opacity, borderOpacity: opts.opacity,
    });
  }
  line(x1: number, y: number, x2: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: A4.h - y }, end: { x: x2, y: A4.h - y }, color, thickness });
  }
  /** 幅に収まるように折り返す（日本語は1文字ずつ） */
  wrap(text: string, size: number, maxWidth: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const ch of [...para]) {
        if (this.width(line + ch, size) > maxWidth && line) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
      out.push(line);
    }
    return out;
  }
  /** 角印（画面の Seal と同じ並び：縦書き・右の列から） */
  seal(text: string, x: number, y: number, size: number) {
    const chars = [...text].slice(0, 12);
    const cols = chars.length <= 3 ? 1 : chars.length <= 4 ? 2 : chars.length <= 9 ? 3 : 4;
    const rows = Math.ceil(chars.length / cols);
    this.rect(x + 1.5, y + 1.5, size - 3, size - 3, { stroke: RED, width: 2, opacity: 0.85 });
    const fs = (size * 0.74) / Math.max(cols, rows);
    chars.forEach((ch, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const cx = x + 5 + ((cols - 1 - col + 0.5) / cols) * (size - 10);
      const cy = y + 5 + ((row + 0.5) / rows) * (size - 10);
      const w = this.width(ch, fs);
      this.page.drawText(ch, { x: cx - w / 2, y: A4.h - cy - fs * 0.36, size: fs, font: this.font, color: RED, opacity: 0.85 });
      this.page.drawText(ch, { x: cx - w / 2 + 0.3, y: A4.h - cy - fs * 0.36, size: fs, font: this.font, color: RED, opacity: 0.85 });
    });
  }
  watermark(text: string) {
    const size = 96;
    const w = this.width(text, size);
    this.page.drawText(text, {
      x: A4.w / 2 - (w / 2) * Math.cos(Math.PI / 7.5), y: A4.h / 2 - (w / 2) * Math.sin(Math.PI / 7.5),
      size, font: this.font, color: RED, opacity: 0.1, rotate: degrees(24),
    });
  }
}

async function setup(title: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await loadFont(), { subset: true });
  doc.setTitle(title);
  doc.setCreator("Invoice Manager");
  doc.setProducer("Invoice Manager");
  doc.setLanguage("ja-JP");
  return new Canvas(doc, font);
}

/** 発行元（右上のブロック）を描いて、下端の y を返す */
function issuerBlock(c: Canvas, s: PaperData["issuer"], top: number): number {
  const right = A4.w - M;
  const seal = !!(s.show_seal && s.seal_text);
  // 社印は会社名の下・右端に置き、住所などはその左に寄せる（文字と重ならないように）
  const textRight = seal ? right - 62 : right;
  let y = top;
  c.text(s.legal_name, right, y, 11.5, { align: "right", bold: true });
  y += 18;
  for (const t of [s.postal_code ? `〒${s.postal_code}` : null, s.address, s.phone ? `TEL ${s.phone}` : null, s.email]) {
    if (!t) continue;
    c.text(t, textRight, y, 8.5, { align: "right" });
    y += 12.5;
  }
  if (s.registration_number) {
    c.text(`登録番号：${s.registration_number}`, textRight, y + 2, 8.5, { align: "right" });
    y += 14.5;
  }
  if (seal) c.seal(s.seal_text as string, right - 54, top + 20, 54);
  return Math.max(y, top + 78);
}

export async function renderDocumentPdf(data: PaperData): Promise<Uint8Array> {
  const isInvoice = data.kind === "invoice";
  const title = isInvoice ? "請求書" : "御見積書";
  const c = await setup(`${title} ${data.number ?? "（下書き）"} ${data.client.name}`);
  const watermark = data.status === "void" ? "取り消し" : ["draft", "pending", "approved"].includes(data.status) ? "下書き" : null;
  const right = A4.w - M;
  const contentW = A4.w - M * 2;

  // 明細の列（品名・数量・単位・単価・金額）
  const col = { qty: M + contentW * 0.6, unit: M + contentW * 0.62, price: M + contentW * 0.82, amount: right };
  const rowH = 20;

  const header = (first: boolean) => {
    c.newPage();
    if (watermark) c.watermark(watermark);
    c.text(title.split("").join(first ? "  " : " "), M, M, first ? 22 : 14, { bold: true });
    c.text(`${isInvoice ? "請求書番号" : "見積番号"}　${data.number ?? "（発行時に採番）"}`, right, M, 8.5, { align: "right" });
    c.text(`発行日　${data.issue_date ? date(data.issue_date) : "（発行日）"}`, right, M + 13, 8.5, { align: "right" });
  };
  const tableHead = (y: number) => {
    c.rect(M, y, contentW, 18, { fill: HEAD });
    const ty = y + 4.5;
    c.text("品名", M + 6, ty, 8.5, { color: rgb(1, 1, 1) });
    c.text("数量", col.qty - 4, ty, 8.5, { align: "right", color: rgb(1, 1, 1) });
    c.text("単位", col.unit + 4, ty, 8.5, { color: rgb(1, 1, 1) });
    c.text("単価", col.price - 4, ty, 8.5, { align: "right", color: rgb(1, 1, 1) });
    c.text("金額", col.amount - 6, ty, 8.5, { align: "right", color: rgb(1, 1, 1) });
    return y + 18;
  };

  header(true);
  // 宛先（左）
  let y = M + 52;
  const cl = data.client;
  if (cl.postal_code) { c.text(`〒${cl.postal_code}`, M, y, 8.5, { color: MUTED }); y += 12; }
  if (cl.address) { for (const l of c.wrap(cl.address, 8.5, contentW * 0.52)) { c.text(l, M, y, 8.5, { color: MUTED }); y += 12; } }
  y += 6;
  const nameSize = 14;
  const nameLines = c.wrap(cl.name, nameSize, contentW * 0.48);
  for (const l of nameLines) { c.text(l, M, y, nameSize, { bold: true }); y += 19; }
  c.text(cl.honorific ?? "御中", M + Math.min(c.width(nameLines.at(-1) ?? "", nameSize) + 8, contentW * 0.5), y - 17, 10);
  c.line(M, y + 1, M + contentW * 0.55, INK, 0.8);
  y += 7;
  const contact = [cl.department, cl.contact_name].filter(Boolean).join("　");
  if (contact) { c.text(contact, M, y, 8.5, { color: MUTED }); y += 13; }
  y += 8;
  c.text(isInvoice ? "下記のとおりご請求申し上げます。" : "下記のとおりお見積り申し上げます。", M, y, 9);
  y += 20;
  c.text("件名", M, y, 9, { color: MUTED });
  for (const l of c.wrap(data.title, 9.5, contentW * 0.45)) { c.text(l, M + 62, y, 9.5); y += 14; }
  c.text(isInvoice ? "お支払期限" : "有効期限", M, y, 9, { color: MUTED });
  c.text(isInvoice ? (data.due_date ? date(data.due_date) : "（支払条件から自動）") : (data.valid_until ? date(data.valid_until) : "（発行日から自動）"), M + 62, y, 9.5);
  y += 20;
  c.rect(M, y, contentW * 0.55, 30, { fill: TINT });
  c.text(`${isInvoice ? "ご請求金額" : "お見積金額"}（税込）`, M + 8, y + 9.5, 9.5);
  c.text(yen(data.total), M + contentW * 0.55 - 8, y + 6, 16, { align: "right", bold: true });
  const leftBottom = y + 30;

  const issuerBottom = issuerBlock(c, data.issuer, M + 52);
  y = Math.max(leftBottom, issuerBottom) + 22;

  // 明細
  y = tableHead(y);
  const descW = col.qty - M - 60;
  for (const l of data.lines) {
    const desc = `${l.description}${l.tax_rate === 8 ? " ※" : ""}${l.tax_rate === 0 ? "（対象外）" : ""}`;
    const wrapped = c.wrap(desc, 8.5, descW);
    const h = Math.max(rowH, wrapped.length * 11.5 + 8.5);
    if (y + h > A4.h - M - 40) {
      c.text("次のページに続きます", right, A4.h - M - 10, 8, { align: "right", color: MUTED });
      header(false);
      y = tableHead(M + 34);
    }
    wrapped.forEach((t, i) => c.text(t, M + 6, y + 5.5 + i * 11.5, 8.5));
    c.text(num(l.quantity), col.qty - 4, y + 5.5, 8.5, { align: "right" });
    c.text(l.unit, col.unit + 4, y + 5.5, 8.5);
    c.text(num(l.unit_price), col.price - 4, y + 5.5, 8.5, { align: "right" });
    c.text(num(l.amount), col.amount - 6, y + 5.5, 8.5, { align: "right", color: l.amount < 0 ? RED : INK });
    y += h;
    c.line(M, y, right);
  }

  // 合計（税率ごとの対価と消費税）
  const totals: [string, string][] = [["小計（税抜）", yen(data.subtotal)]];
  if (data.taxable_10 !== 0) totals.push([`10%対象　${yen(data.taxable_10)}`, `消費税 ${yen(data.tax_10)}`]);
  if (data.taxable_8 !== 0) totals.push([`8%対象※　${yen(data.taxable_8)}`, `消費税 ${yen(data.tax_8)}`]);
  if (data.taxable_0 !== 0) totals.push(["対象外", yen(data.taxable_0)]);
  const need = totals.length * 15 + 60 + (data.notes ? 60 : 0) + (isInvoice && data.issuer.bank_account ? 50 : 0);
  if (y + need > A4.h - M) {
    header(false);
    y = M + 34;
  }
  y += 10;
  const tx = M + contentW * 0.42;
  for (const [a, b] of totals) {
    c.text(a, tx, y, 9);
    c.text(b, right - 6, y, 9, { align: "right" });
    y += 15;
  }
  c.line(tx, y, right, INK, 0.8);
  y += 5;
  c.text("合計（税込）", tx, y, 10.5, { bold: true });
  c.text(yen(data.total), right - 6, y - 1, 12, { align: "right", bold: true });
  y += 20;
  if (data.lines.some((l) => l.tax_rate === 8)) {
    c.text("※は軽減税率（8%）の対象です", right - 6, y, 7.5, { align: "right", color: MUTED });
    y += 14;
  }
  y += 6;
  if (isInvoice && data.issuer.bank_account) {
    const lines = c.wrap(data.issuer.bank_account, 9, contentW - 16);
    const h = 18 + lines.length * 13;
    c.rect(M, y, contentW, h, { stroke: LINE, width: 0.8 });
    c.text("お振込先", M + 8, y + 6, 8, { color: MUTED });
    lines.forEach((l, i) => c.text(l, M + 8, y + 18 + i * 13, 9));
    y += h + 12;
  }
  if (data.notes) {
    c.text("備考", M + 2, y, 8, { color: MUTED });
    y += 12;
    for (const l of c.wrap(data.notes, 8.5, contentW - 4)) {
      if (y > A4.h - M) break;
      c.text(l, M + 2, y, 8.5);
      y += 12;
    }
  }
  pageNumbers(c);
  return c.doc.save();
}

export type ReceiptData = {
  receiptNumber: string; paidOn: string; amount: number; method: string;
  invoice: { number: string; title: string; total: number; taxable_10: number; tax_10: number; taxable_8: number; tax_8: number; taxable_0: number };
  client: PaperData["client"];
  issuer: PaperData["issuer"];
  /** この入金で請求額をすべて受け取ったか（税率ごとの内訳を載せるのはこのとき） */
  full: boolean;
};

/** 領収書（入金1件につき1枚） */
export async function renderReceiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const c = await setup(`領収書 ${r.receiptNumber} ${r.client.name}`);
  c.newPage();
  const right = A4.w - M;
  const contentW = A4.w - M * 2;
  c.text("領  収  書", A4.w / 2, M + 4, 24, { align: "center", bold: true });
  c.text(`No. ${r.receiptNumber}`, right, M, 8.5, { align: "right" });
  c.text(`発行日　${date(r.paidOn)}`, right, M + 13, 8.5, { align: "right" });
  let y = M + 66;
  const name = `${r.client.name}　${r.client.honorific ?? "御中"}`;
  c.text(name, M, y, 14, { bold: true });
  c.line(M, y + 21, M + Math.max(contentW * 0.55, c.width(name, 14) + 10), INK, 0.8);
  y += 46;
  c.rect(M + contentW * 0.12, y, contentW * 0.76, 44, { fill: TINT });
  c.text("金額", M + contentW * 0.12 + 14, y + 15, 10);
  c.text(`${yen(r.amount)} －`, M + contentW * 0.88 - 14, y + 10, 20, { align: "right", bold: true });
  y += 64;
  c.text(`但し　${r.invoice.title}（請求書 ${r.invoice.number}）の代金として`, M + contentW * 0.12, y, 9.5);
  y += 16;
  c.text(`上記正に領収いたしました。（${r.method}）`, M + contentW * 0.12, y, 9.5);
  y += 34;

  // 税率ごとの内訳（全額の受領のときだけ。一部の入金は請求書を参照）
  const bx = M;
  c.text("内訳", bx, y, 8.5, { color: MUTED });
  y += 14;
  if (r.full) {
    const rows: [string, string][] = [];
    if (r.invoice.taxable_10 !== 0) rows.push([`10%対象　${yen(r.invoice.taxable_10 + r.invoice.tax_10)}（税込）`, `内消費税 ${yen(r.invoice.tax_10)}`]);
    if (r.invoice.taxable_8 !== 0) rows.push([`8%対象　${yen(r.invoice.taxable_8 + r.invoice.tax_8)}（税込）`, `内消費税 ${yen(r.invoice.tax_8)}`]);
    if (r.invoice.taxable_0 !== 0) rows.push(["対象外", yen(r.invoice.taxable_0)]);
    for (const [a, b] of rows) {
      c.text(a, bx, y, 9);
      c.text(b, bx + contentW * 0.5, y, 9);
      y += 14;
    }
  } else {
    c.text(`請求書 ${r.invoice.number}（請求額 ${yen(r.invoice.total)}）の一部の入金です。税率ごとの内訳は請求書をご覧ください。`, bx, y, 8.5);
    y += 14;
  }
  issuerBlock(c, r.issuer, Math.max(y + 24, M + 300));
  c.text("電子データで発行した領収書のため、収入印紙は貼付していません。", M, A4.h - M - 8, 7.5, { color: MUTED });
  return c.doc.save();
}

function pageNumbers(c: Canvas) {
  const pages = c.doc.getPages();
  if (pages.length < 2) return;
  pages.forEach((p, i) => {
    const t = `${i + 1} / ${pages.length}`;
    p.drawText(t, { x: A4.w / 2 - c.width(t, 8) / 2, y: 24, size: 8, font: c.font, color: MUTED });
  });
}
