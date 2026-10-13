import Link from "next/link";
import { Shell } from "@/components/shell";
import { ContentView } from "@/components/content-view";
import { ReviewerLearning } from "@/components/learning-workspace";
import { view } from "@/lib/api-server";
export default async function Detail({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const {member,r} = await view("knowledge/[unitId]", {params: await params});
  return (
    <Shell>
      <Link href="/knowledge">← Knowledge library</Link>
      <h1>{r.content.title}</h1>
      <div className="flex gap-2">
        <span className="badge">{r.content.asset_code}</span>
        <span className="badge">Approved · Version {r.version}</span>
      </div>
      <p className="notice">
        {r.capture_id ? "Expert recording" : "Synthetic example"} · Training
        simulation. This account is not an approved real equipment maintenance
        procedure.
      </p>
      <div className="actions">
        <Link className="button" href={"/practice/" + r.id}>
          Start supervised training guide
        </Link>
        <Link className="source-link" href="/learning">
          Find reviewed lessons →
        </Link>
        <Link className="source-link" href="/ask">
          Ask Alvis →
        </Link>
      </div>
      <ContentView content={r.content} />
      {member.role === "reviewer" && <ReviewerLearning revisionId={r.id} />}
    </Shell>
  );
}
