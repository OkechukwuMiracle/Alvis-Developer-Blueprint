import { identity } from "@/lib/api-server";
import { signIn } from "@/app/actions";
import { safeNext } from "@/lib/content";
import Link from "next/link";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const { configured: ready } = await identity();
  return (
    <main className="login">
      <section className="login-art">
        <div className="brand">alvis.</div>
        <div className="eyebrow">From experience to understanding</div>
        <h1>
          Keep the judgment.
          <br />
          Share the knowledge.
        </h1>
        <p className="muted">
          Expert observations become reviewed, traceable knowledge for your
          team.
        </p>
        <div className="mt-10 border-t border-emerald-800 pt-6">
          01 Capture judgment
          <br />
          02 Review the evidence
          <br />
          03 Learn from approved knowledge
        </div>
        <p className="mt-6 text-sm">
          Supervised training recordings and labeled synthetic examples.
        </p>
      </section>
      <section>
        <div className="eyebrow">Your training workspace</div>
        <h1>Welcome back</h1>
        <p className="muted">
          Sign in with your verified account. Your role determines what you can
          contribute and review.
        </p>
        {!ready && (
          <div className="notice" role="status">
            <strong>Supabase setup required</strong>
            <p>
              Authentication is unavailable until the project URL and
              publishable key are configured in .env.local. Follow the
              application README.
            </p>
          </div>
        )}
        {p.error && (
          <p className="notice error" role="alert">
            {p.error === "membership"
              ? "Your account has no workspace membership. Contact the workspace administrator."
              : p.error === "link" ? "This authentication link is expired or unavailable. Request a fresh verification or recovery email."
              : "Unable to sign in. Check your credentials and verify your email before trying again."}
          </p>
        )}
        {p.reset && <p className="notice" role="status">Password reset. Sign in with your new password.</p>}
        <form action={signIn}>
          <input
            type="hidden"
            name="next"
            value={safeNext(p.next ?? "/home")}
          />
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={!ready}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!ready}
          />
          <button className="w-full mt-6" disabled={!ready}>
            Sign in
          </button>
        </form>
        <div className="auth-links"><Link href={"/signup?next="+encodeURIComponent(safeNext(p.next||"/home"))}>Create an account</Link><Link href="/forgot-password">Forgot password?</Link><Link href="/verify-email">Verify email</Link><Link href="/">About Alvis</Link></div>
      </section>
    </main>
  );
}
