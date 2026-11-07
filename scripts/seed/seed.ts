/**
 * 見本の会社（メールアドレスとパスワードでログインする）を作り直す。
 *   npm run db:seed
 * 公開環境ではビルドのたびに自動で実行する（scripts/deploy/vercel-build.ts）。
 * ログイン：admin@ / approver@ / member@ / member2@ / viewer@invoice.example（パスワードは SEED_LOGIN_PASSWORD）
 */
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { DEFAULT_DEMO_SEED, generateDemoData } from "../../src/lib/demo/generator";
import { loadDataset } from "../../src/lib/demo/load";
import { STAFF } from "../../src/lib/demo/master-data";
import { toPostgresJsUrl } from "../../src/lib/db/url";
import { hashPassword } from "../../src/lib/password";

/** ローカル用の既定のパスワード（公開環境では使えない。scripts/deploy/production-env.ts） */
export const LOCAL_DEFAULT_PASSWORD = "demo-login-2026";

export async function seedShowcase(sql: Sql, opts: { password: string; now?: Date; log?: (s: string) => void }) {
  const log = opts.log ?? console.log;
  const emails = STAFF.map((s) => s.email);
  const companyId = crypto.randomUUID();
  const data = generateDemoData({
    seed: DEFAULT_DEMO_SEED, now: opts.now ?? new Date(), companyId,
    mode: { kind: "showcase", passwordHash: await hashPassword(opts.password) },
  });
  await loadDataset(sql, data, async (tx) => {
    // 前の見本の会社と、そのログイン用の利用者を消す
    await tx`delete from companies where is_showcase`;
    await tx`delete from auth.users where lower(email) = any(${emails}::text[])`;
  });
  log(`見本の会社を作り直しました（書類 ${data.documents.length} 件・入金 ${data.payments.length} 件）`);
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL を設定してください");
  const sql = postgres(toPostgresJsUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await seedShowcase(sql, { password: process.env.SEED_LOGIN_PASSWORD || LOCAL_DEFAULT_PASSWORD });
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
