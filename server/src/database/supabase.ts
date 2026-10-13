import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookieOptions } from "@/config";
import { workspaces } from "./workspaces";
export function configured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    !process.env.SUPABASE_URL.includes("YOUR_PROJECT"),
  );
}
export async function db() {
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, { ...options, ...cookieOptions }),
            );
          } catch {
            /* Proxy refreshes cookies during server rendering. */
          }
        },
      },
    },
  );
}
export async function context(path = "/home") {
  if (!configured()) redirect("/login?setup=1");
  const identity = await workspaceIdentity();
  if (!identity) redirect("/login?next=" + encodeURIComponent(path));
  return identity;
}
// React cache is scoped to a server render, never shared between authenticated requests.
const workspaceIdentity = cache(async () => {
  const supabase = await db();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const selected = (await cookies()).get("alvis-organization")?.value;
  const { member } = await workspaces(supabase, user.id, selected);
  if (!member) redirect("/onboarding");
  const { data: org } = await supabase
    .from("organizations")
    .select("name,demo_only")
    .eq("id", member.organization_id)
    .single();
  return { supabase, user, member, org };
});
