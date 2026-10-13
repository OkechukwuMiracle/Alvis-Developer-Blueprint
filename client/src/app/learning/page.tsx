import Link from "next/link";
import { Shell } from "@/components/shell";
import { view } from "@/lib/api-server";
export default async function Learning() {
  const {member,data,guides} = await view("learning", {});
  return (
    <Shell>
      <h1>Learning history</h1>
      <p className="notice">
        Participation and knowledge checks are recorded here. Practical
        competence requires a separate observed assessment.
      </p>
      {member.role === "reviewer" && (
        <p>
          <Link className="source-link" href="/review/lessons">
            Review lesson drafts and indexing jobs →
          </Link>
        </p>
      )}
      <h2>Resume practice</h2>
      {guides?.map((g) => (
        <p key={g.id}>
          <Link href={"/guides/" + g.id}>
            Resume reviewed guide ·{" "}
            {new Date(g.started_at).toLocaleDateString()}
          </Link>
        </p>
      ))}
      {!guides?.length && <p>No active guides.</p>}
      <h2>Suggested next reviewed lesson</h2>
      {data.lessons
        .filter(
          (l: { id: string; skill_tags: string[] }) =>
            data.attempts[0]?.skill_tags?.some((tag: string) =>
              l.skill_tags.includes(tag),
            ) &&
            !data.attempts.some(
              (a: { lesson_id: string; correct_count: number }) =>
                a.lesson_id === l.id && a.correct_count === 3,
            ),
        )
        .slice(0, 1)
        .map((l: { id: string; title: string }) => (
          <p key={l.id}>
            <Link href={"/learn/" + l.id}>
              {l.title} · Shares a skill with your recent lesson →
            </Link>
          </p>
        ))}
      <h2>Reviewed lessons</h2>
      <div className="cards">
        {data.lessons.map(
          (l: { id: string; title: string; version: number }) => (
            <Link className="panel" key={l.id} href={"/learn/" + l.id}>
              <h3>{l.title}</h3>
              <p>
                Version {l.version} ·{" "}
                {data.attempts.some(
                  (a: { lesson_id: string; correct_count: number }) =>
                    a.lesson_id === l.id && a.correct_count === 3,
                )
                  ? "Knowledge check passed"
                  : data.attempts.some(
                        (a: { lesson_id: string }) => a.lesson_id === l.id,
                      )
                    ? "Practiced"
                    : "Not attempted"}
              </p>
            </Link>
          ),
        )}
      </div>
      {!data.lessons.length && (
        <p>No reviewed lessons available. Ask a reviewer to publish one.</p>
      )}
      <h2>Assessment attempts</h2>
      {data.attempts.map(
        (a: {
          id: string;
          title: string;
          version: number;
          correct_count: number;
          completed_at: string;
          revision_id: string;
        }) => (
          <article className="panel mb-4" key={a.id}>
            <h3>{a.title}</h3>
            <p>
              Revision {a.revision_id} · Version {a.version}
            </p>
            <p>
              {new Date(a.completed_at).toLocaleString()} · {a.correct_count} of
              3 ·{" "}
              {a.correct_count === 3
                ? "Knowledge check passed"
                : "Needs another attempt"}
            </p>
          </article>
        ),
      )}
      {!data.attempts.length && <p>No assessments yet.</p>}
    </Shell>
  );
}
