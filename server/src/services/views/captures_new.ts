import { redirect } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadCapture() {
const { member, supabase } = await context("/captures/new");
if (member.role !== "expert") redirect("/home");
const { data: assets, error } = await supabase
    .from("assets")
    .select("id,code,name")
    .eq("organization_id", member.organization_id)
    .order("code");
if (error) throw new Error("Training assets unavailable.");
return {assets};
}
