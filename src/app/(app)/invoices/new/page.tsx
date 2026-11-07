import { DocumentNewPage } from "@/components/documents/pages";

export const metadata = { title: "請求書を作成" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DocumentNewPage kind="invoice" searchParams={searchParams} />;
}
