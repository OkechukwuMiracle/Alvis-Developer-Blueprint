import { revisions } from "@/database/queries";
export async function loadHome() {
const { member, rows, assets, units, supabase } = await revisions(
    "/home",
    "review",
  );
const published = rows.filter(
    (r) =>
      r.status === "approved" &&
      r.index_ready &&
      units.some((u) => u.active_revision_id === r.id),
  );
const pending = rows.filter((r) => r.status === "pending");
const drafts = rows.filter((r) => r.status === "draft");
const { data: captures } =
    member.role === "expert"
      ? await supabase
          .from("captures")
          .select("id,title,state")
          .eq("organization_id", member.organization_id)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: null };
const reviewer = member.role === "reviewer";
const expert = member.role === "expert";
const admin =
    member.role === "admin"
      ? await Promise.all([
          supabase
            .from("memberships")
            .select("user_id", { count: "exact", head: true })
            .eq("organization_id", member.organization_id)
            .is("revoked_at", null),
          supabase
            .from("audit_events")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", member.organization_id),
        ])
      : null;
return {member,assets,published,pending,drafts,captures,reviewer,expert,admin};
}
