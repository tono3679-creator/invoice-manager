import { DemoBanner } from "@/components/layout/demo-banner";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatDateLong } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [row] = await asUser(user.userId, (tx) => tx<{ pending: number; title: string | null }[]>`
    select (select count(*)::int from documents where status = 'pending') pending,
           (select title from profiles where id = ${user.userId}) title`);
  return (
    <div className="min-h-dvh">
      <Sidebar companyName={user.companyName} pendingCount={row.pending} />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        {user.isDemo && <DemoBanner role={user.role} />}
        <Header
          today={formatDateLong(new Date())}
          displayName={user.displayName}
          title={row.title}
          role={user.role}
          companyName={user.companyName}
          isDemo={user.isDemo}
          pendingCount={row.pending}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
