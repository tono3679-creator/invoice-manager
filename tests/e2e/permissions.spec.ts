import { expect, startDemo, test } from "./fixtures";

test("閲覧のみは見られるが、作成・編集のボタンが出ない", async ({ page }) => {
  await startDemo(page, "viewer");
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "請求書", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "請求書を作成" })).toHaveCount(0);
  await page.goto("/invoices/new");
  await expect(page).toHaveURL(/\/invoices$/);
  await page.locator("table tbody tr a").first().click();
  await expect(page.getByRole("link", { name: "PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: /取り消し|入金を記録|発行する/ })).toHaveCount(0);
});

test("作成者は会社の設定を変えられない", async ({ page }) => {
  await startDemo(page, "member");
  await page.goto("/settings");
  await expect(page.getByText("会社の設定を変更できるのは管理者だけです。")).toBeVisible();
  await expect(page.getByRole("button", { name: "設定を保存" })).toHaveCount(0);
});

test("ログインしていなければログイン画面へ", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login/);
  const r = await page.request.get("/api/documents/00000000-0000-4000-8000-000000000000/pdf");
  expect(r.status()).toBe(401);
});
