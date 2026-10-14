import Link from "next/link";
import type { Content, Claim } from "@/lib/content";
function Evidence({ ids, sourceBase }: { ids: string[]; sourceBase: string }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm mt-2">
      {ids.map((id, i) => (
        <Link key={id} className="source-link" href={sourceBase + id}>
          Source {i + 1} ↗
        </Link>
      ))}
    </div>
  );
}
function ClaimView({ label, claim, sourceBase }: { label: string; claim: Claim; sourceBase: string }) {
  return (
    <section className="card">
      <div className="flex justify-between gap-3">
        <h3>{label}</h3>
        <span className="badge">{claim.basis}</span>
      </div>
      <p className="mt-2">{claim.text ?? "Not established"}</p>
      <Evidence ids={claim.evidence_ids} sourceBase={sourceBase} />
    </section>
  );
}
export function ContentView({ content: c, sourceBase = "/sources/" }: { content: Content; sourceBase?: string }) {
  return (
    <div className="stack content-view">
      {(c.missing_information.length > 0 || c.contradictions.length > 0) && (
        <div className="notice">
          <strong>Review blockers</strong>
          {[...c.missing_information, ...c.contradictions].map((x, i) => (
            <p key={i}>{x}</p>
          ))}
        </div>
      )}
      {(
        [
          "situation",
          "signal",
          "interpretation",
          "decision",
          "reason",
          "outcome",
        ] as const
      ).map((key) => (
        <ClaimView
          key={key}
          label={
            key === "reason"
              ? "Why this decision"
              : key[0].toUpperCase() + key.slice(1)
          }
          claim={c[key]}
          sourceBase={sourceBase}
        />
      ))}
      {(["exceptions", "prerequisites", "stop_conditions"] as const).map(
        (key) => (
          <section key={key}>
            <h2>{key.replace("_", " ")}</h2>
            <div className="stack">
              {c[key].map((x, i) => (
                <ClaimView key={i} label={String(i + 1)} claim={x} sourceBase={sourceBase} />
              ))}
            </div>
          </section>
        ),
      )}
      <section>
        <h2>Procedural steps</h2>
        <p className="muted">
          Reviewed training steps only. Practice requires supervision, prerequisites and a simulation acknowledgement.
        </p>
        {c.steps.map((s) => (
          <div className="card mt-3" key={s.order}>
            <h3>
              {s.order}. {s.instruction}
            </h3>
            <p className="muted">{s.rationale}</p>
            {s.requires_authorized_person && (
              <span className="badge">Authorized person required</span>
            )}
            <Evidence ids={s.evidence_ids} sourceBase={sourceBase} />
          </div>
        ))}
      </section>
      <div className="flex gap-2 flex-wrap">
        {c.skill_tags.map((tag) => (
          <span key={tag} className="badge">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
