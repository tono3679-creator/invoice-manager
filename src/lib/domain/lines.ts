/** 明細の入力欄の値（フォームでは文字列で持つ）。サーバーの画面からも使うので client モジュールに置かない */
export type LineValues = { item_id: string; description: string; quantity: string; unit: string; unit_price: string; tax_rate: string };

export const EMPTY_LINE: LineValues = { item_id: "", description: "", quantity: "1", unit: "式", unit_price: "", tax_rate: "10" };
