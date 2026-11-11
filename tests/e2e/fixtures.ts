import { test as base, expect, type Page } from "@playwright/test";

export { expect };

// 公開環境に対して実行したときは、テストで作ったデモ会社を画面の「デモを終了する」で片付ける
// （ローカルでは片付けない。失敗したときに画面を残して調べられるように）。全テストに自動で付く
export const test = base.extend<{ cleanupDemo: void }>({
  cleanupDemo: [async ({ page }, use) => {
    await use();
    if (!process.env.E2E_BASE_URL) return;
    const menu = page.getByRole("button", { name: "ユーザーメニュー" }).first();
    if (!(await menu.isVisible().catch(() => false))) return;
    await menu.click();
    const end = page.getByRole("menuitem", { name: "デモを終了する" });
    if (await end.isVisible().catch(() => false)) {
      await end.click();
      await page.waitForURL(/\/login/).catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
  }, { auto: true }],
});

export type Persona = "member" | "approver" | "admin" | "viewer";
const PERSONA_BUTTON: Record<Exclude<Persona, "viewer">, RegExp> = {
  member: /作成者として体験/, approver: /承認者として体験/, admin: /管理者として体験/,
};
const PERSONA_LABEL: Record<Persona, string> = { member: "作成者", approver: "承認者", admin: "管理者", viewer: "閲覧のみ" };

/** ログイン画面から自分専用のデモ会社を作って入る */
export async function startDemo(page: Page, persona: Persona = "member") {
  await page.goto("/login");
  if (persona === "viewer") {
    await page.getByRole("button", { name: PERSONA_BUTTON.member }).click();
    await page.waitForURL(/\/dashboard$/);
    await switchPersona(page, "viewer");
    return;
  }
  await page.getByRole("button", { name: PERSONA_BUTTON[persona] }).click();
  await page.waitForURL(/\/dashboard$/);
}

/** 画面上部の「役割を切り替え」で、同じデモ会社の別の人として入り直す */
export async function switchPersona(page: Page, persona: Persona) {
  const group = page.getByRole("group", { name: "体験する役割" });
  await group.getByRole("button", { name: PERSONA_LABEL[persona], exact: true }).click();
  await expect(group.getByRole("button", { name: PERSONA_LABEL[persona], exact: true })).toHaveAttribute("aria-pressed", "true");
}

/** 成功の通知が出るまで待つ */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: text }).first()).toBeVisible();
}
