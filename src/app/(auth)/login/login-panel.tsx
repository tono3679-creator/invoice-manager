"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, FilePen, Loader2, ShieldCheck, Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signInWithPassword, startDemo } from "@/lib/actions/session";
import { safeAction } from "@/lib/client/safe-action";
import type { DemoPersona } from "@/lib/demo/sandbox";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const PERSONAS: { persona: DemoPersona; icon: typeof Stamp; title: string; text: string }[] = [
  { persona: "member", icon: FilePen, title: "作成者として体験", text: "営業の鈴木さん：見積書・請求書を作って承認を依頼" },
  { persona: "approver", icon: Stamp, title: "承認者として体験", text: "経理部長の佐藤さん：承認・発行・入金の管理" },
  { persona: "admin", icon: ShieldCheck, title: "管理者として体験", text: "代表の山田さん：すべての操作と会社の設定" },
];

export function LoginPanel() {
  const [pending, setPending] = useState<DemoPersona | null>(null);
  const [, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const demo = (persona: DemoPersona) => {
    setPending(persona);
    startTransition(async () => {
      const result = await safeAction(() => startDemo(persona));
      if (result && !result.ok) {
        toast.error(result.error);
        setPending(null);
      }
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await safeAction(() => signInWithPassword(values));
    if (result && !result.ok) toast.error(result.error);
  });

  const busy = pending !== null || form.formState.isSubmitting;

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">デモを体験する</h2>
      <p className="text-keep mt-1.5 text-sm text-muted-foreground">
        登録は不要です。あなた専用のデモ環境（架空の制作会社・社員5人）がすぐに作られます。体験中も画面の上で役割を切り替えられます。
      </p>

      <div className="mt-6 grid gap-3">
        {PERSONAS.map((item, i) => (
          <button
            key={item.persona}
            type="button"
            onClick={() => demo(item.persona)}
            disabled={busy}
            className={cn(
              "group flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] hover:border-brand/60 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
              i === 0 && "border-brand/40",
            )}
          >
            <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", i === 0 ? "bg-brand text-white" : "bg-primary text-primary-foreground")}>
              <item.icon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{item.title}</div>
              <div className="text-keep text-sm text-muted-foreground">{item.text}</div>
            </div>
            {pending === item.persona ? (
              <Loader2 className="size-5 animate-spin text-brand" aria-label="準備中" />
            ) : (
              <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => demo("viewer")}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {pending === "viewer" ? <Loader2 className="size-4 animate-spin" aria-label="準備中" /> : <Eye className="size-4" aria-hidden />}
          閲覧のみの権限で見る
        </button>
      </div>
      {pending && (
        <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">
          デモ用の会社（書類 約200件・過去12か月分）を準備しています…
        </p>
      )}

      <div className="my-8 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        アカウントをお持ちの方
        <Separator className="flex-1" />
      </div>

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="email">メールアドレス</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
          {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">パスワード</Label>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          ログイン
        </Button>
      </form>
    </div>
  );
}
