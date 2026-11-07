import { DocumentDetailPage } from "@/components/documents/pages";

export const metadata = { title: "請求書" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DocumentDetailPage kind="invoice" params={params} />;
}
