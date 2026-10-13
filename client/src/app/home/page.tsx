import Link from "next/link";
import { Shell } from "@/components/shell";
import { view, identity } from "@/lib/api-server";
import { redirect } from "next/navigation";
export default async function Home() {
  if ((await identity()).active_context === "personal") redirect("/community/home");
  const {member,assets,published,pending,drafts,captures,reviewer,expert,admin} = await view("home", {});
  return (
    <Shell>
      <div className="eyebrow">Knowledge with a human review</div>
      <h1>Hello, {member.display_name.split(" ")[0]}.</h1>
      <p className="muted mb-8">
        {reviewer
          ? "Check the evidence. Help the team learn from sound judgment."
          : expert
            ? "Your experience becomes knowledge the team can trust and trace."
            : "Explore reviewed observations, decisions, and the reasoning behind them."}
      </p>
      <div className="grid-cards">
        <section className="card">
          <span className="eyebrow">
            {reviewer ? "Your next action" : expert ? "Contribute" : "Explore"}
          </span>
          <h2>
            {reviewer
              ? "Review submitted knowledge"
              : expert
                ? "Prepare a draft"
                : "Ask Alvis and learn"}
          </h2>
          <p className="muted">
            {expert
              ? "Record a training task, add the judgment behind it, and submit the draft for human review."
              : "Every published case includes its supporting sources and applicability limits."}
          </p>
          <Link
            className="button mt-5"
            href={reviewer ? "/review" : expert ? "/drafts" : "/ask"}
          >
            {reviewer
              ? "Open review queue"
              : expert
                ? "Open my drafts"
                : "Ask Alvis"}{" "}
            →
          </Link>
        </section>
        <section className="card">
          <span className="eyebrow">Training workspace</span>
          <h2>{assets.length} training assets</h2>
          <p className="muted">
            {assets.map((a) => a.code).join(" · ") ||
              "No assets yet. Your administrator can add your own training assets in Workspace settings."}
          </p>
          <h2>{published.length} approved cases</h2>
          <p className="muted">Current versions, ready to read.</p>
          {reviewer && <h2>{pending.length} waiting for review</h2>}
          {expert && (
            <h2>
              {drafts.length} drafts · {pending.length} submitted
            </h2>
          )}
          {admin && (
            <>
              <Link className="button mt-5" href="/settings">
                Add assets and invite your team
              </Link>
              <h2>{admin[0].count ?? 0} members</h2>
              <p>{admin[1].count ?? 0} recorded activity events</p>
            </>
          )}
        </section>
      </div>
      {expert && (
        <section className="mt-8">
          <h2>Your captures</h2>
          <Link className="source-link" href="/captures/new">
            Record knowledge →
          </Link>
          <div className="grid-cards">
            {captures?.map((c) => (
              <Link className="card" key={c.id} href={"/captures/" + c.id}>
                <span className="badge">{c.state}</span>
                <h3>{c.title}</h3>
              </Link>
            ))}
          </div>
          {!captures?.length && (
            <p>
              Record or upload a short training video to preserve its judgment.
            </p>
          )}
        </section>
      )}
      {(reviewer || expert) && (
        <section className="mt-8">
          <h2>{reviewer ? "Waiting for your review" : "Your drafts"}</h2>
          <div className="grid-cards">
            {(reviewer ? pending : drafts).slice(0, 3).map((r) => (
              <Link
                className="card"
                href={(reviewer ? "/review/" : "/drafts/") + r.id}
                key={r.id}
              >
                <span className="badge">
                  {r.status} · Version {r.version}
                </span>
                <h3 className="mt-3">{r.content.title}</h3>
                <p className="muted">
                  {r.capture_id ? "Expert recording" : "Synthetic example"} ·{" "}
                  {r.content.asset_code}
                </p>
              </Link>
            ))}
          </div>
          {!(reviewer ? pending : drafts).length && (
            <p className="notice">
              {reviewer
                ? "No submitted drafts are waiting."
                : "No editable drafts. Create the next version from an approved case in My drafts."}
            </p>
          )}
        </section>
      )}
      <h2 className="mt-10">Recent approved knowledge</h2>
      <div className="grid-cards">
        {published.slice(0, 3).map((r) => (
          <Link key={r.id} href={"/knowledge/" + r.unit_id} className="card">
            <span className="badge">
              {r.content.asset_code} · Version {r.version}
            </span>
            <h2>{r.content.title}</h2>
            <p className="muted">{r.content.signal.text}</p>
            <p className="mt-3 text-sm">
              {r.capture_id ? "Expert recording" : "Synthetic example"} · Read
              case →
            </p>
          </Link>
        ))}
      </div>
      {!published.length && (
        <p className="notice">
          No reviewed knowledge yet. A designated reviewer must approve a
          submitted draft before it appears here.
        </p>
      )}
    </Shell>
  );
}
