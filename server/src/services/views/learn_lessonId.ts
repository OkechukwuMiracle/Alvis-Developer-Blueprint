import { notFound } from "next/navigation";
import { context } from "@/database/supabase";
export async function loadLearn({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
const { lessonId } = await params;
const { supabase, member, user } = await context("/learn/" + lessonId);
const { data, error } = await supabase.rpc("alvis_learning_command", {
    org: member.organization_id,
    operation: "lesson_get",
    entity: lessonId,
    body: {},
  });
if (error || !data) notFound();
return {user,data};
}
