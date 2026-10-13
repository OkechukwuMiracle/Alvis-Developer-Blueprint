import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadDraft({
  params,
}: {
  params: Promise<{ unitId: string; revisionId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
const { unitId, revisionId } = await params;
const { member, supabase } = await context(
    "/knowledge/" + unitId + "/revisions/" + revisionId + "/edit",
  );
const { data: r } = await supabase
    .from("knowledge_revisions")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("unit_id", unitId)
    .eq("id", revisionId)
    .single();
if (!r) notFound();
return {revisionId};
}
