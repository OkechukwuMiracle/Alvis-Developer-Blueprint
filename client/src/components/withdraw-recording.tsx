"use client";
import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function WithdrawRecording({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const confirmation = new FormData(e.currentTarget).get("confirmation");
    setBusy(true);
    try {
      const r = await apiFetch(`/api/captures/${id}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await r.json();
      if (!r.ok) {
        setMessage(body.message);
        return;
      }
      setMessage(
        "Evidence withdrawn. Dependent revisions and guides are unavailable.",
      );
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Refresh to check withdrawal before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel mt-8">
      <summary>Withdraw this recording and its evidence</summary>
      <p>
        Withdrawal retires dependent knowledge and invalidates guides. Earlier
        private download links expire within five minutes. Files remain in
        private retention storage; withdrawal does not erase audit history.
      </p>
      <p>
        Type the exact title to confirm: <strong>{title}</strong>
      </p>
      <form onSubmit={submit}>
        <label htmlFor="withdraw-confirmation">Recording title</label>
        <input id="withdraw-confirmation" name="confirmation" required />
        <button className="secondary mt-4" disabled={busy}>
          {busy ? "Withdrawing…" : "Withdraw evidence"}
        </button>
      </form>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
