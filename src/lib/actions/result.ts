/** Server Action の結果（失敗は画面にそのまま出せるメッセージ。stale は同時編集で断られたとき） */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; stale?: true };
