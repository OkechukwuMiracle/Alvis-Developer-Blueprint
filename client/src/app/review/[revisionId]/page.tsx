import { RevisionDetail } from "@/components/revision-detail";
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  return (
    <RevisionDetail
      id={(await params).revisionId}
      review
      search={await searchParams}
    />
  );
}
