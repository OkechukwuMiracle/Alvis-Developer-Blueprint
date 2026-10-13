import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadCapture({
  params,
}: {
  params: Promise<{ captureId: string }>;
}) {
const { captureId } = await params;
const { member, supabase } = await context("/captures/" + captureId);
const { data: c } = await supabase
    .from("captures")
    .select("id,title,owner_id,state")
    .eq("organization_id", member.organization_id)
    .eq("id", captureId)
    .single();
if (!c) notFound();
return {captureId,member,c};
}
