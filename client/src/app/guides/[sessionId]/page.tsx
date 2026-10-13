import { Shell } from "@/components/shell";
import { GuideView } from "@/components/learning-workspace";
import { view } from "@/lib/api-server";
export default async function Guide({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const {data,history} = await view("guides/[sessionId]", {params: await params});
  return (
    <Shell>
      <h1>Reviewed training guide</h1>
      <GuideView
        initial={data}
        lessons={(history?.lessons ?? []).filter(
          (l: { revision_id: string }) => l.revision_id === data.revision_id,
        )}
      />
    </Shell>
  );
}
