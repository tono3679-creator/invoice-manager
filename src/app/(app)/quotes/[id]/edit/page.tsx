import { DocumentEditPage } from "@/components/documents/pages";

export const metadata = { title: "見積書を編集" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DocumentEditPage kind="quote" params={params} />;
}
