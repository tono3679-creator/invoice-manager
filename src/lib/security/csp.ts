/**
 * Content Security Policy。
 *   スクリプトはリクエストごとの nonce が付いたもの（とそこから読み込まれたもの）だけ実行する。
 *   通信先・画像は自分のサイトだけ（社印などの画像は data: で扱う）。
 *   ほかのサイトの iframe に埋め込ませない（クリックジャッキング対策）。PDF のプレビューは自分のサイトの frame だけ許可する。
 */
export function buildCsp(nonce: string, options: { dev: boolean }): string {
  const directives: Record<string, (string | null | undefined | false)[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", options.dev && "'unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values.filter(Boolean)].join(" "))
    .join("; ");
}

/** 推測できない nonce（リクエストごとに作る） */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
