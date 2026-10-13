"use client";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function Invitation({
  signedIn,
  name,
  remembered,
  email,
}: {
  signedIn: boolean;
  name: string;
  remembered: boolean;
  email: string;
}) {
  const [ready, setReady] = useState(remembered);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    if (!token) return;
    history.replaceState(null, "", location.pathname);
    apiFetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "remember", token }),
    })
      .then(async (r) => {
        if (r.ok) setReady(true);
        else setMessage((await r.json()).message);
      })
      .catch(() =>
        setMessage(
          "Unable to retain invitation. Reopen the original link and try again.",
        ),
      );
  }, []);
  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const r = await apiFetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "accept", name: form.get("name") }),
      });
      const body = await r.json();
      if (r.ok) location.assign(body.next);
      else setMessage(body.message);
    } catch {
      setMessage("Invitation unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {message && (
        <p className="notice error" role="alert">
          {message}
        </p>
      )}
      {!ready ? (
        <p>
          Open the invitation link your administrator sent. You must verify the
          email address that received it.
        </p>
      ) : signedIn ? (
        <form onSubmit={accept}>
          <p>
            The organization and role come from your administrator’s invitation.
          </p>
          <p>Signed in as {email}. This must be the exact email address that received the invitation. To accept for someone else, use their account in another browser session.</p>
          <label htmlFor="name">Your full name</label>
          <input
            id="name"
            name="name"
            defaultValue={name}
            minLength={2}
            maxLength={100}
            required
          />
          <button className="mt-6" disabled={busy}>
            {busy ? "Accepting…" : "Accept invitation"}
          </button>
        </form>
      ) : (
        <>
          <p>
            Your invitation is ready. Sign in or create an account using the
            invited email, then return here after verification.
          </p>
          <div className="auth-links">
            <Link className="button" href="/login?next=/invite">
              Sign in to accept
            </Link>
            <Link href="/signup?next=/invite">Create an account</Link>
          </div>
        </>
      )}
      <div className="auth-links">
        <Link href="/onboarding">Your workspaces</Link>
        <Link href="/login?next=/invite">Use another account</Link>
      </div>
    </>
  );
}
