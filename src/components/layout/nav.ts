import {
  LayoutDashboard, FileText, FileSignature, Stamp, Wallet, Repeat, Building2, Package, Settings, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: "pending" };

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "",
    items: [{ href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard }],
  },
  {
    group: "書類",
    items: [
      { href: "/quotes", label: "見積書", icon: FileSignature },
      { href: "/invoices", label: "請求書", icon: FileText },
      { href: "/approvals", label: "承認", icon: Stamp, badgeKey: "pending" },
      { href: "/recurring", label: "定期請求", icon: Repeat },
    ],
  },
  {
    group: "入金",
    items: [{ href: "/receivables", label: "入金・売掛金", icon: Wallet }],
  },
  {
    group: "マスタ",
    items: [
      { href: "/clients", label: "取引先", icon: Building2 },
      { href: "/items", label: "品目", icon: Package },
      { href: "/settings", label: "設定", icon: Settings },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
