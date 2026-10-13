"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { ContentView } from "./content-view";
import type { Content } from "@alvis/shared/content";
import type { Answer, Lesson } from "@alvis/shared/learning";

type Excerpt = { id: string; text_content: string; locator: string; start_ms?: number | null; end_ms?: number | null; synthetic?: boolean };
type Publication = { id: string; revision_id: string; author_id: string; contributor?: string; topic: string; equipment: string; content: Content; content_hash: string; excerpts: Excerpt[]; version?: number; state?: string; assigned_reviewer?: string | null; reviewed_at?: string };
type ReviewLesson = { id: string; content: Lesson; content_hash: string };
type Guide = { id: string; state: string; position: number; content?: Content };
type History = { id: string; title: string; revision_id: string; date: string; correct_count: number };
type Feedback = { publication_id: string; reviewer_id: string; decision: string; reason: string; created_at: string };
type Profile = { display_name: string; role: string; bio: string };
type AskResult = { answer: Answer; latency_ms: number; sources: Publication[] };
async function request<T>(operation: string, fields: object = {}): Promise<T> {
  const response = await apiFetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...fields }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Community service unavailable.");
  return body;
}
async function publicGet<T>(query: string): Promise<T> {
  const response = await apiFetch("/api/community" + query);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Public library unavailable.");
  return body;
}
function Sources({ excerpts }: { excerpts: Excerpt[] }) {
  return <section><h2>Explicitly shared source excerpts</h2>{excerpts.map(s => <details className="card" key={s.id} id={"source-" + s.id}><summary>{s.locator}{s.synthetic ? " · Synthetic example" : ""}{s.start_ms != null ? ` · ${Math.floor(s.start_ms / 1000)}s–${Math.floor((s.end_ms || s.start_ms) / 1000)}s` : ""}</summary><p className="whitespace-pre-wrap">{s.text_content}</p><p className="muted">Text excerpt from private evidence. The raw recording is not public.</p></details>)}</section>;
}
export function Community({ screen, id, role, userId }: { screen: string; id?: string; role?: string; userId?: string }) {
  const router = useRouter();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lessons, setLessons] = useState<{ id: string; title: string; publication_id: string }[]>([]);
  const [reviewLessons, setReviewLessons] = useState<ReviewLesson[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [lesson, setLesson] = useState<{ id: string; content: Omit<Lesson, "questions"> & { questions: Omit<Lesson["questions"][number], "correct_index" | "explanation">[] } } | null>(null);
  const [assessment, setAssessment] = useState<{ correct_count: number; questions: Lesson["questions"] } | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const submissionKey = useRef("");
  const load = useCallback(async () => {
    if (screen === "library") setPublications(await publicGet<Publication[]>(""));
    else if (screen === "publication") setPublications(await publicGet<Publication[]>("?id=" + encodeURIComponent(id || "")));
    else if (screen === "profile") {
      const [p, items] = await Promise.all([publicGet<Profile>("?profile=" + encodeURIComponent(id || "")), publicGet<Publication[]>("?contributor=" + encodeURIComponent(id || ""))]);
      setProfile(p); setPublications(items);
    } else if (screen === "home") {
      const result = await request<{ mine: Publication[]; feedback: Feedback[] }>("dashboard"); setPublications(result.mine); setFeedback(result.feedback);
    } else if (screen === "review") setPublications(await request<Publication[]>("queue"));
    else if (screen === "lesson-review") setReviewLessons(await request<ReviewLesson[]>("lesson_queue"));
    else if (screen === "learning") {
      const [l, h] = await Promise.all([request<typeof lessons>("lessons"), request<History[]>("history")]); setLessons(l); setHistory(h);
    } else if (screen === "guide") setGuide(await request<Guide>("guide_get", { id }));
    else if (screen === "lesson") setLesson(await request<typeof lesson>("lesson_get", { id }));
  }, [screen, id]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(load).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Request unavailable."); } finally { setBusy(false); }
  }
  const title: Record<string, string> = { library: "Community knowledge", publication: "Community-reviewed experience", profile: "Contributor profile", home: "Your personal workspace", ask: "Ask Alvis · Community", review: "Community review queue", "lesson-review": "Community lesson review", learning: "Community learning and history", guide: "Supervised training guide", lesson: "Knowledge check" };
  return <div className="stack"><h1>{title[screen]}</h1><p className="notice">Community reviewed is peer review, not professional certification, organization approval or guaranteed correctness. Use approved procedures and supervision for practical work.</p>
    {loading && <p role="status">Loading…</p>}{error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {screen === "home" && <><p>Your community role: {role}. All personal roles can discover, ask and learn.</p><div className="actions"><Link href="/community/library">Discover</Link><Link href="/community/ask">Ask</Link><Link href="/community/learning">Learn</Link>{role === "expert" && <><Link href="/captures/new">Record knowledge</Link><Link href="/drafts">Private drafts</Link></>}{role === "reviewer" && <><Link href="/community/review">Review contributions</Link><Link href="/community/lesson-review">Review lessons</Link></>}</div>
      <h2>Your contributions</h2>{publications.map(p => <article className="card" key={p.id}><h3>{p.content.title}</h3><p>{p.state} · {p.topic} · {p.equipment}</p><Link href={"/drafts/" + p.revision_id}>Inspect private draft / version</Link><div className="actions"><button disabled={busy} onClick={() => act(async () => { await request("withdraw", { id: p.id }); await load(); setNotice("Contribution withdrawn from public retrieval and affected guides invalidated."); })}>Withdraw</button>{p.state === "approved" && <><Link href={"/community/publication/" + p.id}>Public version</Link><button disabled={busy} onClick={() => act(async () => { await request("lesson_generate", { id: p.id }); setNotice("Lesson generation queued. A different community reviewer must approve it before learners can use it."); })}>Draft a lesson</button></>}</div></article>)}
      <h2>Review feedback and history</h2>{feedback.map((f, i) => <article className="card" key={i}><p>{f.decision} · {new Date(f.created_at).toLocaleString()}</p><p>{f.reason}</p><p className="muted">Reviewer {f.reviewer_id}</p></article>)}
    </>}
    {screen === "library" && <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); act(async () => { const p = new URLSearchParams(); for (const key of ["q", "topic", "equipment", "contributor"]) { const value = String(form.get(key) || "").trim(); if (value) p.set(key, value); } setPublications(await publicGet("?" + p)); }); }}><label htmlFor="public-search">Search reviewed knowledge</label><input id="public-search" name="q" maxLength={1000} /><label htmlFor="topic-filter">Topic</label><input id="topic-filter" name="topic" maxLength={100} /><label htmlFor="equipment-filter">Equipment category</label><input id="equipment-filter" name="equipment" maxLength={100} /><label htmlFor="contributor-filter">Contributor</label><select id="contributor-filter" name="contributor"><option value="">Any contributor</option>{[...new Map(publications.map(p => [p.author_id, p.contributor || "Contributor"])).entries()].map(([author, name]) => <option key={author} value={author}>{name}</option>)}</select><button disabled={busy}>Search</button></form>}
    {profile && <section className="card"><h2>{profile.display_name}</h2><p>{profile.role} · self-selected community role, credentials not verified</p><p>{profile.bio || "No biography provided."}</p></section>}
    {["library", "profile"].includes(screen) && publications.map(p => <article className="card" key={p.id}><h2><Link href={"/community/publication/" + p.id}>{p.content.title}</Link></h2><p>{p.topic} · {p.equipment} · Community reviewed · Version {p.version}</p>{p.excerpts?.some(s => s.synthetic) && <p className="notice">Synthetic training example</p>}<Link href={"/community/profile/" + p.author_id}>{p.contributor || "Contributor"}</Link></article>)}
    {screen === "publication" && publications.map(p => <article key={p.id}><h2>{p.content.title}</h2><p>{p.topic} · {p.equipment} · Version {p.version} · Reviewed {p.reviewed_at && new Date(p.reviewed_at).toLocaleDateString()}</p><Link href={"/community/profile/" + p.author_id}>{p.contributor}</Link><ContentView content={p.content} sourceBase="#source-" /><Sources excerpts={p.excerpts} /><form className="card" onSubmit={e => { e.preventDefault(); act(async () => { const result = await request<Guide>("guide_start", { id: p.id, body: { request_id: submissionKey.current ||= crypto.randomUUID(), simulation_ack: true, prerequisites_ack: true } }); router.push("/community/guide/" + result.id); }); }}><h2>Start supervised practice</h2><label><input type="checkbox" required />I am using a supervised training simulation.</label><label><input type="checkbox" required />I have checked the reviewed prerequisites and stop conditions above.</label><button disabled={busy}>Start guide (sign in required)</button></form></article>)}
    {screen === "review" && publications.map(p => <article className="card" key={p.id}><h2>{p.content.title}</h2><p>Public preview only. Raw recordings stay private. Author: {p.author_id}</p>{p.assigned_reviewer === userId && <><ContentView content={p.content} sourceBase="#source-" /><Sources excerpts={p.excerpts} /></>}{p.assigned_reviewer !== userId ? <button disabled={busy} onClick={() => act(async () => { await request("review", { id: p.id, decision: "claim" }); await load(); })}>Claim review</button> : <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value"); act(async () => { await request("review", { id: p.id, decision, expected_hash: p.content_hash, reason: form.get("reason") }); await load(); setNotice("Community review recorded. Approved content becomes discoverable only when indexing completes."); }); }}><label htmlFor={"reason-" + p.id}>Review reason</label><textarea id={"reason-" + p.id} name="reason" required maxLength={2000} /><label><input type="checkbox" required />I checked claims, evidence, exceptions and the training boundary.</label><div className="actions"><button disabled={busy} value="approve">Approve</button><button disabled={busy} value="request_changes">Request changes</button><button disabled={busy} value="reject">Reject</button></div></form>}</article>)}
    {screen === "ask" && <><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); act(async () => setAnswer(await request<AskResult>("ask", { query: form.get("query"), equipment: String(form.get("equipment") || "").trim() || null }))); }}><label htmlFor="ask-equipment">Equipment category / context</label><input id="ask-equipment" name="equipment" maxLength={100} /><label htmlFor="question">Describe the problem</label><textarea id="question" name="query" required minLength={3} maxLength={1000} /><button disabled={busy}>{busy ? "Checking reviewed sources…" : "Ask Alvis"}</button></form>{answer && <section className="card"><h2>Generated explanation · {answer.answer.mode}</h2><p>{answer.answer.summary}</p>{answer.answer.clarifying_question && <p>{answer.answer.clarifying_question}</p>}{answer.answer.escalation_reason && <p>{answer.answer.escalation_reason}</p>}{answer.answer.claims.map((c, i) => <p key={i}>{c.text} {answer.sources.filter(p => p.revision_id === c.revision_id).map(p => <Link key={p.id} href={"/community/publication/" + p.id}>Inspect reviewed evidence</Link>)}</p>)}<p className="muted">Generated text is distinct from community-reviewed sources. Observed response time: {answer.latency_ms} ms.</p></section>}</>}
    {guide && <section className="card"><p>State: {guide.state} · Progress {guide.position}/{guide.content?.steps.length || 0}</p>{guide.state === "invalidated" ? <p>This reviewed revision was withdrawn or replaced. Stop this guide.</p> : guide.content && <><h2>{guide.content.title}</h2>{guide.content.steps[guide.position] ? <><h3>{guide.content.steps[guide.position].instruction}</h3><p>{guide.content.steps[guide.position].rationale}</p></> : <p>All reviewed steps inspected. Record your training outcome.</p>}{guide.state === "active" && <div className="actions">{guide.position < guide.content.steps.length ? <button disabled={busy} onClick={() => act(async () => setGuide(await request("guide_advance", { id: guide.id, body: { expected_position: guide.position, action: "next" } })))}>Next reviewed step</button> : ["completed_in_simulation", "not_resolved"].map(outcome => <button disabled={busy} key={outcome} onClick={() => act(async () => setGuide(await request("guide_advance", { id: guide.id, body: { expected_position: guide.position, action: "finish", outcome } })))}>{outcome === "not_resolved" ? "Unresolved outcome" : "Finish simulation"}</button>)}<button disabled={busy} onClick={() => act(async () => setGuide(await request("guide_advance", { id: guide.id, body: { expected_position: guide.position, action: "stop" } })))}>Stop for help</button></div>}</>}</section>}
    {screen === "learning" && <><h2>Reviewed lessons</h2>{lessons.map(l => <Link className="card" key={l.id} href={"/community/lesson/" + l.id}>{l.title}</Link>)}<h2>Your personal assessment history</h2>{history.map(h => <article className="card" key={h.id}><h3>{h.title}</h3><p>Revision {h.revision_id} · {new Date(h.date).toLocaleString()} · {h.correct_count}/3</p><p>{h.correct_count === 3 ? "Knowledge check passed" : "Review the explanations and try again"}</p></article>)}</>}
    {screen === "lesson-review" && reviewLessons.map(l => <form className="card" key={l.id} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value"); act(async () => { await request("lesson_review", { id: l.id, body: { decision, reason: form.get("reason"), expected_hash: l.content_hash } }); await load(); }); }}><h2>{l.content.title}</h2><p>{l.content.explanation}</p>{l.content.questions.map(q => <section key={q.id}><h3>{q.prompt}</h3><ol>{q.options.map((option, i) => <li key={i}>{option}{i === q.correct_index ? " · Correct answer" : ""}</li>)}</ol><p>{q.explanation}</p></section>)}<label htmlFor={"lesson-reason-" + l.id}>Review reason</label><textarea name="reason" id={"lesson-reason-" + l.id} maxLength={2000} required /><div className="actions"><button disabled={busy} value="approve">Approve lesson</button><button disabled={busy} value="reject">Reject lesson</button></div></form>)}
    {lesson && <section className="card"><h2>{lesson.content.title}</h2><p>{lesson.content.explanation}</p>{!assessment ? <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const responses = Object.fromEntries(lesson.content.questions.map(q => [q.id, Number(form.get(q.id))])); act(async () => setAssessment(await request("attempt", { id: lesson.id, body: { responses, submission_key: submissionKey.current ||= crypto.randomUUID() } }))); }}>{lesson.content.questions.map(q => <fieldset key={q.id}><legend>{q.prompt}</legend>{q.options.map((option, i) => <label key={i}><input required type="radio" name={q.id} value={i} />{option}</label>)}</fieldset>)}<button disabled={busy}>Submit knowledge check</button></form> : <><h3>{assessment.correct_count === 3 ? "Knowledge check passed" : "Review and retry"} · {assessment.correct_count}/3</h3>{assessment.questions.map(q => <p key={q.id}>{q.prompt}: {q.options[q.correct_index]} — {q.explanation}</p>)}<p>This result is not certification or proof of practical competence.</p><button onClick={() => { submissionKey.current = ""; setAssessment(null); }}>Retake as a new assessment</button><Link href="/community/learning">Learning history</Link></>}</section>}
    {!loading && !error && ["home", "library", "publication", "profile", "review"].includes(screen) && !publications.length && <p className="card">No contributions available in this view. Private drafts are never shown in public discovery; approved contributions must finish indexing first.</p>}
    {!loading && !error && screen === "learning" && !lessons.length && <p>No reviewed community lessons yet.</p>}
    {!loading && !error && screen === "lesson-review" && !reviewLessons.length && <p>No lessons waiting for your review.</p>}
  </div>;
}
