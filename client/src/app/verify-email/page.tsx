import { AuthCard } from "@/components/auth-card";
import { Submit } from "@/components/account-form";
import { resendVerification } from "../account-actions";
export const metadata = { title: "Verify your email · Alvis" };
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <AuthCard title="Verify your email">
      {p.sent ? (
        <p className="notice" role="status">
          If this address has a pending eligible registration, a fresh
          verification email will arrive. Check spam or sign in if already
          verified.
        </p>
      ) : (
        <>
          <p>Request a fresh link for your existing registration.</p>
          {p.error && (
            <p className="notice error" role="alert">
              Email delivery is unavailable or rate limited. Try again later.
            </p>
          )}
          <form action={resendVerification}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <Submit>Resend verification</Submit>
          </form>
        </>
      )}
    </AuthCard>
  );
}
