import { getCurrentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadReceipt, pdfResponse } from "@/lib/pdf/load";
import { renderReceiptPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

/** 領収書の PDF（領収書を発行した入金だけ） */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "見つかりません" }, { status: 404 });
  const receipt = await asUser(user.userId, (tx) => loadReceipt(tx, id));
  if (!receipt) return Response.json({ error: "領収書が見つかりません" }, { status: 404 });
  const bytes = await renderReceiptPdf(receipt);
  return pdfResponse(bytes, `領収書_${receipt.receiptNumber}_${receipt.client.name}.pdf`, new URL(request.url).searchParams.has("download"));
}
