import { notFound } from "next/navigation";
import { RecurringFormPage } from "@/components/recurring/recurring-page";

export const metadata = { title: "定期請求を編集" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <RecurringFormPage id={id} />;
}
