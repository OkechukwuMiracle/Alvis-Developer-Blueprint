import { notFound, redirect } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadDebrief({
  params,
}: {
  params: Promise<{ captureId: string }>;
}) {
const { captureId } = await params;
const { member, supabase, user } = await context(
    "/captures/" + captureId + "/debrief",
  );
if (member.role !== "expert") redirect("/home");
const { data: c } = await supabase
    .from("captures")
    .select("id,current_revision_id")
    .eq("organization_id", member.organization_id)
    .eq("owner_id", user.id)
    .eq("id", captureId)
    .single();
if (!c) notFound();
if (!c.current_revision_id) redirect("/captures/" + captureId);
return {captureId};
}
