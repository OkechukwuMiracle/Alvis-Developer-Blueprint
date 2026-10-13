import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@alvis/shared/views";
import { checkDatabaseError } from "./errors";
import { selectWorkspace } from "@alvis/shared/workspace";

type Workspace = Member & { organizations: { name: string; scope_kind: string; personal_owner: string | null; demo_only: boolean } };
export async function workspaces(client: SupabaseClient, userId: string, selected?: string) {
  const { data, error } = await client.from("memberships")
    .select("organization_id,role,display_name,organizations(name,scope_kind,personal_owner,demo_only)")
    .eq("user_id", userId).is("revoked_at", null).order("organization_id");
  checkDatabaseError(error);
  if (error) throw new Error("Workspace membership unavailable.");
  const all = (data || []) as unknown as Workspace[];
  if (all.some(m => m.organizations?.scope_kind === "personal" && m.organizations.personal_owner === userId)) {
    const { data: profile, error: profileError } = await client.from("community_profiles").select("role,display_name").eq("user_id", userId).maybeSingle();
    checkDatabaseError(profileError);
    if (profileError || !profile) throw new Error("Personal profile unavailable.");
    for (const member of all) {
      if (member.organizations?.scope_kind === "personal" && member.organizations.personal_owner === userId) {
        member.role = profile.role as Member["role"];
        member.display_name = profile.display_name;
      }
    }
  }
  return selectWorkspace(all, userId, selected);
}
