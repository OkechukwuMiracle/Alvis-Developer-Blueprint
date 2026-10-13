"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { configured, db } from "@/database/supabase";
import { safeNext } from "@/validation/content";
import { emailAddress, passwordError } from "@/validation/onboarding";
import { canRecover, privateCookie, siteUrl } from "@/services/auth-flow";
import { signupErrorReason } from "@alvis/shared/signup-errors";
import { communitySignupRole } from "@/validation/signup-context";
import { completeSignup } from "@/services/signup-completion";
export async function signup(form: FormData) {
  const email = emailAddress(form.get("email"));
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  const next = safeNext(String(form.get("next") || "/home"));
  if (
    !email ||
    name.length < 2 ||
    name.length > 100 ||
    passwordError(password, String(form.get("confirmation") || ""))
  )
    redirect("/signup?error=validation");
  if (!configured()) redirect("/signup?error=configuration");
  let result;
  try {
    result = await (
      await db()
    ).auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, account_kind: form.get("account_kind") === "organization" ? "organization" : "personal", community_role: communitySignupRole(form.get("community_role")), signup_destination: next },
        emailRedirectTo: siteUrl() + "/auth/confirm",
      },
    });
  } catch {
    redirect("/signup?error=unavailable");
  }
  if (result.error) {
    const reason = signupErrorReason(result.error);
    // Never log emails, passwords, request bodies, tokens or provider messages.
    console.warn("Signup rejected by authentication provider", { reason, status: result.error.status });
    redirect("/signup?error=" + reason + "&next=" + encodeURIComponent(next));
  }
  (await cookies()).set("alvis-next", next, { ...privateCookie, maxAge: 3600 });
  if (next !== "/invite") (await cookies()).delete("alvis-invitation");
  if (result.data.session && result.data.user) redirect(await completeSignup(await db(), result.data.user));
  redirect("/signup?sent=1");
}
export async function resendVerification(form: FormData) {
  const email = emailAddress(form.get("email"));
  if (!email || !configured()) redirect("/verify-email?error=unavailable");
  let failed = false;
  try {
    const { error } = await (
      await db()
    ).auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: siteUrl() + "/auth/confirm" },
    });
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  redirect(failed ? "/verify-email?error=unavailable" : "/verify-email?sent=1");
}
export async function forgotPassword(form: FormData) {
  const email = emailAddress(form.get("email"));
  if (!email) redirect("/forgot-password?error=validation");
  if (!configured()) redirect("/forgot-password?error=unavailable");
  try {
    const { error } = await (
      await db()
    ).auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl() + "/auth/confirm",
    });
    if (error) redirect("/forgot-password?error=unavailable");
  } catch {
    redirect("/forgot-password?error=unavailable");
  }
  redirect("/forgot-password?sent=1");
}
export async function resetPassword(form: FormData) {
  if (!configured()) redirect("/forgot-password");
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || !(await canRecover(user.id)))
    redirect("/reset-password?error=expired");
  const password = String(form.get("password") || "");
  if (passwordError(password, String(form.get("confirmation") || "")))
    redirect("/reset-password?error=validation");
  const { error } = await client.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=unavailable");
  (await cookies()).delete("alvis-recovery");
  await client.auth.signOut({ scope: "global" });
  redirect("/login?reset=1");
}
export async function createOrganization(form: FormData) {
  if (!configured()) redirect("/login?setup=1");
  const client = await db();
  const { data, error } = await client.rpc("alvis_create_organization", {
    org_name: String(form.get("organization") || ""),
    person_name: String(form.get("name") || ""),
    request_id: String(form.get("request_id") || ""),
  });
  if (error || !data) redirect("/onboarding?error=create");
  (await cookies()).set("alvis-organization", data, {
    ...privateCookie,
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/home");
}
export async function switchOrganization(form: FormData) {
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const org = String(form.get("organization") || "");
  if (org === "personal") {
    const { data } = await client.from("organizations").select("id").eq("scope_kind", "personal").eq("personal_owner", user.id).maybeSingle();
    if (!data) redirect("/onboarding?error=personal");
    (await cookies()).set("alvis-organization", "personal", { ...privateCookie, maxAge: 30 * 86400 });
    redirect("/community/home");
  }
  const { data } = await client
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", org)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) redirect("/onboarding?error=membership");
  (await cookies()).set("alvis-organization", org, {
    ...privateCookie,
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/home");
}
export async function activatePersonal(form: FormData) {
  const client = await db();
  const { data, error } = await client.rpc("alvis_activate_personal", { person_name: String(form.get("name") || ""), community_role: String(form.get("role") || "") });
  if (error || !data) redirect("/onboarding?error=personal");
  (await cookies()).set("alvis-organization", "personal", { ...privateCookie, maxAge: 30 * 86400 });
  redirect("/community/home");
}
