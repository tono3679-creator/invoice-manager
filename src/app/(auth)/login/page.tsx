import { redirect } from "next/navigation";
import { FileCheck2, Percent, Stamp, Wallet } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { getCurrentUser } from "@/lib/auth";
import { LoginPanel } from "./login-panel";

export const metadata = { title: "ログイン" };

const FEATURES = [
  { icon: Stamp, title: "承認してから発行", text: "作成者が依頼し、承認者が確認。自分の書類は自分で承認できません。" },
  { icon: Percent, title: "インボイス制度に対応", text: "登録番号の記載、税率ごとの合計と消費税、端数処理は税率ごとに1回。" },
  { icon: FileCheck2, title: "見積 → 請求 → 領収", text: "見積書からワンクリックで請求書へ。入金を記録すれば領収書も PDF で。" },
  { icon: Wallet, title: "未入金を見逃さない", text: "支払条件から期限を自動計算。期限超過と売掛金の年齢表をひと目で。" },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar px-12 py-12 text-sidebar-foreground lg:flex lg:flex-col">
        <Logo inverted />
        <div className="my-auto max-w-lg">
          <p className="text-sm font-medium text-brand">中小企業向け 見積書・請求書作成システム</p>
          <h1 className="text-keep mt-3 text-4xl leading-tight font-bold text-white">
            請求の仕事を、
            <br />
            チームで正確に。
          </h1>
          <p className="text-keep mt-4 text-base text-sidebar-muted">
            Excel のひな形とメールの承認をやめて、見積・承認・請求・入金をひとつの流れに。
            社員10〜100名の会社が、担当と承認者を分けて安心して使えるシステムです。
          </p>
          <ul className="mt-10 grid gap-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                  <f.icon className="size-5 text-white" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold text-white">{f.title}</div>
                  <div className="text-keep text-sm text-sidebar-muted">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">表示されるデータはすべて架空のデモデータです。</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <LoginPanel />
        </div>
      </section>
    </div>
  );
}
