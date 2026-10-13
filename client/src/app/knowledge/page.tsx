import Link from "next/link";
import { Shell } from "@/components/shell";
import { view } from "@/lib/api-server";
export default async function Knowledge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const {assets,p,reviews,tags,filtered} = await view("knowledge", {searchParams: await searchParams});
  return (
    <Shell>
      <div className="eyebrow">Approved & traceable</div>
      <h1>Knowledge library</h1>
      <p className="muted">
        Understand the signal, the decision, and why it mattered.
      </p>
      <form className="card grid-cards my-6">
        <div>
          <label htmlFor="q">Search knowledge</label>
          <input
            id="q"
            name="q"
            defaultValue={p.q}
            placeholder="Search a signal or decision"
          />
        </div>
        <div>
          <label htmlFor="asset">Training asset</label>
          <select id="asset" name="asset" defaultValue={p.asset}>
            <option value="">All assets</option>
            {assets.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="skill">Skill topic</label>
          <select id="skill" name="skill" defaultValue={p.skill}>
            <option value="">All topics</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <button className="self-end">Apply filters</button>
      </form>
      <p className="muted mb-4">{filtered.length} current reviewed cases</p>
      <div className="grid-cards">
        {filtered.map((r) => {
          const review = reviews?.find((x) => x.revision_id === r.id);
          return (
            <article className="card" key={r.id}>
              <span className="badge">
                {r.content.asset_code} · Version {r.version}
              </span>
              <h2>
                <Link href={"/knowledge/" + r.unit_id}>{r.content.title}</Link>
              </h2>
              <p>{r.content.signal.text}</p>
              <p className="muted text-sm mt-4">
                Reviewed by {review?.reviewer_name ?? "Designated reviewer"}
                {review &&
                  " · " +
                    new Date(review.approved_at).toLocaleDateString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}
              </p>
              <p className="text-sm mt-2">
                {r.capture_id ? "Expert recording" : "Synthetic example"} ·
                Training simulation
              </p>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <p className="notice">
          No approved cases match these filters. Try another asset or search
          term.
        </p>
      )}
    </Shell>
  );
}
