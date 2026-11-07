import { AlarmClock, Ban, CircleCheckBig, CircleDashed, FileCheck2, Hourglass, Send, Stamp, Wallet, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATE_LABEL, STATUS_LABEL, type DocStatus, type PaymentState } from "@/lib/domain/labels";

const STATUS_STYLE: Record<DocStatus, { variant: "neutral" | "info" | "success" | "warning" | "danger" | "outline"; Icon: typeof Ban }> = {
  draft: { variant: "neutral", Icon: CircleDashed },
  pending: { variant: "warning", Icon: Hourglass },
  approved: { variant: "info", Icon: Stamp },
  issued: { variant: "success", Icon: FileCheck2 },
  accepted: { variant: "info", Icon: CircleCheckBig },
  void: { variant: "outline", Icon: Ban },
};

/** 書類の状態。色・アイコン・文字の3つで区別する */
export function StatusBadge({ status }: { status: DocStatus }) {
  const { variant, Icon } = STATUS_STYLE[status];
  return (
    <Badge variant={variant} className={status === "void" ? "text-muted-foreground line-through" : undefined}>
      <Icon aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PAY_STYLE: Record<PaymentState, { variant: "neutral" | "info" | "success" | "warning" | "danger"; Icon: typeof Ban }> = {
  paid: { variant: "success", Icon: Wallet },
  partial: { variant: "info", Icon: CircleDot },
  overdue: { variant: "danger", Icon: AlarmClock },
  unpaid: { variant: "neutral", Icon: Send },
};

export function PaymentBadge({ state, daysOverdue }: { state: PaymentState; daysOverdue?: number | null }) {
  const { variant, Icon } = PAY_STYLE[state];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {PAYMENT_STATE_LABEL[state]}
      {state === "overdue" && daysOverdue ? `（${daysOverdue}日）` : ""}
    </Badge>
  );
}
