import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadSource({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
const { sourceId } = await params;
const { supabase, member } = await context("/sources/" + sourceId);
const { data: s } = await supabase
    .from("sources")
    .select("id,kind,locator,text_content,start_ms,end_ms,synthetic,capture_id")
    .eq("organization_id", member.organization_id)
    .eq("id", sourceId)
    .single();
if (!s) notFound();
return {sourceId,s};
}
