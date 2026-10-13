"use client";
import { apiFetch } from "@/lib/api-client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Content } from "@/lib/content";
import type { Answer, Lesson } from "@/lib/learning";
async function send(path: string, body: unknown) {
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message ?? "Request failed.");
  return data;
}
function Sources({ ids }: { ids: string[] }) {
  return (
    <div className="actions">
      {ids.map((id) => (
        <Link className="source-link" key={id} href={"/sources/" + id}>
          Inspect source →
        </Link>
      ))}
    </div>
  );
}
export function AskForm({
  assets,
}: {
  assets: { id: string; code: string; name: string }[];
}) {
  const [asset, setAsset] = useState(""),
    [query, setQuery] = useState(""),
    [result, setResult] = useState<{
      id: string;
      answer: Answer;
      guide_revision_id: string | null;
      latency_ms: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setResult(null);
          try {
            setResult(
              await send("/api/ask", { asset_id: asset || null, query }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Training asset
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">Select an asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Describe the problem
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Retrieving reviewed sources…" : "Ask Alvis"}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {result && (
        <section className="panel mt-6" aria-live="polite">
          <span className="badge">
            {result.answer.mode === "abstain"
              ? "No reviewed answer"
              : result.answer.mode}
          </span>
          <h2>{result.answer.summary}</h2>
          <p className="muted">
            Generated explanation from reviewed sources. The synthesis has not
            been expert approved.
          </p>
          {result.answer.clarifying_question && (
            <p>{result.answer.clarifying_question}</p>
          )}
          {result.answer.escalation_reason && (
            <p>{result.answer.escalation_reason}</p>
          )}
          {result.answer.claims.map((c, i) => (
            <article key={i}>
              <p>{c.text}</p>
              <Sources ids={c.evidence_ids} />
            </article>
          ))}
          {result.guide_revision_id && (
            <Link
              className="source-link"
              href={"/practice/" + result.guide_revision_id}
            >
              Start supervised training guide →
            </Link>
          )}
          {result.answer.mode === "abstain" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await send("/api/learning", {
                    operation: "request_review",
                    entity: result.id,
                  });
                  setError("Expert review requested in this workspace.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Request expert review
            </button>
          )}
          <p className="muted">
            Response time: {(result.latency_ms / 1000).toFixed(1)} seconds
          </p>
        </section>
      )}
    </>
  );
}
export function PracticeStart({
  revisionId,
  content,
}: {
  revisionId: string;
  content: Content;
}) {
  const router = useRouter();
  const [simulation, setSimulation] = useState(false),
    [prerequisites, setPrerequisites] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Before supervised practice</h2>
      <p>
        Use a supervised training simulation. Checked steps record
        participation, not practical competence or repair quality.
      </p>
      <h3>Reviewed prerequisites</h3>
      {content.prerequisites.map((p, i) => (
        <article key={i}>
          <p>{p.text}</p>
          <Sources ids={p.evidence_ids} />
        </article>
      ))}
      <h3>Stop conditions</h3>
      {content.stop_conditions.map((p, i) => (
        <p key={i}>{p.text}</p>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={simulation}
          onChange={(e) => setSimulation(e.target.checked)}
        />
        I confirm this is a supervised training simulation.
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prerequisites}
          onChange={(e) => setPrerequisites(e.target.checked)}
        />
        I have checked these prerequisites with my trainer and this case
        applies.
      </label>
      <button
        disabled={!simulation || !prerequisites || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await send("/api/guides", {
              revision_id: revisionId,
              simulation_ack: simulation,
              prerequisites_ack: prerequisites,
            });
            router.push("/guides/" + r.id);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Start reviewed guide
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export type Guide = {
  id: string;
  state: string;
  step_position: number;
  outcome: string | null;
  content?: Content;
  version?: number;
};
export function GuideView({
  initial,
  lessons,
}: {
  initial: Guide;
  lessons: { id: string; title: string }[];
}) {
  const [g, setG] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const step = g.content?.steps[g.step_position];
  async function advance(action: string, outcome?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await send("/api/guides/" + g.id + "/advance", {
        expected_position: g.step_position,
        action,
        outcome,
      });
      const next = await apiFetch("/api/guides/" + g.id, { cache: "no-store" });
      setG(next.ok ? await next.json() : r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <span className="badge">
        {g.state} · Version {g.version}
      </span>
      {g.state === "invalidated" ? (
        <p className="notice error">
          This revision is no longer active. Stop this guide and ask your
          supervisor.
        </p>
      ) : (
        <>
          <h2>{g.content?.title}</h2>
          {g.state === "active" ? (
            step ? (
              <>
                <p className="muted">
                  Reviewed step {g.step_position + 1} of{" "}
                  {g.content?.steps.length}
                </p>
                <h3>{step.instruction}</h3>
                <p>{step.rationale}</p>
                {step.requires_authorized_person && (
                  <p className="notice">Requires the authorized trainer.</p>
                )}
                <Sources ids={step.evidence_ids} />
                <div className="actions">
                  <button
                    disabled={busy || g.step_position === 0}
                    className="secondary"
                    onClick={() => advance("back")}
                  >
                    Back
                  </button>
                  <button disabled={busy} onClick={() => advance("next")}>
                    Mark step completed
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Record the simulation outcome</h3>
                <div className="actions">
                  {[
                    ["completed_in_simulation", "Completed in simulation"],
                    ["not_resolved", "Not resolved"],
                    ["stopped_for_help", "Stopped for help"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      disabled={busy}
                      onClick={() => advance("finish", value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => advance("back")}
                >
                  Back
                </button>
              </>
            )
          ) : (
            <>
              <p>Recorded outcome: {g.outcome?.replaceAll("_", " ")}</p>
              {lessons.map((l) => (
                <p key={l.id}>
                  <Link href={"/learn/" + l.id}>Learn: {l.title} →</Link>
                </p>
              ))}
              {!lessons.length && (
                <p>No reviewed lesson is available for this revision yet.</p>
              )}
            </>
          )}
          {g.state === "active" && (
            <button
              className="secondary mt-6"
              disabled={busy}
              onClick={() => advance("stop")}
            >
              Stop and ask supervisor
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
type WorkerLesson = {
  id: string;
  version: number;
  content: Omit<Lesson, "questions"> & {
    questions: Omit<
      Lesson["questions"][number],
      "correct_index" | "explanation"
    >[];
  };
};
type Result = {
  id: string;
  correct_count: number;
  questions: Lesson["questions"];
};
export function Assessment({
  lesson,
  workerId,
}: {
  lesson: WorkerLesson;
  workerId: string;
}) {
  const [responses, setResponses] = useState<Record<string, number>>({}),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const attemptStorage = `alvis-assessment:${workerId}:${lesson.id}`;
  useEffect(() => {
    // Persist only the learner's selections and idempotency key, never answer keys or grading explanations.
    Promise.resolve().then(() => {
      try {
        const saved = sessionStorage.getItem(attemptStorage);
        if (saved) {
          const pending = JSON.parse(saved);
          if (
            typeof pending.submission_key === "string" &&
            pending.responses &&
            typeof pending.responses === "object"
          ) {
            setKey(pending.submission_key);
            setResponses(pending.responses);
          }
        }
      } catch {
        /* Server-side idempotency still protects retries within this session. */
      }
    });
  }, [attemptStorage]);
  return (
    <>
      <section className="panel">
        <h2>{lesson.content.title}</h2>
        <span className="badge">
          Reviewer-approved lesson · Version {lesson.version}
        </span>
        <p className="mt-4">{lesson.content.explanation}</p>
        <Sources ids={lesson.content.evidence_ids} />
      </section>
      {!result ? (
        <form
          className="panel mt-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              try {
                sessionStorage.setItem(
                  attemptStorage,
                  JSON.stringify({ submission_key: key, responses }),
                );
              } catch {
                /* Submission remains available when browser storage is restricted. */
              }
              setResult(
                await send("/api/lessons/" + lesson.id + "/attempts", {
                  responses,
                  submission_key: key,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {lesson.content.questions.map((q, i) => (
            <fieldset className="mb-6" key={q.id}>
              <legend>
                {i + 1}. {q.prompt}
              </legend>
              {q.options.map((o, index) => (
                <label className="check" key={index}>
                  <input
                    type="radio"
                    name={q.id}
                    value={index}
                    required
                    checked={responses[q.id] === index}
                    onChange={() =>
                      setResponses({ ...responses, [q.id]: index })
                    }
                  />
                  {o}
                </label>
              ))}
            </fieldset>
          ))}
          <button disabled={busy || Object.keys(responses).length !== 3}>
            Submit knowledge check
          </button>
        </form>
      ) : (
        <section className="panel mt-6">
          <h2>
            {result.correct_count === 3
              ? "Knowledge check passed"
              : "Needs another attempt"}{" "}
            · {result.correct_count} of 3
          </h2>
          <p>
            This records a knowledge check. It is not certification or
            demonstrated practical competence.
          </p>
          {result.questions.map((q) => (
            <article key={q.id}>
              <h3>{q.prompt}</h3>
              <p>Reviewed answer: {q.options[q.correct_index]}</p>
              <p>{q.explanation}</p>
              <Sources ids={q.evidence_ids} />
            </article>
          ))}
          <div className="actions">
            <button
              onClick={() => {
                setResult(null);
                setResponses({});
                setKey(crypto.randomUUID());
                try {
                  sessionStorage.removeItem(attemptStorage);
                } catch {
                  /* Optional browser recovery storage. */
                }
                setError("");
              }}
            >
              Retake as a new attempt
            </button>
            <Link href="/learning">View learning history →</Link>
          </div>
        </section>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function ReviewerLearning({
  revisionId,
  lesson,
}: {
  revisionId?: string;
  lesson?: { id: string; content: Lesson; content_hash: string; state: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [comment, setComment] = useState("");
  async function run(path: string, body: unknown) {
    setBusy(true);
    try {
      await send(path, body);
      setMessage("Saved. Refresh to see durable processing status.");
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      {revisionId && (
        <>
          <button
            disabled={busy}
            onClick={() =>
              run("/api/learning", {
                operation: "lesson_generate",
                entity: revisionId,
              })
            }
          >
            Draft a lesson from this revision
          </button>
          <label>
            Retirement comment
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !comment.trim()}
            className="secondary"
            onClick={() =>
              run("/api/learning", {
                operation: "retire",
                entity: revisionId,
                body: { comment },
              })
            }
          >
            Retire reviewed revision
          </button>
        </>
      )}
      {lesson && (
        <>
          <h2>{lesson.content.title}</h2>
          <span className="badge">
            {lesson.state} · Generated draft; inspect sources
          </span>
          <p>{lesson.content.explanation}</p>
          <Sources ids={lesson.content.evidence_ids} />
          {lesson.content.questions.map((q, i) => (
            <article key={q.id}>
              <h3>
                {i + 1}. {q.prompt}
              </h3>
              <ol>
                {q.options.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
              <p>
                Correct: {q.correct_index + 1}. {q.explanation}
              </p>
              <Sources ids={q.evidence_ids} />
            </article>
          ))}
          {lesson.state === "draft" && (
            <>
              <label>
                Review comment
                <textarea
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() =>
                    run("/api/lessons/" + lesson.id + "/review", {
                      decision: "approve",
                      expected_hash: lesson.content_hash,
                      comment,
                    })
                  }
                >
                  Approve lesson
                </button>
                <button
                  className="secondary"
                  disabled={busy || !comment.trim()}
                  onClick={() =>
                    run("/api/lessons/" + lesson.id + "/review", {
                      decision: "reject",
                      expected_hash: lesson.content_hash,
                      comment,
                    })
                  }
                >
                  Reject lesson
                </button>
              </div>
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function LearningRetry({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await send("/api/learning", {
              operation: "retry_learning",
              entity: id,
            });
            router.refresh();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Retry failed stage
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
