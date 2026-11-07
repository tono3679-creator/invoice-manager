import { expect, expectToast, startDemo, switchPersona, test } from "./fixtures";

/**
 * 請求書の一連の流れ：作成者が作って承認を依頼 → 承認者が承認 → 作成者が発行 → 入金を記録 → 領収書 → PDF
 */
test("作成 → 承認 → 発行 → 入金 → 領収書。金額はインボイス制度の計算で、PDF も出る", async ({ page }) => {
  await startDemo(page, "member");
  await page.goto("/invoices/new");
  await page.getByLabel("取引先").selectOption({ label: "C-003　株式会社さくら医療サービス" });
  await page.getByLabel("件名").fill("E2E：ページ追加とお弁当");
  await page.getByLabel("1行目の品目").selectOption({ label: "WEB-003　ページ追加・更新" });
  await page.getByLabel("1行目の数量").fill("4");
  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("2行目の品目").selectOption({ label: "MTG-002　打ち合わせ用お弁当" });
  await page.getByLabel("2行目の数量").fill("7");
  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("3行目の品名").fill("端数の確認");
  await page.getByLabel("3行目の数量").fill("1.5");
  await page.getByLabel("3行目の単価").fill("333");

  // 画面のプレビュー：10%対象 120,499円 → 消費税 12,049円（切り捨て）、8%対象 8,400円 → 672円
  await expect(page.getByText("消費税 ￥12,049")).toBeVisible();
  await expect(page.getByText("消費税 ￥672")).toBeVisible();
  await expect(page.getByText("￥141,620").first()).toBeVisible();

  await page.getByRole("button", { name: "保存して承認を依頼" }).click();
  await expectToast(page, "保存して、承認を依頼しました");
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByText("承認待ち").first()).toBeVisible();
  // 作成者には承認ボタンがない
  await expect(page.getByRole("button", { name: "承認する" })).toHaveCount(0);

  await switchPersona(page, "approver");
  await page.goto("/approvals");
  await expect(page.getByText("E2E：ページ追加とお弁当")).toBeVisible();
  await page.goto(url);
  await page.getByRole("button", { name: "承認する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "承認する" }).click();
  await expectToast(page, "承認しました");

  await switchPersona(page, "member");
  await page.goto(url);
  await page.getByRole("button", { name: "発行する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "発行する" }).click();
  await expectToast(page, "請求書を発行しました");
  await expect(page.getByText(/INV-\d{4}-\d{4}/).first()).toBeVisible();

  await page.getByRole("button", { name: "入金を記録" }).click();
  await expect(page.getByLabel("入金額")).toHaveValue("141620");
  await page.getByLabel("入金額").fill("100000");
  await page.getByRole("dialog").getByRole("button", { name: "記録する" }).click();
  await expectToast(page, "入金を記録しました");
  await expect(page.getByText("一部入金").first()).toBeVisible();

  await page.getByRole("button", { name: "入金を記録" }).click();
  await expect(page.getByLabel("入金額")).toHaveValue("41620");
  await page.getByRole("dialog").getByRole("button", { name: "記録する" }).click();
  await expectToast(page, "入金を記録しました");
  await expect(page.getByText("入金済み").first()).toBeVisible();

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "領収書を発行" }).first().click();
  await expectToast(page, /領収書 RC-\d{4}-\d{4} を発行しました/);
  await (await popup).close();

  const id = url.split("/").pop();
  const pdf = await page.request.get(`/api/documents/${id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("見積書を発行して受注にすると、請求書の下書きができる", async ({ page }) => {
  await startDemo(page, "admin");
  await page.goto("/quotes/new");
  await page.getByLabel("取引先").selectOption({ index: 1 });
  await page.getByLabel("件名").fill("E2E：ロゴ制作");
  await page.getByLabel("1行目の品目").selectOption({ label: "DSN-001　ロゴデザイン" });
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expectToast(page, "下書きを保存しました");
  await page.waitForURL(/\/quotes\/[0-9a-f-]{36}$/);
  // 管理者は基準額（30万円）未満なら承認なしで発行できる
  await page.getByRole("button", { name: "発行する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "発行する" }).click();
  await expectToast(page, "見積書を発行しました");
  await page.getByRole("button", { name: "受注して請求書を作成" }).click();
  await expectToast(page, "受注にして、請求書の下書きを作りました");
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "E2E：ロゴ制作" })).toBeVisible();
  await expect(page.getByText("下書き").first()).toBeVisible();
});
