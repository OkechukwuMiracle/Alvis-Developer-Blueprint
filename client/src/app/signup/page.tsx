import Link from "next/link";
import { signup } from "../account-actions";
import { AuthCard } from "@/components/auth-card";
import { Submit } from "@/components/account-form";
import { safeNext } from "@/lib/content";
import { signupErrorMessages } from "@alvis/shared/signup-errors";
export const metadata = {
  title: "Create an account · Alvis",
  description:
    "Register, verify your email, and use Alvis personally, create a private organization, or accept an authorized invitation.",
};
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <AuthCard title={p.sent ? "Check your email" : "Create an account"}>
      {p.sent ? (
        <div className="notice" role="status">
          If registration is eligible, a verification link will arrive shortly.
          Open it to verify your email. Already registered? Sign in or request
          password recovery. Check spam and ask your administrator if delivery
          is unavailable.
        </div>
      ) : (
        <>
          <p>
            Use Alvis personally without an organization, create a private
            organization, or join one through an administrator’s invitation.
            Community roles do not grant access to existing organizations.
          </p>
          {p.error && (
            <p className="notice error" role="alert">
              {Object.hasOwn(signupErrorMessages, p.error) ? signupErrorMessages[p.error] : signupErrorMessages.unavailable}
            </p>
          )}
          <form action={signup}>
            <label htmlFor="account-kind">How would you like to start?</label>
            <select id="account-kind" name="account_kind"><option value="personal">Personal account</option><option value="organization">Create an organization</option></select>
            <label htmlFor="community-role">Personal community role</label>
            <select id="community-role" name="community_role"><option value="worker">Worker / Learner</option><option value="expert">Expert</option><option value="reviewer">Reviewer</option></select>
            <p>This applies only to personal accounts. It grants no organization permissions or verified professional credentials.</p>
            <input
              type="hidden"
              name="next"
              value={safeNext(p.next || "/home")}
            />
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <label htmlFor="confirmation">Confirm password</label>
            <input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <Submit>Create account</Submit>
          </form>
        </>
      )}
      <div className="auth-links">
        <Link href="/login">Sign in</Link>
        <Link href="/forgot-password">Recover password</Link>
      </div>
    </AuthCard>
  );
}
