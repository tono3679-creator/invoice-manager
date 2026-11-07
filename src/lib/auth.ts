import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asUser, type Tx } from "@/lib/db";
import type { AppRole } from "@/lib/domain/labels";
import { readSession } from "@/lib/session";

export type CurrentUser = {
  userId: string;
  role: AppRole;
  companyId: string;
  companyName: string;
  displayName: string;
  isDemo: boolean;
  isAnonymous: boolean;
  approvalThreshold: number;
};

/** ログインのセッション（Cookie）を DB で確かめて、利用者 ID を返す */
export const getAuthUserId = cache(async (): Promise<{ id: string; isAnonymous: boolean } | null> => readSession());

/** ログイン中の利用者と所属会社（未ログイン・未登録なら null） */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const auth = await getAuthUserId();
  if (!auth) return null;
  const rows = await asUser(auth.id, (tx) => tx<{
    role: AppRole; company_id: string; company_name: string; display_name: string; is_demo: boolean; approval_threshold: number;
  }[]>`
    select p.role, p.company_id, c.name company_name, p.display_name, c.is_demo, s.approval_threshold
      from profiles p join companies c on c.id = p.company_id join company_settings s on s.company_id = c.id
     where p.id = ${auth.id}`);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: auth.id,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    displayName: row.display_name,
    isDemo: row.is_demo,
    isAnonymous: auth.isAnonymous,
    approvalThreshold: row.approval_threshold,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 役割が足りなければトップへ（画面用。Server Actions は DB の関数・RLS が最終的に断る） */
export async function requireRole(roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

/** ログイン中の利用者として RLS 付きで実行（データ取得と Server Actions の入口） */
export async function asCurrentUser<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return asUser(user.userId, (tx) => fn(tx, user));
}

/** API（Route Handler）用：リダイレクトせず null を返す */
export async function apiUser(): Promise<CurrentUser | null> {
  return getCurrentUser();
}
