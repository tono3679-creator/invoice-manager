"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMemberRole } from "@/lib/actions/settings";
import { safeAction } from "@/lib/client/safe-action";
import { ROLE_LABEL, type AppRole } from "@/lib/domain/labels";

export function MemberRoleSelect({ id, name, role }: { id: string; name: string; role: AppRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={`${name} の権限`}
      disabled={pending}
      defaultValue={role}
      className="h-8 rounded-md border border-input bg-card px-2 text-sm"
      onChange={(e) => {
        const next = e.target.value;
        const el = e.target;
        startTransition(async () => {
          const r = await safeAction(() => updateMemberRole(id, next));
          if (r.ok) { toast.success(`${name} さんの権限を「${ROLE_LABEL[next as AppRole]}」にしました`); router.refresh(); }
          else { toast.error(r.error); el.value = role; }
        });
      }}
    >
      {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}
