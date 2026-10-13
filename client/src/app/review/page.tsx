import Link from "next/link";
import { Shell } from "@/components/shell";
import { view } from "@/lib/api-server";
export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const {filter,filtered} = await view("review", {searchParams: await searchParams});
  return (
    <Shell>
      <div className="eyebrow">Human review</div>
      <h1>Review queue</h1>
      <p className="muted">
        Approve the exact version only after checking each claim against its
        evidence.
      </p>
      <nav aria-label="Queue filters" className="actions mb-6">
        {[
          ["waiting", "Waiting"],
          ["changes", "Changes requested"],
          ["reviewed", "Reviewed"],
        ].map(([v, label]) => (
          <Link
            className={"button " + (filter === v ? "" : "secondary")}
            aria-current={filter === v ? "page" : undefined}
            key={v}
            href={"/review?filter=" + v}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="stack">
        {filtered.map((r) => (
          <Link key={r.id} className="card block" href={"/review/" + r.id}>
            <span className="badge">
              {r.status} · {r.content.asset_code} · Version {r.version}
            </span>
            <h2>{r.content.title}</h2>
            <p className="muted">
              {r.content.missing_information.length +
                r.content.contradictions.length}{" "}
              unresolved gaps or contradictions ·{" "}
              {r.capture_id ? "Expert recording" : "Synthetic example"}
            </p>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <p className="notice">
          Nothing in this queue. Submitted drafts will appear under Waiting.
        </p>
      )}
    </Shell>
  );
}
