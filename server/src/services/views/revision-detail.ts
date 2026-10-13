import { notFound, redirect } from "next/navigation";
import { context } from "@/database/supabase";
import type { Revision } from "@/database/queries";
export async function loadRevisionDetail({
  id,
  review,
}: {
  id: string;
  review: boolean;
  search: { error?: string; saved?: string };
}) {
const { supabase, member, user } = await context(
    (review ? "/review/" : "/drafts/") + id,
  );
if (review ? member.role !== "reviewer" : member.role !== "expert")
    redirect("/home");
const { data } = await supabase
    .from("knowledge_revisions")
    .select("*")
    .eq("organization_id", member.organization_id)
    .eq("id", id)
    .single();
const r = data as Revision | null;
if (!r || (!review && r.created_by !== user.id)) notFound();
const { data: links } = await supabase
    .from("revision_sources")
    .select("source_id")
    .eq("organization_id", member.organization_id)
    .eq("revision_id", id);
const { data: sources } = await supabase
    .from("sources")
    .select("id,locator,text_content,synthetic")
    .eq("organization_id", member.organization_id)
    .in(
      "id",
      (links ?? []).map((x) => x.source_id),
    );
const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("organization_id", member.organization_id)
    .eq("revision_id", id)
    .order("created_at", { ascending: false });
const { data: previous } = await supabase
    .from("knowledge_revisions")
    .select("version,content")
    .eq("organization_id", member.organization_id)
    .eq("unit_id", r.unit_id)
    .lt("version", r.version)
    .order("version", { ascending: false })
    .limit(1);
const { data: history } = await supabase
    .from("draft_edit_history")
    .select("id,content,saved_at")
    .eq("organization_id", member.organization_id)
    .eq("revision_id", id)
    .order("saved_at", { ascending: false });
return {user,r,links,sources,reviews,previous,history};
}
