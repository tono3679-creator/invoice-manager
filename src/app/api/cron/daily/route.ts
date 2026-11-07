import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = serverEnv.cronSecret;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * 毎日の定期処理（Vercel Cron。vercel.json）
 *   1. 発行日を迎えた定期請求から、請求書の下書きを作る（すべての会社）
 *   2. 期限切れのデモ会社・セッション・回数の記録を片付ける
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sql = db();
  const [g] = await sql<{ n: number }[]>`select app_private.generate_recurring_all() n`;
  const [c] = await sql<{ n: number }[]>`select app_private.demo_cleanup() n`;
  return Response.json({ ok: true, recurringCreated: g.n, demoDeleted: c.n });
}
