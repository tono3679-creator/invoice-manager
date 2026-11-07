"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import { recurringSchema } from "@/lib/validation";
import { toFieldErrors, toUserMessage } from "./errors";
import type { ActionResult } from "./result";

const id = z.string().uuid();
const denied = () => Object.assign(new Error("この操作を行う権限がありません"), { code: "42501" });

export async function saveRecurring(templateId: string | null, input: z.input<typeof recurringSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  const v = parsed.data;
  const lines = v.lines.map((l) => ({ item_id: l.item_id ?? null, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate }));
  try {
    const saved = await asCurrentUser(async (tx, user) => {
      if (templateId) {
        const [row] = await tx<{ id: string }[]>`
          update recurring_templates set client_id = ${v.client_id}, title = ${v.title}, interval_months = ${v.interval_months},
                 issue_day = ${v.issue_day}, next_issue_on = ${v.next_issue_on}, active = ${v.active}, lines = ${tx.json(lines)}, notes = ${v.notes}
           where id = ${id.parse(templateId)} returning id`;
        if (!row) throw denied();
        return row.id;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into recurring_templates (company_id, client_id, title, interval_months, issue_day, next_issue_on, active, lines, notes, created_by)
        values (${user.companyId}, ${v.client_id}, ${v.title}, ${v.interval_months}, ${v.issue_day}, ${v.next_issue_on}, ${v.active},
                ${tx.json(lines)}, ${v.notes}, ${user.userId})
        returning id`;
      return row.id;
    });
    revalidatePath("/recurring");
    return { ok: true, data: { id: saved } };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function setRecurringActive(templateId: string, active: boolean): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`update recurring_templates set active = ${active} where id = ${id.parse(templateId)} returning id`;
      if (rows.length === 0) throw denied();
    });
    revalidatePath("/recurring");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function deleteRecurring(templateId: string): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`delete from recurring_templates where id = ${id.parse(templateId)} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("定期請求を削除できるのは承認者・管理者だけです"), { code: "42501" });
    });
    revalidatePath("/recurring");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

/** 発行日を迎えた定期請求の下書きを、今すぐ作る */
export async function runRecurringNow(): Promise<ActionResult<{ count: number }>> {
  try {
    const count = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ n: number }[]>`select run_recurring_now() n`;
      return r.n;
    });
    revalidatePath("/", "layout");
    return { ok: true, data: { count } };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}
