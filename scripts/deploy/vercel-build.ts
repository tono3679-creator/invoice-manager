/**
 * Vercel でのビルドの前処理（package.json の vercel-build）。
 * 本番（VERCEL_ENV=production）のときだけ、環境変数の確認 → マイグレーション → 見本の会社の作り直し を行う。
 * プレビューでは DB を変更しない。
 */
import postgres from "postgres";
import { toPostgresJsUrl } from "../../src/lib/db/url";
import { migrate } from "../db/migrate";
import { seedShowcase } from "../seed/seed";
import { checkProductionEnv } from "./production-env";

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log(`DB の準備：本番ではない（${process.env.VERCEL_ENV ?? "Vercel の外"}）ため、DB は変更しません`);
    return;
  }
  const errors = checkProductionEnv(process.env);
  if (errors.length > 0) {
    console.error("公開に必要な設定が足りません（Vercel の Settings → Environment Variables で設定し、Redeploy してください）：");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL) as string;
  const sql = postgres(toPostgresJsUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(sql);
    await seedShowcase(sql, { password: process.env.SEED_LOGIN_PASSWORD as string });
  } finally {
    await sql.end();
  }
  console.log("DB の準備ができました");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
