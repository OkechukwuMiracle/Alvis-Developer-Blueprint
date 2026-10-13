import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadPractice({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
const { revisionId } = await params;
const { supabase, member } = await context("/practice/" + revisionId);
const { data: active } = await supabase.rpc("alvis_is_active", {
    org: member.organization_id,
    rev: revisionId,
  });
if (!active) notFound();
const { data: r } = await supabase
    .from("knowledge_revisions")
    .select("id,content")
    .eq("organization_id", member.organization_id)
    .eq("id", revisionId)
    .single();
if (!r) notFound();
return {revisionId,r};
}
