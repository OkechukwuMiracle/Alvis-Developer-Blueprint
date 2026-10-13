import { RevisionDetail } from "@/components/revision-detail";
import { view } from "@/lib/api-server";
export default async function Draft({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string; revisionId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const {revisionId} = await view("knowledge/[unitId]/revisions/[revisionId]/edit", {params: await params,searchParams: await searchParams});
  return (
    <RevisionDetail
      id={revisionId}
      review={false}
      search={await searchParams}
    />
  );
}
