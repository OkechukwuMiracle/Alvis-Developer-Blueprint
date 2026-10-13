import { redirect } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadReviewLessons() {
const { supabase, member } = await context("/review/lessons");
if (member.role !== "reviewer") redirect("/home");
const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id,content,content_hash,state")
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });
if (error) throw new Error("Apply Week 3 migrations.");
const { data: jobs } = await supabase
    .from("processing_jobs")
    .select("id,stage,status,attempts,error_code,revision_id")
    .eq("organization_id", member.organization_id)
    .in("stage", ["index", "lesson"])
    .order("created_at", { ascending: false });
const { data: tasks } = await supabase
    .from("expert_review_tasks")
    .select("id,ask_id,created_at")
    .eq("organization_id", member.organization_id);
const { data: requests } = await supabase
    .from("ask_sessions")
    .select("id,query,response")
    .eq("organization_id", member.organization_id)
    .in(
      "id",
      (tasks ?? []).map((t) => t.ask_id),
    );
const { data: attempts } = await supabase
    .from("assessment_attempts")
    .select("correct_count")
    .eq("organization_id", member.organization_id);
return {lessons,jobs,tasks,requests,attempts};
}
