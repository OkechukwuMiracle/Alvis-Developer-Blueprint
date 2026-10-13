import { redirect } from "next/navigation";
import { configured, db } from "@/database/supabase";
import { workspaces } from "@/database/workspaces";
export async function loadOnboarding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
if (!configured()) redirect("/login?setup=1");
const client = await db();
const {
    data: { user },
  } = await client.auth.getUser();
if (!user) redirect("/login?next=/onboarding");
const p = await searchParams;
const { organizations: members, personal } = await workspaces(client, user.id);
return {user,p,members,personal: personal ? {role:personal.role,display_name:personal.display_name} : null};
}
