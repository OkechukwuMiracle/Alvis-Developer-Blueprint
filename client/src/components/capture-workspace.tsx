"use client";
import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { copyDraft } from "@/app/actions";
import type { Content } from "@/lib/content";
import { PrivatePlayer } from "./private-player";
import { MediaInput, post, checksum, sendUpload } from "./media-input";
import { ContentView } from "./content-view";
type Source = {
  id: string;
  kind: string;
  text_content: string | null;
  start_ms: number | null;
  end_ms: number | null;
  evidence_version: number;
};
type Question = {
  id: string;
  sequence: number;
  target_field: string;
  question: string;
  gap: string;
  source_ids: string[];
  answer_source_id: string | null;
  answer_text: string | null;
  cannot_confirm: boolean;
};
type Snapshot = {
  capture: {
    id: string;
    title: string;
    task: string;
    state: string;
    duration_seconds: number | null;
    generation: number;
    accepted_generation: number;
    transcript_version: number;
  };
  sources: Source[];
  questions: Question[];
  jobs: {
    id: string;
    stage: string;
    status: string;
    attempts: number;
    error_code: string | null;
  }[];
  revision: {
    id: string;
    unit_id: string;
    status: string;
    content: Content;
    content_hash: string;
  } | null;
  proposals: { id: string; content: Content; base_hash: string }[];
  mediaUrl: string | null;
  editable: boolean;
};
export function CaptureWorkspace({
  id,
  debrief = false,
}: {
  id: string;
  debrief?: boolean;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [audio, setAudio] = useState<File | null>(null),
    [replacement, setReplacement] = useState<File | null>(null);
  const mediaLoaded = useRef(false);
  const load = useCallback(
    async (refreshMedia = false) => {
      const response = await apiFetch(
        "/api/captures/" +
          id +
          (refreshMedia || !mediaLoaded.current ? "?media=1" : ""),
        { cache: "no-store" },
      );
      const body = await response.json();
      if (response.ok) {
        if (body.mediaUrl) mediaLoaded.current = true;
        setData((previous) => ({
          ...body,
          mediaUrl: body.mediaUrl ?? previous?.mediaUrl ?? null,
        }));
      } else setError(body.message);
    },
    [id],
  );
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        load().catch(() => {
          if (active)
            setError("Connection interrupted. Refresh to resume saved state.");
        });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);
  async function change(operation: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await post("/api/captures/" + id + "/" + operation, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Change failed.");
    } finally {
      setBusy(false);
    }
  }
  async function answer(e: React.FormEvent<HTMLFormElement>, q: Question) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!audio)
      return change("debrief", {
        question_id: q.id,
        answer: form.get("answer"),
        cannot_confirm: false,
      });
    setBusy(true);
    setError("");
    try {
      const upload = await post("/api/captures/" + id + "/upload", {
        kind: "audio",
        question_id: q.id,
        mime: audio.type.split(";")[0],
        bytes: audio.size,
      });
      await sendUpload(upload.url, audio);
      await post(
        "/api/captures/" + id + "/complete",
        { upload_id: upload.upload_id, checksum: await checksum(audio) },
        crypto.randomUUID(),
      );
      setAudio(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio answer failed.");
    } finally {
      setBusy(false);
    }
  }
  async function replace() {
    if (!replacement) return;
    setBusy(true);
    setError("");
    try {
      const upload = await post("/api/captures/" + id + "/upload", {
        mime: replacement.type.split(";")[0],
        bytes: replacement.size,
      });
      await sendUpload(upload.url, replacement);
      await post(
        "/api/captures/" + id + "/complete",
        { upload_id: upload.upload_id, checksum: await checksum(replacement) },
        crypto.randomUUID(),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replacement failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <p role={error ? "alert" : "status"}>
        {error || "Loading saved capture state…"}
      </p>
    );
  const { capture, revision } = data,
    segments = data.sources.filter(
      (s) =>
        s.kind === "transcript" &&
        s.evidence_version === capture.transcript_version,
    );
  const question = data.questions.find((q) => !q.answer_source_id),
    processing = data.jobs.some((j) =>
      ["queued", "running"].includes(j.status),
    ),
    editable = data.editable && (!revision || revision.status === "draft");
  const proposal = data.proposals[0];
  return (
    <div className="stack">
      <Link href="/home">← Home</Link>
      <div className="eyebrow">Unverified expert capture</div>
      <h1>{capture.title}</h1>
      <p>{capture.task}</p>
      <span className="badge">
        {capture.state} · Evidence generation {capture.generation}
      </span>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="split">
        <section className="stack">
          <PrivatePlayer
            url={data.mediaUrl}
            segments={segments}
            highlight={question?.source_ids ?? []}
          />
          <button
            className="secondary"
            disabled={busy}
            onClick={() => load(true)}
          >
            Refresh private media URL and status
          </button>
          {segments.length > 0 && (
            <details className="card">
              <summary>
                Transcript version {capture.transcript_version} · corrections
                preserve earlier evidence
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  change("transcript", {
                    expected_version: capture.transcript_version,
                    segments: segments.map((s) => ({
                      id: s.id,
                      text: form.get(s.id),
                    })),
                  });
                }}
                key={capture.transcript_version}
              >
                {segments.map((s) => (
                  <div key={s.id}>
                    <label htmlFor={s.id}>
                      {((s.start_ms ?? 0) / 1000).toFixed(1)}–
                      {((s.end_ms ?? 0) / 1000).toFixed(1)} seconds
                    </label>
                    <textarea
                      id={s.id}
                      name={s.id}
                      defaultValue={s.text_content ?? ""}
                      maxLength={10000}
                      disabled={!editable || processing || busy}
                    />
                  </div>
                ))}
                <button disabled={!editable || busy || processing}>
                  Save corrected transcript and extract again
                </button>
              </form>
            </details>
          )}
          <details className="card">
            <summary>
              Evidence history ({data.sources.length} source records)
            </summary>
            {data.sources.map((s) => (
              <p key={s.id}>
                <Link href={"/sources/" + s.id}>
                  {s.kind} · {s.id.slice(0, 8)}
                </Link>{" "}
                · {s.text_content}
              </p>
            ))}
          </details>
        </section>
        <section className="stack">
          <div className="card">
            <h2>Processing</h2>
            <p className="muted">
              Upload → Prepare media → Transcribe → Extract → Debrief ready
            </p>
            {data.jobs.map((j) => (
              <div key={j.id} className="source">
                <strong>{j.stage}</strong> · {j.status} · attempt {j.attempts}/3
                {j.error_code && (
                  <p>
                    {j.error_code.replaceAll("_", " ")} · Check worker
                    configuration or replace invalid media.
                  </p>
                )}
                {editable &&
                  j.status === "failed" &&
                  j.attempts < 3 &&
                  [
                    "TRANSIENT",
                    "WORKER_INTERRUPTED",
                    "PROVIDER_CONFIGURATION",
                    "STORAGE_UNAVAILABLE",
                    "DATABASE_FAILURE",
                    "USAGE_RECORD_FAILED",
                    "FFMPEG_UNAVAILABLE",
                    "MEDIA_TIMEOUT",
                    "INVALID_MODEL_OUTPUT",
                  ].includes(j.error_code ?? "") && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => change("retry", { job_id: j.id })}
                    >
                      Retry stage
                    </button>
                  )}
              </div>
            ))}
            {!data.jobs.length && (
              <p>
                Upload not completed. Select the same recording below to finish.
              </p>
            )}
          </div>
          {editable &&
            (capture.state === "uploading" ||
              (capture.state === "failed" &&
                capture.transcript_version === 0)) && (
              <div className="card">
                <h2>Replace or finish recording</h2>
                <MediaInput onFile={setReplacement} />
                <button disabled={!replacement || busy} onClick={replace}>
                  Upload replacement
                </button>
              </div>
            )}
          {revision && (
            <>
              <Link
                className="card"
                href={
                  "/knowledge/" +
                  revision.unit_id +
                  "/revisions/" +
                  revision.id +
                  "/edit"
                }
              >
                Open structured draft editor →
              </Link>
              {!debrief && (
                <Link className="card" href={"/captures/" + id + "/debrief"}>
                  Continue to expert debrief →
                </Link>
              )}
            </>
          )}
          {debrief && (
            <div className="card">
              <h2>Expert debrief</h2>
              <p>
                {data.questions.filter((q) => q.answer_source_id).length} of{" "}
                {data.questions.length} answered · five questions maximum
              </p>
              {question && editable ? (
                <form key={question.id} onSubmit={(e) => answer(e, question)}>
                  <h3>{question.question}</h3>
                  <p className="muted">{question.gap}</p>
                  {question.source_ids.map((sid) => (
                    <Link
                      className="source-link"
                      key={sid}
                      href={"/sources/" + sid}
                    >
                      Referenced source {sid.slice(0, 8)} ↗
                    </Link>
                  ))}
                  <label htmlFor="debrief-answer">Your answer</label>
                  <textarea
                    id="debrief-answer"
                    name="answer"
                    maxLength={10000}
                    disabled={busy || processing}
                  />
                  <MediaInput audio onFile={setAudio} />
                  {audio && (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setAudio(null)}
                    >
                      Use text answer instead
                    </button>
                  )}
                  <div className="actions">
                    <button disabled={busy || processing}>Save and next</button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy || processing}
                      onClick={() =>
                        change("debrief", {
                          question_id: question.id,
                          answer: null,
                          cannot_confirm: true,
                        })
                      }
                    >
                      I cannot confirm
                    </button>
                  </div>
                </form>
              ) : (
                <p>
                  {processing
                    ? "Preparing questions or processing your answer…"
                    : "Saved answers remain evidence. Review the proposed draft; unconfirmed judgment remains a gap."}
                </p>
              )}
              {data.questions
                .filter((q) => q.answer_source_id)
                .map((q) => (
                  <details key={q.id}>
                    <summary>{q.question}</summary>
                    <p>{q.cannot_confirm ? "Cannot confirm" : q.answer_text}</p>
                  </details>
                ))}
            </div>
          )}
          {revision &&
            data.editable &&
            revision.status !== "draft" &&
            revision.status !== "pending" && (
              <form action={copyDraft}>
                <input type="hidden" name="unit_id" value={revision.unit_id} />
                <button>Create correction draft version</button>
              </form>
            )}
          {revision && editable && (
            <button
              disabled={busy || processing}
              onClick={() =>
                change("regenerate", { expected_hash: revision.content_hash })
              }
            >
              Generate proposal from current sources
            </button>
          )}
          {proposal && revision && (
            <div className="card">
              <h2>Proposed changes</h2>
              <p>
                Changed fields:{" "}
                {Object.keys(proposal.content)
                  .filter(
                    (key) =>
                      JSON.stringify(proposal.content[key as keyof Content]) !==
                      JSON.stringify(revision.content[key as keyof Content]),
                  )
                  .join(", ") || "No content changes"}
              </p>
              <p className="notice">
                Expert edits remain saved until you accept this proposal. A
                stale saved draft requires regeneration.
              </p>
              <details>
                <summary>Current saved draft</summary>
                <ContentView content={revision.content} />
              </details>
              <details open>
                <summary>Generated proposal · unverified</summary>
                <ContentView content={proposal.content} />
              </details>
              <div className="actions">
                <button
                  disabled={!editable || busy || processing}
                  onClick={() =>
                    change("accept", {
                      proposal_id: proposal.id,
                      expected_hash: revision.content_hash,
                    })
                  }
                >
                  Accept proposed changes
                </button>
                <button
                  className="secondary"
                  disabled={!editable || busy}
                  onClick={() =>
                    change("dismiss", {
                      proposal_id: proposal.id,
                      expected_hash: revision.content_hash,
                    })
                  }
                >
                  Keep saved expert draft
                </button>
              </div>
            </div>
          )}
          {capture.accepted_generation !== capture.generation && (
            <p className="notice">
              Current evidence has changed. Generate, compare and accept an
              updated proposal before submitting for review.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
