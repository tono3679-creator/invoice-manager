import { DocumentListPage } from "@/components/documents/pages";

export const metadata = { title: "請求書" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DocumentListPage kind="invoice" searchParams={searchParams} />;
}
