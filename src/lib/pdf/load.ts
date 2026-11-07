import "server-only";
import type { Tx } from "@/lib/db";
import { getDocument, getIssuerSettings } from "@/lib/data/documents";
import type { PaperData } from "@/components/documents/document-paper";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/domain/labels";
import type { ReceiptData } from "./render";

/** PDF に載せる内容。発行済みの書類は発行した時点の宛先・発行元、下書きは今の内容 */
export async function loadPaper(tx: Tx, id: string): Promise<PaperData | null> {
  const data = await getDocument(tx, id);
  if (!data) return null;
  const { doc, lines, client } = data;
  const settings = await getIssuerSettings(tx);
  const frozen = doc.client_snapshot && doc.issuer_snapshot;
  return {
    ...doc,
    lines,
    client: frozen ? (doc.client_snapshot as unknown as PaperData["client"]) : client,
    issuer: frozen ? (doc.issuer_snapshot as unknown as PaperData["issuer"]) : { ...settings, seal_text: settings.seal_text ?? settings.legal_name },
  };
}

export async function loadReceipt(tx: Tx, paymentId: string): Promise<ReceiptData | null> {
  const [p] = await tx<{ id: string; paid_on: string; amount: number; method: PaymentMethod; receipt_number: string | null; invoice_id: string }[]>`
    select id, paid_on, amount, method, receipt_number, invoice_id from payments where id = ${paymentId}`;
  if (!p?.receipt_number) return null;
  const paper = await loadPaper(tx, p.invoice_id);
  if (!paper || !paper.number) return null;
  return {
    receiptNumber: p.receipt_number, paidOn: p.paid_on, amount: p.amount, method: PAYMENT_METHOD_LABEL[p.method],
    invoice: { number: paper.number, title: paper.title, total: paper.total, taxable_10: paper.taxable_10, tax_10: paper.tax_10, taxable_8: paper.taxable_8, tax_8: paper.tax_8, taxable_0: paper.taxable_0 },
    client: paper.client, issuer: paper.issuer, full: p.amount === paper.total,
  };
}

/** 日本語のファイル名でダウンロード・表示できるようにする */
export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean): Response {
  const safe = filename.replace(/[\\/:*?"<>|\s]+/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
