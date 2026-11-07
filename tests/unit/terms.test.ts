import { describe, expect, it } from "vitest";
import { addDays, addMonths, calcDueDate, monthDay, termsLabel, todayJst } from "@/lib/domain/terms";

describe("monthDay", () => {
  it("0 は月末。存在しない日は月末に寄せる", () => {
    expect(monthDay(2026, 2, 0)).toBe("2026-02-28");
    expect(monthDay(2028, 2, 0)).toBe("2028-02-29");
    expect(monthDay(2026, 4, 31)).toBe("2026-04-30");
  });
  it("13月以降は翌年に繰り上げる", () => {
    expect(monthDay(2026, 13, 10)).toBe("2027-01-10");
    expect(monthDay(2026, 0, 0)).toBe("2025-12-31");
  });
});

describe("calcDueDate", () => {
  const eom = { closingDay: 0, payMonthOffset: 1, payDay: 0 }; // 月末締め翌月末払い
  const d20 = { closingDay: 20, payMonthOffset: 1, payDay: 10 }; // 20日締め翌月10日払い
  it("月末締め翌月末払い", () => {
    expect(calcDueDate("2026-11-07", eom)).toBe("2026-12-31");
    expect(calcDueDate("2026-01-31", eom)).toBe("2026-02-28");
    expect(calcDueDate("2026-12-15", eom)).toBe("2027-01-31");
  });
  it("20日締め翌月10日払い（締め日を過ぎたら翌月の締めになる）", () => {
    expect(calcDueDate("2026-11-07", d20)).toBe("2026-12-10");
    expect(calcDueDate("2026-11-20", d20)).toBe("2026-12-10");
    expect(calcDueDate("2026-11-21", d20)).toBe("2027-01-10");
  });
  it("当月払いで支払日が締め日より前になるときは翌月にずらす", () => {
    expect(calcDueDate("2026-11-07", { closingDay: 20, payMonthOffset: 0, payDay: 10 })).toBe("2026-12-10");
    expect(calcDueDate("2026-11-07", { closingDay: 10, payMonthOffset: 0, payDay: 25 })).toBe("2026-11-25");
  });
});

describe("日付のユーティリティ", () => {
  it("addMonths・addDays", () => {
    expect(addMonths("2026-11-07", 3, 0)).toBe("2027-02-28");
    expect(addDays("2026-12-25", 30)).toBe("2027-01-24");
  });
  it("todayJst は日本時間の日付", () => {
    expect(todayJst(new Date("2026-11-07T15:30:00Z"))).toBe("2026-11-08");
    expect(todayJst(new Date("2026-11-07T14:59:00Z"))).toBe("2026-11-07");
  });
  it("termsLabel", () => {
    expect(termsLabel({ closingDay: 0, payMonthOffset: 1, payDay: 0 })).toBe("月末締め 翌月末日払い");
    expect(termsLabel({ closingDay: 20, payMonthOffset: 1, payDay: 10 })).toBe("20日締め 翌月10日払い");
  });
});
