/**
 * 生成したデータを DB に一括登録する（データベース所有者の接続で実行する）。
 * 金額は生成時に計算済みだが、登録後に DB の計算（recalc_document）と一致するかをテストで確かめている。
 */
import type { Sql, TransactionSql } from "postgres";
import type { DemoDataset } from "./generator";

type Row = Record<string, unknown>;
const CHUNK = 500;

async function insertRows(tx: TransactionSql, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => {
      const out: Row = {};
      for (const c of columns) {
        const v = r[c];
        out[c] = v !== null && typeof v === "object" && !(v instanceof Date) ? tx.json(v as never) : v;
      }
      return out;
    });
    await tx`insert into ${tx(schema)}.${tx(name)} ${tx(chunk as Record<string, never>[], columns)}`;
  }
}

/** データセットを登録する。extra は同じトランザクションの中で続けて行う処理（古いデモの削除など） */
export async function loadDataset(sql: Sql, data: DemoDataset, extra?: (tx: TransactionSql) => Promise<void>) {
  await sql.begin(async (tx) => {
    if (extra) await extra(tx);
    await insertRows(tx, "auth.users", data.users);
    await insertRows(tx, "companies", [data.company]);
    await insertRows(tx, "company_settings", [data.settings]);
    await insertRows(tx, "profiles", data.profiles);
    await insertRows(tx, "clients", data.clients);
    await insertRows(tx, "items", data.items);
    await insertRows(tx, "recurring_templates", data.recurring);
    await insertRows(tx, "documents", data.documents);
    await insertRows(tx, "document_lines", data.lines);
    await insertRows(tx, "document_events", data.events);
    await insertRows(tx, "payments", data.payments);
    await insertRows(tx, "number_counters", data.counters);
  });
}
