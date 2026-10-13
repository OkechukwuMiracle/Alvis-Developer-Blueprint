import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ContentView } from "./content-view";
import { Editor } from "./editor";
import { ReviewerLearning } from "./learning-workspace";
import { Shell } from "./shell";
import { mutate, copyDraft } from "@/app/actions";
import { view, identity } from "@/lib/api-server";
import { CommunityShare } from "./community-share";
export async function RevisionDetail({
  id,
  review,
  search,
}: {
  id: string;
  review: boolean;
  search: { error?: string; saved?: string };
}) {
  const {user,r,links,sources,reviews,previous,history} = await view("revision-detail", {id: id,review: review,search: search});
  const personal = (await identity()).active_context === "personal";
  return (
    <Shell>
      <Link href={review ? "/review" : "/drafts"}>
        ← {review ? "Review queue" : "My drafts"}
      </Link>
      <h1>{r.content.title}</h1>
      {r.capture_id && (
        <Link className="source-link" href={"/captures/" + r.capture_id}>
          Open recording, transcript and generated proposals →
        </Link>
      )}
      <span className="badge">
        {r.status} · Version {r.version} · {r.content.asset_code}
      </span>
      {!review && personal && ["approved", "retired", "rejected"].includes(r.status) && <form action={copyDraft}>
        <input type="hidden" name="unit_id" value={r.unit_id} />
        <button>Create correction draft version</button>
      </form>}
      <p className="notice">
        {r.status === "approved" ? (personal ? "Community reviewed" : "Organization reviewed") : r.status === "retired" ? "Inactive reviewed version" : "Unverified until human review"} · Training simulation only. Source
        evidence is linked below.
      </p>
      {search.error && (
        <p role="alert" className="notice error">
          {search.error}
        </p>
      )}
      {search.saved && (
        <p className="notice" role="status">
          Saved. This page shows the persisted revision.
        </p>
      )}
      <div className="split">
        <section>
          <ContentView content={r.content} />
          {review && r.status === "approved" && (
            <ReviewerLearning revisionId={r.id} />
          )}
          {!review && r.status === "draft" && personal && <CommunityShare revisionId={r.id} hash={r.content_hash} content={r.content} sources={sources || []} />}
          {!review && r.status === "draft" && (
            <div className="mt-6">
              <Editor
                key={r.content_hash}
                sourceIds={(links ?? []).map((x) => x.source_id)}
                content={r.content}
                revisionId={r.id}
                hash={r.content_hash}
              />
            </div>
          )}
          {history?.length ? (
            <details className="card mt-6">
              <summary>Prior draft snapshots ({history.length})</summary>
              {history.map((h) => (
                <details key={h.id}>
                  <summary>{new Date(h.saved_at).toLocaleString()}</summary>
                  <ContentView content={h.content} />
                </details>
              ))}
            </details>
          ) : null}
          {previous?.[0] && (
            <details className="card mt-6">
              <summary>Compare with version {previous[0].version}</summary>
              <ContentView content={previous[0].content} />
            </details>
          )}
        </section>
        <aside className="stack">
          <section className="card">
            <h2>Original evidence</h2>
            {sources?.map((s) => (
              <details key={s.id} className="source">
                <summary>
                  {s.locator} · {s.synthetic ? "Synthetic example" : "Source"}
                </summary>
                <p className="mt-3">{s.text_content}</p>
                <Link href={"/sources/" + s.id}>Open source detail ↗</Link>
              </details>
            ))}
            {!sources?.length && (
              <p className="error">
                No evidence linked. Publication is blocked.
              </p>
            )}
          </section>
          {review && r.status === "pending" && r.created_by !== user.id && (
            <form className="card" action={mutate}>
              <h2>Review this version</h2>
              <input type="hidden" name="revision_id" value={r.id} />
              <input type="hidden" name="hash" value={r.content_hash} />
              <input type="hidden" name="request_key" value={randomUUID()} />
              {[
                "Equipment context matches",
                "Reason and exceptions are supported",
                "Every instruction has evidence",
                "Training simulation boundary is clear",
              ].map((label, i) => (
                <label
                  className="flex gap-3 items-start font-normal"
                  key={label}
                >
                  <input
                    type="checkbox"
                    required
                    className="!w-5 !min-h-5 mt-1"
                    name={"check" + i}
                  />
                  {label}
                </label>
              ))}
              <label htmlFor="comment">
                Review comment / field-specific feedback
              </label>
              <textarea
                id="comment"
                name="comment"
                required
                placeholder="State what you checked, or name the fields needing changes."
              />
              <div className="actions">
                <button name="operation" value="approve">
                  Approve
                </button>
                <button
                  className="secondary"
                  name="operation"
                  value="request_changes"
                  formNoValidate
                >
                  Request changes
                </button>
                <button
                  className="secondary"
                  name="operation"
                  value="reject"
                  formNoValidate
                >
                  Reject
                </button>
              </div>
              <p className="muted text-sm mt-4">
                Approval publishes this exact content and records its hash.
                Keyword indexing is completed in the same transaction.
              </p>
            </form>
          )}
          {review && r.created_by === user.id && (
            <p className="notice">
              You cannot review your own draft. Another designated reviewer must
              review it.
            </p>
          )}
          {!review && r.status === "draft" && !personal && (
            <form className="card" action={mutate}>
              <h2>Ready for review?</h2>
              <p className="muted">
                Save your edits first. Submission locks this draft until the
                reviewer returns it.
              </p>
              <input type="hidden" name="revision_id" value={r.id} />
              <input type="hidden" name="hash" value={r.content_hash} />
              <button name="operation" value="submit" className="mt-4">
                Submit for review
              </button>
            </form>
          )}
          <section className="card">
            <h2>Review history</h2>
            {reviews?.map((x) => (
              <div className="source" key={x.id}>
                <span className="badge">{x.decision.replace("_", " ")}</span>
                <p>{x.comment}</p>
                <p className="muted text-sm">
                  {new Date(x.created_at).toLocaleString("en-GB", {
                    timeZone: "Africa/Lagos",
                  })}
                </p>
              </div>
            ))}
            {!reviews?.length && (
              <p className="muted">No review decisions yet.</p>
            )}
          </section>
        </aside>
      </div>
    </Shell>
  );
}
