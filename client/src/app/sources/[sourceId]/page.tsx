import Link from "next/link";
import { SourcePlayer } from "@/components/private-player";
import { Shell } from "@/components/shell";
import { view } from "@/lib/api-server";
export default async function Source({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const {s} = await view("sources/[sourceId]", {params: await params});
  return (
    <Shell>
      <Link href="/knowledge">← Knowledge library</Link>
      <div className="eyebrow mt-6">Source registry</div>
      <h1>Original evidence</h1>
      <div className="card">
        <span className="badge">{s.kind.replace("_", " ")}</span>
        <h2>{s.locator}</h2>
        {s.synthetic && (
          <p className="notice">
            Synthetic example · Fictional training note. No video binary is
            included.
          </p>
        )}
        <p className="whitespace-pre-wrap">
          {s.text_content ?? "No text excerpt available."}
        </p>
        {s.start_ms !== null && (
          <p className="muted mt-6">
            Source timestamp: {s.start_ms / 1000}s
            {s.end_ms !== null ? " – " + s.end_ms / 1000 + "s" : ""}
          </p>
        )}
        {s.capture_id && (
          <SourcePlayer
            sourceId={s.id}
            audio={s.kind === "debrief"}
            start={s.start_ms ?? 0}
          />
        )}
        <p className="muted text-xs mt-6 break-all">Source ID: {s.id}</p>
      </div>
    </Shell>
  );
}
