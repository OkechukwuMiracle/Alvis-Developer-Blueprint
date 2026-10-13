"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { ContentView } from "./content-view";
import type { Content } from "@alvis/shared/content";
import { evidenceIds } from "@alvis/shared/content";
export function CommunityShare({ revisionId, hash, content, sources }: { revisionId: string; hash: string; content: Content; sources: { id: string; text_content: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [excerpts, setExcerpts] = useState<Record<string, string>>({});
  const required = evidenceIds(content);
  return <form className="card" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    const form = new FormData(e.currentTarget); setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "submit", revision_id: revisionId, expected_hash: hash, topic: form.get("topic"), equipment: form.get("equipment"), selections: required.map(id => ({ id, excerpt: excerpts[id] || "" })), share_ack: form.get("share") === "on", evidence_ack: form.get("reviewer") === "on" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message);
      router.push("/community/home"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Submission unavailable."); setBusy(false); }
  }}><h2>Request community publication</h2><p>Save your edits first. Only the saved version below and the excerpts you explicitly select will become public after independent review and indexing. Your recording remains private.</p>
    <label htmlFor="share-topic">Topic</label><input id="share-topic" name="topic" required minLength={2} maxLength={100} />
    <label htmlFor="share-equipment">Equipment category / subject</label><input id="share-equipment" name="equipment" required minLength={2} maxLength={100} />
    <details><summary>Preview the saved content to be shared</summary><ContentView content={content} sourceBase="#preview-source-" /></details>
    {required.map(id => <section key={id} id={"preview-source-" + id}><label htmlFor={"excerpt-" + id}>Select the supporting excerpt for source {id}</label><details><summary>Inspect private original text</summary><p className="whitespace-pre-wrap">{sources.find(s => s.id === id)?.text_content || "No text available. Public sharing is blocked."}</p></details><textarea id={"excerpt-" + id} required maxLength={4000} value={excerpts[id] || ""} onChange={e => setExcerpts({ ...excerpts, [id]: e.target.value })} placeholder="Copy an exact supporting excerpt from this source" /><p className="whitespace-pre-wrap">Public excerpt preview: {excerpts[id] || "Nothing selected"}</p></section>)}
    <label><input type="checkbox" name="share" required />I explicitly request public sharing of this saved content and selected excerpts, and confirm that I am authorized to share them.</label>
    <label><input type="checkbox" name="reviewer" required />I acknowledge that assigned community reviewers can inspect the submitted supporting excerpts.</label>
    {error && <p className="notice error" role="alert">{error}</p>}<button disabled={busy}>{busy ? "Submitting…" : "Submit public preview for community review"}</button>
  </form>;
}
