import { expect, test } from "./fixtures";

/** 見本の会社のアカウント（ローカルでは README の既定のパスワード、公開環境では E2E_LOGIN_PASSWORD） */
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || (process.env.E2E_BASE_URL ? null : "demo-login-2026");

test("@both 間違ったパスワードでは入れず、正しいパスワードで入れる。ログアウトした Cookie は使えない", async ({ page, context }) => {
  test.skip(!PASSWORD, "公開環境では E2E_LOGIN_PASSWORD があるときだけ確かめる");
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("approver@invoice.example");
  await page.getByLabel("パスワード").fill("wrong-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("パスワード").fill(PASSWORD as string);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);
  const session = (await context.cookies()).find((c) => c.name === "im_session");
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await page.getByRole("button", { name: "ユーザーメニュー" }).first().click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await page.waitForURL(/\/login$/);
  await context.addCookies([session!]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
