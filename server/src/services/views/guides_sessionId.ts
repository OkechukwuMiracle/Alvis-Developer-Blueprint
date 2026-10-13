import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadGuide({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
const { sessionId } = await params;
const { supabase, member } = await context("/guides/" + sessionId);
const { data, error } = await supabase.rpc("alvis_learning_command", {
    org: member.organization_id,
    operation: "guide_get",
    entity: sessionId,
    body: {},
  });
if (error || !data) notFound();
const { data: history } = await supabase.rpc("alvis_learning_history", {
    org: member.organization_id,
  });
return {data,history};
}
