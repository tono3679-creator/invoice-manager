"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import { clientSchema, itemSchema, type ClientInput, type ItemInput } from "@/lib/validation";
import { isUniqueViolation, toFieldErrors, toUserMessage } from "./errors";
import type { ActionResult } from "./result";

const id = z.string().uuid();

export async function saveClient(clientId: string | null, input: ClientInput): Promise<ActionResult<{ id: string }>> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  const v = parsed.data;
  try {
    const saved = await asCurrentUser(async (tx, user) => {
      if (clientId) {
        const [row] = await tx<{ id: string }[]>`
          update clients set code = ${v.code}, name = ${v.name}, honorific = ${v.honorific}, department = ${v.department},
                 contact_name = ${v.contact_name}, email = ${v.email}, phone = ${v.phone}, postal_code = ${v.postal_code},
                 address = ${v.address}, closing_day = ${v.closing_day}, pay_month_offset = ${v.pay_month_offset},
                 pay_day = ${v.pay_day}, notes = ${v.notes}
           where id = ${id.parse(clientId)} returning id`;
        if (!row) throw Object.assign(new Error("この操作を行う権限がありません"), { code: "42501" });
        return row.id;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into clients (company_id, code, name, honorific, department, contact_name, email, phone, postal_code, address,
                             closing_day, pay_month_offset, pay_day, notes)
        values (${user.companyId}, ${v.code}, ${v.name}, ${v.honorific}, ${v.department}, ${v.contact_name}, ${v.email}, ${v.phone},
                ${v.postal_code}, ${v.address}, ${v.closing_day}, ${v.pay_month_offset}, ${v.pay_day}, ${v.notes})
        returning id`;
      return row.id;
    });
    revalidatePath("/clients");
    return { ok: true, data: { id: saved } };
  } catch (e) {
    if (isUniqueViolation(e, "code")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { code: "このコードは既に使われています" } };
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function setClientArchived(clientId: string, archived: boolean): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`update clients set archived_at = ${archived ? new Date() : null} where id = ${id.parse(clientId)} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("この操作を行う権限がありません"), { code: "42501" });
    });
    revalidatePath("/clients");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function deleteClient(clientId: string): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`delete from clients where id = ${id.parse(clientId)} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("取引先を削除できるのは承認者・管理者だけです"), { code: "42501" });
    });
    revalidatePath("/clients");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "23503") {
      return { ok: false, error: "書類や定期請求で使われている取引先は削除できません。代わりにアーカイブしてください" };
    }
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function saveItem(itemId: string | null, input: ItemInput): Promise<ActionResult<{ id: string }>> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  const v = parsed.data;
  try {
    const saved = await asCurrentUser(async (tx, user) => {
      if (itemId) {
        const [row] = await tx<{ id: string }[]>`
          update items set code = ${v.code}, name = ${v.name}, unit = ${v.unit}, unit_price = ${v.unit_price},
                 tax_rate = ${v.tax_rate}, description = ${v.description}
           where id = ${id.parse(itemId)} returning id`;
        if (!row) throw Object.assign(new Error("この操作を行う権限がありません"), { code: "42501" });
        return row.id;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into items (company_id, code, name, unit, unit_price, tax_rate, description)
        values (${user.companyId}, ${v.code}, ${v.name}, ${v.unit}, ${v.unit_price}, ${v.tax_rate}, ${v.description}) returning id`;
      return row.id;
    });
    revalidatePath("/items");
    return { ok: true, data: { id: saved } };
  } catch (e) {
    if (isUniqueViolation(e, "code")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { code: "このコードは既に使われています" } };
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function setItemArchived(itemId: string, archived: boolean): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`update items set archived_at = ${archived ? new Date() : null} where id = ${id.parse(itemId)} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("この操作を行う権限がありません"), { code: "42501" });
    });
    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`delete from items where id = ${id.parse(itemId)} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("品目を削除できるのは承認者・管理者だけです"), { code: "42501" });
    });
    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}
