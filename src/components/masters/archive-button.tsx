"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/common/confirm-button";
import { deleteClient, deleteItem, setClientArchived, setItemArchived } from "@/lib/actions/masters";
import { safeAction } from "@/lib/client/safe-action";

export function ArchiveButton({ kind, id, name, archived }: { kind: "client" | "item"; id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = () => startTransition(async () => {
    const result = await safeAction(() => (kind === "client" ? setClientArchived(id, !archived) : setItemArchived(id, !archived)));
    if (result.ok) {
      toast.success(archived ? `${name} を元に戻しました` : `${name} をアーカイブしました`);
      router.refresh();
    } else toast.error(result.error);
  });
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={run}>
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? "元に戻す" : "アーカイブ"}
    </Button>
  );
}

export function DeleteMasterButton({ kind, id, name, redirectTo }: { kind: "client" | "item"; id: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      icon={<Trash2 aria-hidden />}
      label="削除"
      title={`${name} を削除しますか？`}
      description="書類で使われているものは削除できません（アーカイブを使ってください）。この操作は元に戻せません。"
      confirmLabel="削除する"
      destructive
      onConfirm={async () => {
        const result = await safeAction(() => (kind === "client" ? deleteClient(id) : deleteItem(id)));
        if (result.ok) {
          toast.success(`${name} を削除しました`);
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
          return true;
        }
        toast.error(result.error);
        return false;
      }}
    />
  );
}
