import { DocumentEditPage } from "@/components/documents/pages";

export const metadata = { title: "請求書を編集" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DocumentEditPage kind="invoice" params={params} />;
}
