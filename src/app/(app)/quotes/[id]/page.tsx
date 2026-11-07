import { DocumentDetailPage } from "@/components/documents/pages";

export const metadata = { title: "見積書" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DocumentDetailPage kind="quote" params={params} />;
}
