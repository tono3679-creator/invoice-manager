import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";
import { generateDemoData, type DemoDataset } from "@/lib/demo/generator";
import { loadDataset } from "@/lib/demo/load";
import { DB_TYPES } from "@/lib/db/types";
import { runAsUser } from "@/lib/db/rls";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/im";

export function connect(): Sql {
  return postgres(TEST_DATABASE_URL, { max: 4, prepare: false, onnotice: () => {}, types: DB_TYPES });
}

export type TestTenant = { companyId: string; data: DemoDataset; staff: Record<string, string> };

/** テスト用の会社を1社作る（デモと同じデータ。利用者は admin / approver / member / member2 / viewer） */
export async function createTenant(sql: Sql, seed = 7, now = new Date()): Promise<TestTenant> {
  const companyId = randomUUID();
  const data = generateDemoData({ seed, now, companyId, mode: { kind: "demo", expiresAt: new Date(Date.now() + 3600_000) } });
  await loadDataset(sql, data);
  return { companyId, data, staff: data.staff };
}

export async function dropTenant(sql: Sql, t: TestTenant) {
  await sql`delete from public.companies where id = ${t.companyId}`;
  await sql`delete from auth.users where id in ${sql(Object.values(t.staff))}`;
}

export function as<T>(sql: Sql, userId: string, fn: (tx: TransactionSql) => Promise<T>) {
  return runAsUser(sql, userId, fn);
}

/** 例外のメッセージ（失敗しなかったら null） */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
