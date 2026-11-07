import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { DEFAULT_DEMO_SEED, generateDemoData } from "./generator";
import { loadDataset } from "./load";
import { STAFF } from "./master-data";

export const DEMO_TTL_HOURS = 24;
export type DemoPersona = "admin" | "approver" | "member" | "viewer";
export const DEMO_PERSONAS: DemoPersona[] = ["member", "approver", "admin", "viewer"];

/** デモ会社が上限まで作られているときのエラー（利用者向けの文言で知らせる） */
export class DemoCapacityError extends Error {
  constructor() {
    super("デモ環境の上限に達しています");
    this.name = "DemoCapacityError";
  }
}

/** 新しいデモ会社を作れるか。上限に達していたら期限切れのデモを片付けてから数え直す */
export async function ensureDemoCapacity(): Promise<void> {
  const sql = db();
  const count = async () => {
    const [row] = await sql<{ n: number }[]>`select count(*)::int n from companies where is_demo and demo_expires_at > now()`;
    return row.n;
  };
  if ((await count()) < serverEnv.demoMaxActive) return;
  await sql`select app_private.demo_cleanup()`;
  if ((await count()) >= serverEnv.demoMaxActive) throw new DemoCapacityError();
}

/**
 * 訪問者専用のデモ会社を作る。社員5人（管理者・承認者・作成者2人・閲覧のみ）をそれぞれ匿名の利用者として作り、
 * 選んだ役割の社員の ID を返す（その社員としてログインする）。
 * previousUserId があれば、その利用者のデモ会社（と社員）を同じトランザクションで削除する（作り直し）。
 */
export async function createDemoSandbox(persona: DemoPersona, previousUserId?: string): Promise<string> {
  const sql = db();
  const companyId = randomUUID();
  const data = generateDemoData({
    seed: DEFAULT_DEMO_SEED,
    now: new Date(),
    companyId,
    mode: { kind: "demo", expiresAt: new Date(Date.now() + DEMO_TTL_HOURS * 3600_000) },
  });
  await loadDataset(sql, data, async (tx) => {
    if (!previousUserId) return;
    const rows = await tx<{ company_id: string }[]>`
      select p.company_id from profiles p join companies c on c.id = p.company_id where p.id = ${previousUserId} and c.is_demo`;
    if (!rows[0]) return;
    const users = await tx<{ id: string }[]>`select id from profiles where company_id = ${rows[0].company_id}`;
    await tx`delete from companies where id = ${rows[0].company_id}`;
    await tx`delete from auth.users where id = any(${users.map((u) => u.id)}::uuid[]) and is_anonymous`;
  });
  const key = STAFF.find((s) => s.role === persona)!.key;
  return data.staff[key];
}

/** デモ会社の中で、指定した役割の社員（最初の1人） */
export async function demoColleague(userId: string, persona: DemoPersona): Promise<string | null> {
  const [row] = await db()<{ id: string }[]>`
    select other.id
      from profiles me
      join companies c on c.id = me.company_id and c.is_demo and c.demo_expires_at > now()
      join profiles other on other.company_id = me.company_id and other.role = ${persona}
      join auth.users u on u.id = other.id and u.is_anonymous
     where me.id = ${userId}
     order by other.created_at, other.display_name
     limit 1`;
  return row?.id ?? null;
}

/** デモ会社とその社員をすべて削除する（デモの終了） */
export async function deleteDemoOf(userId: string): Promise<void> {
  const sql = db();
  await sql.begin(async (tx) => {
    const rows = await tx<{ company_id: string }[]>`
      select p.company_id from profiles p join companies c on c.id = p.company_id where p.id = ${userId} and c.is_demo`;
    if (!rows[0]) return;
    const users = await tx<{ id: string }[]>`select id from profiles where company_id = ${rows[0].company_id}`;
    await tx`delete from companies where id = ${rows[0].company_id}`;
    await tx`delete from auth.users where id = any(${users.map((u) => u.id)}::uuid[]) and is_anonymous`;
  });
}
