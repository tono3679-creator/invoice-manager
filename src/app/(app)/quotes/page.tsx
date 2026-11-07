import { DocumentListPage } from "@/components/documents/pages";

export const metadata = { title: "見積書" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DocumentListPage kind="quote" searchParams={searchParams} />;
}
