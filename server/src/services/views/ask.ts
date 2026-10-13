import { context } from "@/database/supabase";
export async function loadAsk() {
const { supabase, member } = await context("/ask");
const { data, error } = await supabase
    .from("assets")
    .select("id,code,name")
    .eq("organization_id", member.organization_id)
    .order("code");
if (error) throw new Error("Assets unavailable.");
return {data};
}
