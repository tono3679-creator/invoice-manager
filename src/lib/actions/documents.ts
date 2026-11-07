"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import type { DocKind } from "@/lib/domain/labels";
import { documentSchema, paymentSchema, type DocumentInput } from "@/lib/validation";
import { toFieldErrors, toUserMessage } from "./errors";
import type { ActionResult } from "./result";

const id = z.string().uuid();
const kindSchema = z.enum(["quote", "invoice"]);

function refresh() {
  revalidatePath("/", "layout");
}

function fail(e: unknown): { ok: false; error: string; stale?: true } {
  const stale = !!e && typeof e === "object" && (e as { code?: string }).code === "40001";
  return { ok: false, error: toUserMessage(e), ...(stale ? { stale: true as const } : {}) };
}

/** 書類を保存（新規・下書きの更新）。金額は DB が明細から計算する */
export async function saveDocument(
  docId: string | null, kind: DocKind, input: DocumentInput, version: number | null,
): Promise<ActionResult<{ id: string; version: number }>> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  try {
    const row = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ id: string; version: number }[]>`
        select * from save_document(${docId ? id.parse(docId) : null}, ${kindSchema.parse(kind)}, ${tx.json(parsed.data as never)}, ${version})`;
      return r;
    });
    refresh();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

async function call(fn: (tx: Parameters<Parameters<typeof asCurrentUser>[0]>[0]) => Promise<unknown>): Promise<ActionResult> {
  try {
    await asCurrentUser((tx) => fn(tx));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const comment = z.string().trim().max(500, "コメントは500文字以内で入力してください").optional();

export async function submitDocument(docId: string, version: number, note?: string) {
  return call((tx) => tx`select submit_document(${id.parse(docId)}, ${version}, ${comment.parse(note) ?? null})`);
}
export async function withdrawDocument(docId: string) {
  return call((tx) => tx`select withdraw_document(${id.parse(docId)})`);
}
export async function approveDocument(docId: string, note?: string) {
  return call((tx) => tx`select approve_document(${id.parse(docId)}, ${comment.parse(note) ?? null})`);
}
export async function rejectDocument(docId: string, note: string) {
  return call((tx) => tx`select reject_document(${id.parse(docId)}, ${comment.parse(note) ?? ""})`);
}
export async function markSent(docId: string) {
  return call((tx) => tx`select mark_document_sent(${id.parse(docId)})`);
}
export async function voidDocument(docId: string, reason: string) {
  return call((tx) => tx`select void_document(${id.parse(docId)}, ${z.string().trim().max(300).parse(reason)})`);
}
export async function deleteDraft(docId: string) {
  return call((tx) => tx`select delete_draft(${id.parse(docId)})`);
}

export async function issueDocument(docId: string, version: number): Promise<ActionResult<{ number: string }>> {
  try {
    const number = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ n: string }[]>`select issue_document(${id.parse(docId)}, ${version}) n`;
      return r.n;
    });
    refresh();
    return { ok: true, data: { number } };
  } catch (e) {
    return fail(e);
  }
}

export async function convertQuote(quoteId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const newId = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ id: string }[]>`select convert_quote_to_invoice(${id.parse(quoteId)}) id`;
      return r.id;
    });
    refresh();
    return { ok: true, data: { id: newId } };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateDocument(docId: string, kind?: DocKind): Promise<ActionResult<{ id: string }>> {
  try {
    const newId = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ id: string }[]>`select duplicate_document(${id.parse(docId)}, ${kind ? kindSchema.parse(kind) : null}) id`;
      return r.id;
    });
    refresh();
    return { ok: true, data: { id: newId } };
  } catch (e) {
    return fail(e);
  }
}

export async function recordPayment(invoiceId: string, input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください", fieldErrors: toFieldErrors(parsed.error) };
  const v = parsed.data;
  return call((tx) => tx`select record_payment(${id.parse(invoiceId)}, ${v.paid_on}::date, ${v.amount}, ${v.method}, ${v.note})`);
}

export async function deletePayment(paymentId: string) {
  return call((tx) => tx`select delete_payment(${id.parse(paymentId)})`);
}

export async function issueReceipt(paymentId: string): Promise<ActionResult<{ number: string }>> {
  try {
    const number = await asCurrentUser(async (tx) => {
      const [r] = await tx<{ n: string }[]>`select issue_receipt(${id.parse(paymentId)}) n`;
      return r.n;
    });
    refresh();
    return { ok: true, data: { number } };
  } catch (e) {
    return fail(e);
  }
}
