import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { privateCookie } from "./auth-flow";
import { safeNext } from "@/validation/content";
import { communitySignupRole, personalSignup } from "@/validation/signup-context";

export async function completeSignup(client: SupabaseClient, user: User, destination?: string | null) {
  const jar = await cookies();
  if (personalSignup(user.user_metadata)) {
    // Metadata expresses a community preference only. The verified, idempotent
    // RPC binds ownership to auth.uid() and cannot grant organization access.
    const { error } = await client.rpc("alvis_activate_personal", {
      person_name: String(user.user_metadata.full_name || "").trim(),
      community_role: communitySignupRole(user.user_metadata.community_role),
    });
    jar.delete("alvis-invitation");
    jar.delete("alvis-next");
    if (error) return "/onboarding?error=personal";
    jar.set("alvis-organization", "personal", { ...privateCookie, maxAge: 30 * 86400 });
    return "/community/home";
  }
  const next = jar.has("alvis-invitation") ? "/invite" : safeNext(destination || jar.get("alvis-next")?.value || "/home");
  jar.delete("alvis-next");
  return next;
}
