import type { NextConfig } from "next";

/** すべての応答に付けるセキュリティヘッダー（CSP はリクエストごとの nonce が要るため src/proxy.ts で付ける） */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF に埋め込む日本語フォントを、サーバーの関数に含める
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./assets/fonts/ipag.ttf"],
    "/api/payments/[id]/receipt": ["./assets/fonts/ipag.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
