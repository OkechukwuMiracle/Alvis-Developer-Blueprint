import { context } from "@/database/supabase";
export async function loadLearning() {
const { supabase, member, user } = await context("/learning");
const { data, error } = await supabase.rpc("alvis_learning_history", {
    org: member.organization_id,
  });
if (error)
    throw new Error("Apply Week 3 migrations to load learning history.");
const { data: guides } = await supabase
    .from("guide_sessions")
    .select("id,state,started_at")
    .eq("organization_id", member.organization_id)
    .eq("worker_id", user.id)
    .eq("state", "active");
return {member,data,guides};
}
