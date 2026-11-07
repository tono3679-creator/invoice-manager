import { expect, startDemo, test } from "./fixtures";

test("@mobile スマートフォンの幅でも横にはみ出さない", async ({ page }) => {
  await startDemo(page, "member");
  for (const path of ["/dashboard", "/invoices", "/receivables", "/invoices/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
