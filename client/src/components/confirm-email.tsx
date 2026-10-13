"use client";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
export function ConfirmEmail() {
  const [credentials, setCredentials] = useState<{
    token_hash?: string;
    type?: string;
    code?: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const confirming = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
    const token_hash = p.get("token_hash");
    const type = p.get("type");
    const code = p.get("code");
    history.replaceState(null, "", location.pathname);
    Promise.resolve().then(() => {
      if (code) setCredentials({ code });
      else if (token_hash && type) setCredentials({ token_hash, type });
      else
        setMessage(
          "This link contains no verification information. Open the complete link from your email, or request a fresh verification email.",
        );
    });
  }, []);
  async function confirm() {
    if (confirming.current || !credentials) return;
    confirming.current = true;
    setBusy(true);
    try {
      const r = await apiFetch("/api/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const body = await r.json();
      if (!r.ok) {
        setMessage(typeof body.message === "string" ? body.message : "Verification is unavailable. Try again or sign in if your email is already confirmed.");
        setBusy(false);
        return;
      }
      location.assign(body.next);
    } catch {
      setMessage(
        "Unable to contact the verification service. Check that the API server is running and try again. This does not mean your email link has expired.",
      );
      setBusy(false);
    } finally {
      confirming.current = false;
    }
  }
  return (
    <>
      {message ? (
        <p className="notice error" role="alert">
          {message}
        </p>
      ) : (
        <>
          <p>Confirm to verify this email link. Links can be used once.</p>
          <button disabled={!credentials || busy} onClick={confirm}>
            {busy ? "Confirming…" : "Confirm email link"}
          </button>
        </>
      )}
      <div className="auth-links">
        <Link href="/login">Sign in</Link>
        <Link href="/forgot-password">Password recovery</Link>
        <Link href="/verify-email">Resend verification</Link>
      </div>
    </>
  );
}
