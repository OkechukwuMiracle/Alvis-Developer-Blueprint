import Link from "next/link";
import { Shell } from "@/components/shell";
import { ReviewerLearning, LearningRetry } from "@/components/learning-workspace";
import type { Lesson } from "@/lib/learning";
import { view } from "@/lib/api-server";
export default async function ReviewLessons() {
  const {lessons,jobs,tasks,requests,attempts} = await view("review/lessons", {});
  return (
    <Shell>
      <h1>Lesson review and indexing</h1>
      <p>
        Inspect source support and all three questions before approving. Refresh
        this page to check durable job status.
      </p>
      <Link href="/knowledge">
        Choose a reviewed revision to draft a lesson →
      </Link>
      <p>
        {attempts?.length ?? 0} assessment attempts ·{" "}
        {attempts?.filter((a) => a.correct_count === 3).length ?? 0} knowledge
        checks passed.
      </p>
      <h2>Processing jobs</h2>
      {jobs?.map((j) => (
        <section className="panel" key={j.id}>
          <p>
            {j.stage} · {j.status} · Attempt {j.attempts} {j.error_code ?? ""} ·
            Revision {j.revision_id}
          </p>
          {j.status === "failed" && j.attempts < 3 && (
            <LearningRetry id={j.id} />
          )}
        </section>
      ))}
      <h2>Expert review requests</h2>
      {tasks?.map((t) => (
        <p key={t.id}>
          Ask request {t.ask_id} · {new Date(t.created_at).toLocaleString()}
          <br />
          {requests?.find((r) => r.id === t.ask_id)?.query}
          <br />
          {requests?.find((r) => r.id === t.ask_id)?.response?.summary}
        </p>
      ))}
      <h2>Lesson drafts</h2>
      {lessons?.map((l) => (
        <ReviewerLearning
          key={l.id}
          lesson={
            l as {
              id: string;
              content: Lesson;
              content_hash: string;
              state: string;
            }
          }
        />
      ))}
    </Shell>
  );
}
