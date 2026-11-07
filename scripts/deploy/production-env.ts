/** 公開環境に必要な環境変数の確認（足りないものを日本語で返す） */
export function checkProductionEnv(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  if (!env.DATABASE_URL) errors.push("DATABASE_URL：Vercel の Storage から Neon（Postgres）を接続してください");
  const pw = env.SEED_LOGIN_PASSWORD ?? "";
  if (pw.length < 12) errors.push("SEED_LOGIN_PASSWORD：見本の会社のログイン用パスワード（12文字以上）を設定してください");
  else if (pw === "demo-login-2026") errors.push("SEED_LOGIN_PASSWORD：README に載っているローカル用の値は使えません");
  if ((env.CRON_SECRET ?? "").length < 16) errors.push("CRON_SECRET：毎日の定期処理用の合言葉（16文字以上のランダムな文字列）を設定してください");
  return errors;
}
