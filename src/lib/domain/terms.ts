/**
 * 支払条件と支払期限。DB の public.calc_due_date と同じ計算（tests/db/terms.test.ts で一致を確かめている）。
 * 日付は 'YYYY-MM-DD' の文字列で扱う（タイムゾーンのずれを防ぐ）。
 */
export type PaymentTerms = { closingDay: number; payMonthOffset: number; payDay: number };

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** year/month（1始まり。範囲外は繰り上げる）の day 日（0 は月末） */
export function monthDay(year: number, month: number, day: number): string {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  const last = daysIn(y, m);
  return fmt(y, m, day === 0 ? last : Math.min(day, last));
}

export function calcDueDate(issueDate: string, terms: PaymentTerms): string {
  const [y, m] = parts(issueDate);
  let closing = monthDay(y, m, terms.closingDay);
  if (closing < issueDate) closing = monthDay(y, m + 1, terms.closingDay);
  const [cy, cm] = parts(closing);
  let due = monthDay(cy, cm + terms.payMonthOffset, terms.payDay);
  if (due < closing) {
    const [dy, dm] = parts(due);
    due = monthDay(dy, dm + 1, terms.payDay);
  }
  return due;
}

export function addMonths(date: string, months: number, day: number): string {
  const [y, m] = parts(date);
  return monthDay(y, m + months, day);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const dayLabel = (day: number) => (day === 0 ? "末日" : `${day}日`);
const MONTH_LABEL = ["当月", "翌月", "翌々月", "3か月後"];

/** 例：月末締め 翌月末日払い / 20日締め 翌月10日払い */
export function termsLabel(terms: PaymentTerms): string {
  const closing = terms.closingDay === 0 ? "月末締め" : `${terms.closingDay}日締め`;
  return `${closing} ${MONTH_LABEL[terms.payMonthOffset] ?? `${terms.payMonthOffset}か月後`}${dayLabel(terms.payDay)}払い`;
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
