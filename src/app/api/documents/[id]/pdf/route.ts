import { getCurrentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { KIND_LABEL } from "@/lib/domain/labels";
import { loadPaper, pdfResponse } from "@/lib/pdf/load";
import { renderDocumentPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

/** 見積書・請求書の PDF（ログイン中の利用者の会社の書類だけ。RLS で確かめる） */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "見つかりません" }, { status: 404 });
  const paper = await asUser(user.userId, (tx) => loadPaper(tx, id));
  if (!paper) return Response.json({ error: "見つかりません" }, { status: 404 });
  const bytes = await renderDocumentPdf(paper);
  const name = `${KIND_LABEL[paper.kind]}_${paper.number ?? "下書き"}_${paper.client.name}.pdf`;
  return pdfResponse(bytes, name, new URL(request.url).searchParams.has("download"));
}
