import { redirect } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadWorkspaceSettings() {
const { supabase, member, user } = await context("/settings");
if (member.role !== "admin") redirect("/home");
const [invites, members] = await Promise.all([
    supabase
      .from("member_invitations")
      .select("id,email,role,expires_at,accepted_at,revoked_at")
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("user_id,role,display_name")
      .eq("organization_id", member.organization_id)
      .is("revoked_at", null),
  ]);
return {user,invites,members};
}
