import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Invoice Manager", template: "%s | Invoice Manager" },
  description: "中小企業向けの見積書・請求書作成システム。承認の流れ、インボイス制度に対応した計算、PDF 出力、入金管理をひとつに。",
};

export const viewport: Viewport = {
  themeColor: "#1f3340",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // ページは毎回サーバーで描画する（ログイン状態で内容が変わり、CSP の nonce をスクリプトに付けるため）
  await connection();
  return (
    <html lang="ja">
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
