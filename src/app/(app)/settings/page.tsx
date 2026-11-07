import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { MemberRoleSelect } from "@/components/settings/member-role";
import { SettingsForm } from "@/components/settings/settings-form";
import { asCurrentUser } from "@/lib/auth";
import { getIssuerSettings } from "@/lib/data/documents";
import { ROLE_DESCRIPTION, ROLE_LABEL, can, type AppRole } from "@/lib/domain/labels";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const { s, members, user } = await asCurrentUser(async (tx, user) => ({
    user,
    s: await getIssuerSettings(tx),
    members: await tx<{ id: string; display_name: string; title: string | null; role: AppRole; email: string | null }[]>`
      select p.id, p.display_name, p.title, p.role, null::text email from profiles p
       order by array_position(array['admin','approver','member','viewer']::app_role[], p.role), p.display_name`,
  }));
  const admin = can.settings(user.role);
  return (
    <div className="space-y-5">
      <PageHeader title="設定" description="会社の情報・書類の計算と承認のルール・社員の権限。" />
      <div className="grid gap-5 xl:grid-cols-[1fr_26rem]">
        <SettingsForm
          editable={admin}
          initial={{
            company_name: user.companyName, legal_name: s.legal_name, postal_code: s.postal_code ?? "", address: s.address ?? "", phone: s.phone ?? "",
            email: s.email ?? "", registration_number: s.registration_number ?? "", bank_account: s.bank_account ?? "", rounding: s.rounding,
            approval_threshold: String(s.approval_threshold), quote_valid_days: String(s.quote_valid_days),
            invoice_prefix: s.invoice_prefix, quote_prefix: s.quote_prefix, receipt_prefix: s.receipt_prefix,
            default_invoice_notes: s.default_invoice_notes ?? "", default_quote_notes: s.default_quote_notes ?? "", show_seal: s.show_seal, seal_text: s.seal_text ?? s.legal_name.slice(0, 12),
          }}
        />
        <div className="space-y-5">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">社員と権限</CardTitle>
              <CardDescription>権限の確認は画面だけでなく、データベースでも行っています。</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>名前</TableHead><TableHead>権限</TableHead></TableRow></TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.display_name}{m.id === user.userId && <Badge variant="info" className="ml-2">あなた</Badge>}</div>
                      {m.title && <div className="text-xs text-muted-foreground">{m.title}</div>}
                    </TableCell>
                    <TableCell>{admin ? <MemberRoleSelect id={m.id} name={m.display_name} role={m.role} /> : ROLE_LABEL[m.role]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">権限でできること</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                  <div key={r}><dt className="font-medium">{ROLE_LABEL[r]}</dt><dd className="text-muted-foreground">{ROLE_DESCRIPTION[r]}</dd></div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
