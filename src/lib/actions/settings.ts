"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";
import { toFieldErrors, toUserMessage } from "./errors";
import type { ActionResult } from "./result";

const denied = () => Object.assign(new Error("会社の設定を変更できるのは管理者だけです"), { code: "42501" });

export async function updateSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  const v = parsed.data;
  try {
    await asCurrentUser(async (tx, user) => {
      const rows = await tx`
        update company_settings set legal_name = ${v.legal_name}, postal_code = ${v.postal_code}, address = ${v.address}, phone = ${v.phone},
               email = ${v.email}, registration_number = ${v.registration_number}, bank_account = ${v.bank_account}, rounding = ${v.rounding},
               approval_threshold = ${v.approval_threshold}, quote_valid_days = ${v.quote_valid_days}, invoice_prefix = ${v.invoice_prefix},
               quote_prefix = ${v.quote_prefix}, receipt_prefix = ${v.receipt_prefix}, default_invoice_notes = ${v.default_invoice_notes},
               default_quote_notes = ${v.default_quote_notes}, show_seal = ${v.show_seal}, seal_text = ${v.seal_text}
         where company_id = ${user.companyId} returning company_id`;
      if (rows.length === 0) throw denied();
      await tx`update companies set name = ${v.company_name} where id = ${user.companyId}`;
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function updateMemberRole(profileId: string, role: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.string().uuid(), role: z.enum(["admin", "approver", "member", "viewer"]) }).safeParse({ id: profileId, role });
  if (!parsed.success) return { ok: false, error: "不正な操作です" };
  try {
    await asCurrentUser(async (tx) => {
      const rows = await tx`update profiles set role = ${parsed.data.role} where id = ${parsed.data.id} returning id`;
      if (rows.length === 0) throw Object.assign(new Error("権限を変更できるのは管理者だけです"), { code: "42501" });
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}
