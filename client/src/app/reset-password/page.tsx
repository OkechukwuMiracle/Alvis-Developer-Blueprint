import Link from "next/link";
import { identity } from "@/lib/api-server";
import { AuthCard } from "@/components/auth-card";
import { Submit } from "@/components/account-form";
import { resetPassword } from "../account-actions";
export const metadata = { title: "Reset your password · Alvis" };
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const { canRecover: valid } = await identity();
  return (
    <AuthCard title="Reset your password">
      {!valid ? (
        <>
          <p className="notice" role="alert">
            This recovery session is missing or expired. Request a fresh link
            and open it in this browser.
          </p>
          <Link href="/forgot-password">Request a new recovery link</Link>
        </>
      ) : (
        <>
          {p.error && (
            <p className="notice error" role="alert">
              Use matching passwords of 12–128 characters. If recovery failed,
              request a fresh link.
            </p>
          )}
          <form action={resetPassword}>
            <label htmlFor="password">New password</label>
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
            <Submit>Reset password</Submit>
          </form>
        </>
      )}
    </AuthCard>
  );
}
