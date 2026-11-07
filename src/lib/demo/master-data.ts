/**
 * デモ・見本の会社のマスタデータ。会社・人物・取引先はすべて架空。
 * 住所は実在の市区町村名に架空の番地を付けたもの。登録番号・口座番号も架空。
 */
import type { AppRole } from "@/lib/domain/labels";
import type { TaxRate } from "@/lib/domain/tax";

export const COMPANY = {
  name: "株式会社ひなたクリエイティブ",
  legalName: "株式会社ひなたクリエイティブ",
  postalCode: "150-0001",
  address: "東京都渋谷区神宮前9-8-7 ひなたビル3F",
  phone: "03-0000-1234",
  email: "billing@hinata-creative.example",
  registrationNumber: "T1234567890123",
  bankAccount: "サンプル銀行 渋谷支店 普通 1234567 カ）ヒナタクリエイティブ",
  sealText: "ひなた印",
};

export type StaffSeed = { key: string; name: string; title: string; role: AppRole; email: string };

export const STAFF: StaffSeed[] = [
  { key: "admin", name: "山田 太郎", title: "代表取締役", role: "admin", email: "admin@invoice.example" },
  { key: "approver", name: "佐藤 美咲", title: "経理部長", role: "approver", email: "approver@invoice.example" },
  { key: "member", name: "鈴木 健", title: "営業部", role: "member", email: "member@invoice.example" },
  { key: "member2", name: "高橋 彩", title: "営業部", role: "member", email: "member2@invoice.example" },
  { key: "viewer", name: "田中 由紀", title: "営業アシスタント", role: "viewer", email: "viewer@invoice.example" },
];

export type ClientSeed = {
  code: string;
  name: string;
  honorific: "御中" | "様";
  department?: string;
  contact?: string;
  postalCode: string;
  address: string;
  terms: [closing: number, offset: number, payDay: number];
  /** 取引の多さ（1.0 が標準） */
  weight: number;
  /** 支払いの遅れやすさ */
  lateRate: number;
};

export const CLIENTS: ClientSeed[] = [
  { code: "C-001", name: "株式会社あおば食品", honorific: "御中", department: "マーケティング部", contact: "青木 様", postalCode: "105-0011", address: "東京都港区芝公園8-1-2", terms: [0, 1, 0], weight: 1.6, lateRate: 0.02 },
  { code: "C-002", name: "みどり不動産株式会社", honorific: "御中", department: "総務部", contact: "緑川 様", postalCode: "160-0022", address: "東京都新宿区新宿9-3-5", terms: [0, 1, 0], weight: 1.3, lateRate: 0.05 },
  { code: "C-003", name: "株式会社さくら医療サービス", honorific: "御中", department: "経営企画室", contact: "桜井 様", postalCode: "220-0012", address: "神奈川県横浜市西区みなとみらい7-4-1", terms: [20, 1, 10], weight: 1.2, lateRate: 0.02 },
  { code: "C-004", name: "かえで建設株式会社", honorific: "御中", department: "広報課", contact: "楓 様", postalCode: "330-0802", address: "埼玉県さいたま市大宮区宮町6-2-8", terms: [0, 2, 0], weight: 1.0, lateRate: 0.12 },
  { code: "C-005", name: "株式会社つばさトラベル", honorific: "御中", department: "Web推進部", contact: "翼 様", postalCode: "100-0005", address: "東京都千代田区丸の内9-9-1", terms: [0, 1, 0], weight: 1.1, lateRate: 0.03 },
  { code: "C-006", name: "合同会社ほしぞら珈琲", honorific: "御中", contact: "星野 様", postalCode: "180-0004", address: "東京都武蔵野市吉祥寺本町8-12-3", terms: [0, 1, 0], weight: 0.8, lateRate: 0.15 },
  { code: "C-007", name: "株式会社いずみ教育", honorific: "御中", department: "教材開発部", contact: "泉 様", postalCode: "113-0033", address: "東京都文京区本郷9-1-15", terms: [25, 1, 25], weight: 0.9, lateRate: 0.02 },
  { code: "C-008", name: "やまびこ工業株式会社", honorific: "御中", department: "管理部", contact: "山彦 様", postalCode: "260-0013", address: "千葉県千葉市中央区中央8-7-6", terms: [0, 2, 10], weight: 0.9, lateRate: 0.06 },
  { code: "C-009", name: "株式会社しおさいリゾート", honorific: "御中", department: "営業企画部", contact: "潮田 様", postalCode: "250-0011", address: "神奈川県小田原市栄町9-2-1", terms: [0, 1, 0], weight: 0.7, lateRate: 0.04 },
  { code: "C-010", name: "医療法人こもれび会", honorific: "御中", department: "事務局", contact: "木漏 様", postalCode: "190-0012", address: "東京都立川市曙町9-6-3", terms: [0, 1, 0], weight: 0.6, lateRate: 0.02 },
  { code: "C-011", name: "株式会社ことのは出版", honorific: "御中", department: "編集部", contact: "言葉 様", postalCode: "101-0051", address: "東京都千代田区神田神保町9-8-2", terms: [15, 1, 15], weight: 0.6, lateRate: 0.05 },
  { code: "C-012", name: "株式会社ゆうひ物流", honorific: "御中", department: "人事部", contact: "夕日 様", postalCode: "144-0052", address: "東京都大田区蒲田9-3-11", terms: [0, 1, 0], weight: 0.5, lateRate: 0.2 },
  { code: "C-013", name: "はなみずき歯科クリニック", honorific: "御中", contact: "花水木 様", postalCode: "152-0035", address: "東京都目黒区自由が丘9-2-4", terms: [0, 1, 0], weight: 0.5, lateRate: 0.03 },
  { code: "C-014", name: "小川 真一", honorific: "様", postalCode: "158-0094", address: "東京都世田谷区玉川9-11-2", terms: [0, 1, 0], weight: 0.3, lateRate: 0.1 },
  { code: "C-015", name: "株式会社あかつき電機", honorific: "御中", department: "販売促進部", contact: "暁 様", postalCode: "212-0013", address: "神奈川県川崎市幸区堀川町9-5-1", terms: [0, 3, 0], weight: 0.8, lateRate: 0.04 },
  { code: "C-016", name: "NPO法人まちのわ", honorific: "御中", contact: "町輪 様", postalCode: "185-0012", address: "東京都国分寺市本町9-1-8", terms: [0, 1, 0], weight: 0.3, lateRate: 0.08 },
];

export type ItemSeed = { code: string; name: string; unit: string; price: number; tax: TaxRate; description?: string };

export const ITEMS: ItemSeed[] = [
  { code: "WEB-001", name: "Webサイト制作（コーポレート）", unit: "式", price: 800000, tax: 10 },
  { code: "WEB-002", name: "ランディングページ制作", unit: "式", price: 350000, tax: 10 },
  { code: "WEB-003", name: "ページ追加・更新", unit: "ページ", price: 30000, tax: 10 },
  { code: "WEB-004", name: "Webサイト保守（月額）", unit: "月", price: 50000, tax: 10 },
  { code: "WEB-005", name: "サーバー・ドメイン管理（月額）", unit: "月", price: 8000, tax: 10 },
  { code: "DSN-001", name: "ロゴデザイン", unit: "式", price: 150000, tax: 10 },
  { code: "DSN-002", name: "バナー制作", unit: "点", price: 15000, tax: 10 },
  { code: "DSN-003", name: "パンフレットデザイン（A4・4P）", unit: "式", price: 180000, tax: 10 },
  { code: "DSN-004", name: "名刺デザイン", unit: "名", price: 5000, tax: 10 },
  { code: "ADS-001", name: "Web広告運用代行（月額）", unit: "月", price: 120000, tax: 10 },
  { code: "ADS-002", name: "SNS運用代行（月額）", unit: "月", price: 80000, tax: 10 },
  { code: "PHT-001", name: "撮影（半日）", unit: "回", price: 60000, tax: 10 },
  { code: "PHT-002", name: "画像レタッチ", unit: "点", price: 2000, tax: 10 },
  { code: "MTG-001", name: "ディレクション費", unit: "式", price: 100000, tax: 10 },
  { code: "MTG-002", name: "打ち合わせ用お弁当", unit: "個", price: 1200, tax: 8, description: "軽減税率（8%）の対象" },
  { code: "MTG-003", name: "ワークショップ用お菓子・飲料", unit: "式", price: 6000, tax: 8, description: "軽減税率（8%）の対象" },
  { code: "EXP-001", name: "交通費（実費）", unit: "式", price: 3000, tax: 10 },
  { code: "EXP-002", name: "収入印紙代（立替）", unit: "枚", price: 200, tax: 0, description: "立替金のため消費税の対象外" },
  { code: "DSC-001", name: "お値引き", unit: "式", price: -30000, tax: 10 },
];

/** 案件の型（見積→請求の明細のひな形）。items は ITEMS の code と数量 */
export const PROJECTS: { title: string; items: [code: string, qty: number][] }[] = [
  { title: "コーポレートサイト リニューアル", items: [["MTG-001", 1], ["WEB-001", 1], ["PHT-001", 1], ["PHT-002", 20]] },
  { title: "新商品ランディングページ制作", items: [["WEB-002", 1], ["DSN-002", 4], ["PHT-002", 10]] },
  { title: "会社案内パンフレット制作", items: [["DSN-003", 1], ["PHT-001", 1], ["EXP-001", 1]] },
  { title: "ロゴ・名刺デザイン", items: [["DSN-001", 1], ["DSN-004", 5]] },
  { title: "キャンペーンバナー制作", items: [["DSN-002", 8]] },
  { title: "採用ページ追加", items: [["WEB-003", 4], ["PHT-001", 1], ["EXP-001", 1]] },
  { title: "ブランディングワークショップ", items: [["MTG-001", 1], ["MTG-002", 12], ["MTG-003", 1]] },
  { title: "Webサイト改修", items: [["WEB-003", 6], ["DSC-001", 1]] },
  { title: "展示会用ツール制作", items: [["DSN-003", 1], ["DSN-002", 3], ["EXP-002", 1]] },
];

/** 毎月の定期請求（取引先の code と明細） */
export const RECURRING: { client: string; title: string; items: [code: string, qty: number][]; interval: 1 | 3 }[] = [
  { client: "C-001", title: "Web広告運用代行", items: [["ADS-001", 1]], interval: 1 },
  { client: "C-002", title: "Webサイト保守", items: [["WEB-004", 1], ["WEB-005", 1]], interval: 1 },
  { client: "C-005", title: "SNS運用代行", items: [["ADS-002", 1]], interval: 1 },
  { client: "C-003", title: "Webサイト保守", items: [["WEB-004", 1], ["WEB-005", 1]], interval: 1 },
  { client: "C-007", title: "サーバー・ドメイン管理（3か月分）", items: [["WEB-005", 3]], interval: 3 },
];
