"use client";
import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
type Member = { user_id: string; role: string; display_name: string };
export function Settings({
  invitations,
  members,
  self,
  now,
}: {
  invitations: Invite[];
  members: Member[];
  self: string;
  now: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function command(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setLink("");
    try {
      const r = await apiFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setMessage(data.message);
        return;
      }
      setMessage(
        data.delivery === "sent"
          ? "Invitation handed to the configured SMTP server. Check delivery with the recipient."
          : data.delivery === "manual"
            ? "Email delivery is not configured. Share this private invitation link with the intended recipient."
            : data.delivery === "failed"
              ? "Email delivery failed. Share this link securely or retry using Resend."
              : data.message || "Workspace updated.",
      );
      if (data.url) setLink(data.url);
      setRequestId(crypto.randomUUID());
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Refresh to check the saved state before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: React.FormEvent<HTMLFormElement>, operation: string) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    void command({ ...fields, operation, request_id: requestId });
  }
  return (
    <>
      <p>
        Administrator membership does not grant reviewer publication rights.
        Asset creation currently supports training simulations.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {link && (
        <div className="notice">
          <label htmlFor="private-link">
            Private invitation link · shown only for this request
          </label>
          <input
            id="private-link"
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <p>
            Do not post this link publicly. Only its intended verified email can
            accept it.
          </p>
        </div>
      )}
      <div className="settings-grid">
        <section className="panel">
          <h2>Invite a member</h2>
          <form onSubmit={(e) => submit(e, "invite")}>
            <label htmlFor="email">Invited email</label>
            <input id="email" name="email" type="email" required />
            <label htmlFor="role">Invited role</label>
            <select id="role" name="role">
              <option value="worker">Worker</option>
              <option value="expert">Expert</option>
              <option value="reviewer">Reviewer</option>
            </select>
            <button className="mt-6" disabled={busy}>
              Create invitation
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Add a training asset</h2>
          <form onSubmit={(e) => submit(e, "asset")}>
            <label htmlFor="code">Asset code</label>
            <input id="code" name="code" maxLength={40} required />
            <label htmlFor="asset-name">Asset name</label>
            <input
              id="asset-name"
              name="name"
              minLength={2}
              maxLength={100}
              required
            />
            <button className="mt-6" disabled={busy}>
              Add asset
            </button>
          </form>
        </section>
      </div>
      <section className="panel mt-6">
        <h2>Invitations</h2>
        {!invitations.length && <p>No invitations yet.</p>}
        {invitations.map((i) => (
          <article key={i.id} className="mt-4">
            <strong>{i.email}</strong> · {i.role}
            <p>
              {i.accepted_at
                ? "Accepted"
                : i.revoked_at
                  ? "Revoked"
                  : Date.parse(i.expires_at) < now
                    ? "Expired"
                    : "Pending"}{" "}
              · expires {new Date(i.expires_at).toLocaleDateString()}
            </p>
            {!i.accepted_at && !i.revoked_at && (
              <div className="public-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => command({ operation: "resend", id: i.id })}
                >
                  Resend
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Revoke this invitation?"))
                      void command({ operation: "revoke", id: i.id });
                  }}
                >
                  Revoke
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="panel mt-6">
        <h2>Members</h2>
        {members.map((m) => (
          <article className="mt-4" key={m.user_id}>
            <strong>{m.display_name}</strong> · {m.role}
            {m.user_id !== self && (
              <form onSubmit={(e) => submit(e, "role")}>
                <input type="hidden" name="user_id" value={m.user_id} />
                <label htmlFor={"member-" + m.user_id}>
                  Role for {m.display_name}
                </label>
                <select
                  id={"member-" + m.user_id}
                  name="role"
                  defaultValue={m.role}
                >
                  {["worker", "expert", "reviewer", "admin"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <div className="public-actions">
                  <button disabled={busy}>Save role</button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Remove this member’s access? Their historical records will be preserved.",
                        )
                      )
                        void command({
                          operation: "remove",
                          user_id: m.user_id,
                        });
                    }}
                  >
                    Remove access
                  </button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
