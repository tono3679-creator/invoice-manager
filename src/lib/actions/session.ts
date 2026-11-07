"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUserId, getCurrentUser } from "@/lib/auth";
import {
  createDemoSandbox, DEMO_PERSONAS, DEMO_TTL_HOURS, DemoCapacityError, deleteDemoOf, demoColleague, ensureDemoCapacity,
  type DemoPersona,
} from "@/lib/demo/sandbox";
import { serverEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { endSession, record, startSession, underLimit } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const loginSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const LIMITS = {
  loginEmail: { max: 10, minutes: 15 },
  loginIp: { max: 30, minutes: 15 },
  get demoIp() {
    return { max: serverEnv.demoCreateLimitPerHour, minutes: 60 };
  },
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const LOGIN_FAILED = "メールアドレスまたはパスワードが正しくありません";
const TOO_MANY = "失敗が続いたため、しばらくログインできません。15分ほどしてから再度お試しください";

export async function signInWithPassword(input: z.infer<typeof loginSchema>): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const email = parsed.data.email.trim().toLowerCase();
  const byEmail = `login:email:${email}`;
  const byIp = `login:ip:${await clientIp()}`;
  if (!(await underLimit(byEmail, LIMITS.loginEmail.max, LIMITS.loginEmail.minutes))
    || !(await underLimit(byIp, LIMITS.loginIp.max, LIMITS.loginIp.minutes))) {
    return { ok: false, error: TOO_MANY };
  }
  const [user] = await db()<{ id: string; encrypted_password: string | null }[]>`
    select id, encrypted_password from auth.users where lower(email) = ${email} and not is_anonymous`;
  if (!(await verifyPassword(parsed.data.password, user?.encrypted_password))) {
    await record(byEmail);
    await record(byIp);
    return { ok: false, error: LOGIN_FAILED };
  }
  await startSession(user.id);
  redirect("/dashboard");
}

/** デモを開始する：訪問者専用のデモ会社（社員5人）を作り、選んだ役割の社員としてログインする */
export async function startDemo(persona: DemoPersona): Promise<ActionResult> {
  if (!DEMO_PERSONAS.includes(persona)) return { ok: false, error: "不正な操作です" };
  const current = await getCurrentUser();
  if (current?.isDemo) redirect("/dashboard");
  const byIp = `demo:ip:${await clientIp()}`;
  if (!(await underLimit(byIp, LIMITS.demoIp.max, LIMITS.demoIp.minutes))) {
    return { ok: false, error: "短時間に多くのデモ環境が作られたため、しばらくお待ちください。1時間ほどで再度お試しいただけます" };
  }
  try {
    await ensureDemoCapacity();
    await record(byIp);
    const userId = await createDemoSandbox(persona);
    await startSession(userId, DEMO_TTL_HOURS * 3600_000);
  } catch (e) {
    return demoError(e);
  }
  redirect("/dashboard");
}

function demoError(e: unknown): ActionResult {
  if (e instanceof DemoCapacityError) {
    return { ok: false, error: "ただいまデモの利用が集中しているため、新しいデモ環境を用意できません。しばらくしてから再度お試しください" };
  }
  console.error(e);
  return { ok: false, error: "デモデータの準備に失敗しました。時間をおいて再度お試しください" };
}

/** ログアウト。デモのときはもう一度入る手段がないので、デモ会社と社員もその場で削除する */
export async function signOut(): Promise<void> {
  const auth = await getAuthUserId();
  if (auth?.isAnonymous) await deleteDemoOf(auth.id);
  await endSession();
  redirect("/login");
}

/** デモの中で、別の社員（役割）に切り替える。承認の流れを1人で体験できるようにするため */
export async function switchDemoPersona(persona: DemoPersona, next?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isDemo || !user.isAnonymous) redirect("/login");
  const parsed = z.enum(DEMO_PERSONAS as [DemoPersona, ...DemoPersona[]]).parse(persona);
  const target = await demoColleague(user.userId, parsed);
  if (!target) redirect("/login");
  const [row] = await db()<{ expires_at: Date }[]>`
    select c.demo_expires_at expires_at from companies c where c.id = ${user.companyId}`;
  await startSession(target, Math.max(60_000, row.expires_at.getTime() - Date.now()));
  revalidatePath("/", "layout");
  // 移動先はアプリの中のパスに限る（外部サイトへの転送を防ぐ）
  const safeNext = next && /^\/[a-z]+(\/[\w-]+)*$/.test(next) ? next : "/dashboard";
  redirect(safeNext);
}

/** デモデータを初期状態に戻す（同じ役割の社員として入り直す） */
export async function resetDemo(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isDemo || !user.isAnonymous) redirect("/login");
  const userId = await createDemoSandbox(user.role, user.userId);
  await startSession(userId, DEMO_TTL_HOURS * 3600_000);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
