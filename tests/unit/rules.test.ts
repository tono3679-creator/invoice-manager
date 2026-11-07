import { describe, expect, it } from "vitest";
import { can, canIssueWithoutApproval } from "@/lib/domain/labels";
import { documentSchema, settingsSchema } from "@/lib/validation";

describe("承認が要るか", () => {
  it("作成者は金額にかかわらず承認が必要", () => {
    expect(canIssueWithoutApproval("member", 1, 300000)).toBe(false);
  });
  it("承認者・管理者は基準額未満なら承認なしで発行できる", () => {
    expect(canIssueWithoutApproval("approver", 299999, 300000)).toBe(true);
    expect(canIssueWithoutApproval("admin", 300000, 300000)).toBe(false);
  });
  it("閲覧のみは編集できない", () => {
    expect(can.edit("viewer")).toBe(false);
    expect(can.approve("member")).toBe(false);
  });
});

describe("入力の検証", () => {
  const base = {
    client_id: "a8828813-ceda-452a-8de4-4a24a78c531e", title: "件名", issue_date: "", due_date: "", valid_until: "", notes: "",
    lines: [{ item_id: null, description: "作業", quantity: "1.5", unit: "式", unit_price: "1,000".replace(",", ""), tax_rate: "10" }],
  };
  it("空の日付は null、数字の文字列は数値になる", () => {
    const r = documentSchema.parse(base as never);
    expect(r.issue_date).toBeNull();
    expect(r.lines[0]).toMatchObject({ quantity: 1.5, unit_price: 1000, tax_rate: 10 });
  });
  it("数量は小数第2位まで・0より大きい", () => {
    expect(documentSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: "1.234" }] } as never).success).toBe(false);
    expect(documentSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: "0" }] } as never).success).toBe(false);
  });
  it("支払期限は発行日以降", () => {
    const r = documentSchema.safeParse({ ...base, issue_date: "2026-11-07", due_date: "2026-11-06" } as never);
    expect(r.success).toBe(false);
  });
  it("登録番号は T＋13桁（小文字の t も受け付ける）", () => {
    const s = {
      company_name: "a", legal_name: "a", postal_code: "", address: "", phone: "", email: "", bank_account: "",
      rounding: "floor", approval_threshold: "300000", quote_valid_days: "30", invoice_prefix: "INV", quote_prefix: "QT",
      receipt_prefix: "RC", default_invoice_notes: "", default_quote_notes: "", show_seal: true, seal_text: "印",
    };
    expect(settingsSchema.parse({ ...s, registration_number: "t1234567890123" } as never).registration_number).toBe("T1234567890123");
    expect(settingsSchema.safeParse({ ...s, registration_number: "T123" } as never).success).toBe(false);
  });
});
