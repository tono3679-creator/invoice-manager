"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * 確認してから実行するボタン。withReason を付けると理由（コメント）の入力欄を出す。
 * onConfirm が true を返したら閉じる。
 */
export function ConfirmButton({
  label, icon, title, description, confirmLabel, destructive, confirmVariant, variant = "outline", size, className,
  withReason, reasonLabel, reasonRequired, reasonPlaceholder, disabled, onConfirm, ariaLabel,
}: {
  ariaLabel?: string;
  label: string; icon?: React.ReactNode; title: string; description?: React.ReactNode; confirmLabel: string; destructive?: boolean; confirmVariant?: React.ComponentProps<typeof Button>["variant"];
  variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"]; className?: string;
  withReason?: boolean; reasonLabel?: string; reasonRequired?: boolean; reasonPlaceholder?: string; disabled?: boolean;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = withReason && reasonRequired && reason.trim() === "";
  return (
    <>
      <Button variant={variant} size={size} className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => { setReason(""); setOpen(true); }}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
          </DialogHeader>
          {withReason && (
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-reason">
                {reasonLabel ?? "コメント"}
                {reasonRequired ? <span className="text-xs text-destructive">必須</span> : <span className="text-xs text-muted-foreground">任意</span>}
              </Label>
              <Textarea id="confirm-reason" rows={3} value={reason} placeholder={reasonPlaceholder} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>キャンセル</Button>
            <Button
              variant={confirmVariant ?? (destructive ? "destructive" : "default")}
              disabled={busy || blocked}
              onClick={async () => {
                setBusy(true);
                try {
                  if (await onConfirm(reason)) setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
