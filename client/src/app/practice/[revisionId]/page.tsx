import { Shell } from "@/components/shell";
import { PracticeStart } from "@/components/learning-workspace";
import { view } from "@/lib/api-server";
export default async function Practice({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  const {revisionId,r} = await view("practice/[revisionId]", {params: await params});
  return (
    <Shell>
      <h1>Supervised guided practice</h1>
      <PracticeStart revisionId={revisionId} content={r.content} />
    </Shell>
  );
}
