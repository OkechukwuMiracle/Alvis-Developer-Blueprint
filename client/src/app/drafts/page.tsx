import Link from "next/link";
import { Shell } from "@/components/shell";
import { copyDraft } from "@/app/actions";
import { view } from "@/lib/api-server";
export default async function Drafts({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const {rows,units,error} = await view("drafts", {searchParams: await searchParams});
  return (
    <Shell>
      <div className="eyebrow">Expert contributions</div>
      <h1>My drafts</h1>
      <p className="muted">
        Edit and submit your source-linked knowledge. Approved content stays
        unchanged; a correction creates a new version.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="grid-cards mt-6">
        {rows.map((r) => (
          <article className="card" key={r.id}>
            <span className="badge">
              {r.status} · Version {r.version}
            </span>
            <h2>
              <Link href={"/drafts/" + r.id}>{r.content.title}</Link>
            </h2>
            <p className="muted">
              {r.content.asset_code} ·{" "}
              {r.capture_id ? "Expert recording" : "Synthetic example"}
            </p>
            {r.status === "approved" &&
              !rows.some(
                (x) =>
                  x.unit_id === r.unit_id &&
                  ["draft", "pending"].includes(x.status),
              ) &&
              units.some((u) => u.active_revision_id === r.id) && (
                <form action={copyDraft}>
                  <input type="hidden" name="unit_id" value={r.unit_id} />
                  <button className="secondary mt-4">
                    Create next draft version
                  </button>
                </form>
              )}
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="notice">
          No drafts yet. Record or upload a short training video to begin.
        </p>
      )}
    </Shell>
  );
}
