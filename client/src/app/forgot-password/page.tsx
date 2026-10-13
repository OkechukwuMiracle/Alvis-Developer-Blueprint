import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { Submit } from "@/components/account-form";
import { forgotPassword } from "../account-actions";
export const metadata = { title: "Recover your password · Alvis" };
export default async function Forgot({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <AuthCard title="Recover your password">
      {p.sent ? (
        <p className="notice" role="status">
          If an account exists for that address, you’ll receive a recovery
          email. Check spam. Links expire and can be used once.
        </p>
      ) : (
        <>
          {p.error && (
            <p className="notice error" role="alert">
              Recovery is unavailable or the email is invalid. Please try again
              later.
            </p>
          )}
          <form action={forgotPassword}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <Submit>Send recovery email</Submit>
          </form>
        </>
      )}
      <div className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </AuthCard>
  );
}
