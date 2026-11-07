export type AppRole = "admin" | "approver" | "member" | "viewer";
export type DocKind = "quote" | "invoice";
export type DocStatus = "draft" | "pending" | "approved" | "issued" | "accepted" | "void";
export type PaymentState = "paid" | "partial" | "overdue" | "unpaid";
export type PaymentMethod = "bank" | "cash" | "card" | "other";

export const ROLE_LABEL: Record<AppRole, string> = { admin: "管理者", approver: "承認者", member: "作成者", viewer: "閲覧のみ" };
export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: "すべての操作と、会社の設定・利用者の権限の変更",
  approver: "書類の承認・差し戻し・取り消し、入金の削除。基準額未満の自分の書類は承認なしで発行できる",
  member: "見積書・請求書の作成と承認の依頼、承認済み書類の発行、入金の記録",
  viewer: "見るだけ（PDF のダウンロードは可）",
};
export const KIND_LABEL: Record<DocKind, string> = { quote: "見積書", invoice: "請求書" };
export const KIND_PATH: Record<DocKind, string> = { quote: "/quotes", invoice: "/invoices" };
export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "下書き", pending: "承認待ち", approved: "承認済み", issued: "発行済み", accepted: "受注", void: "取り消し",
};
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = { paid: "入金済み", partial: "一部入金", overdue: "期限超過", unpaid: "未入金" };
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { bank: "銀行振込", cash: "現金", card: "カード", other: "その他" };

export const EVENT_LABEL: Record<string, string> = {
  created: "作成", updated: "編集", submitted: "承認を依頼", withdrawn: "依頼を取り下げ", approved: "承認", rejected: "差し戻し",
  issued: "発行", sent: "送付済みにする", voided: "取り消し", converted: "請求書に変換", payment_recorded: "入金を記録",
  payment_deleted: "入金の記録を削除", receipt_issued: "領収書を発行", duplicated: "複製して作成", generated: "定期請求で自動作成",
};

/** 役割ごとにできること（画面のボタンの出し分け用。最終的な判断は DB の関数と RLS） */
export const can = {
  edit: (role: AppRole) => role !== "viewer",
  approve: (role: AppRole) => role === "admin" || role === "approver",
  void: (role: AppRole) => role === "admin" || role === "approver",
  deleteMaster: (role: AppRole) => role === "admin" || role === "approver",
  deletePayment: (role: AppRole) => role === "admin" || role === "approver",
  settings: (role: AppRole) => role === "admin",
};

/** 承認なしで発行できるか（DB の app_private.approval_required の逆） */
export function canIssueWithoutApproval(role: AppRole, total: number, threshold: number): boolean {
  return (role === "admin" || role === "approver") && total < threshold;
}
