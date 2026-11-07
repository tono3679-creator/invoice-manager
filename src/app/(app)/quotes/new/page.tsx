import { DocumentNewPage } from "@/components/documents/pages";

export const metadata = { title: "見積書を作成" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DocumentNewPage kind="quote" searchParams={searchParams} />;
}
