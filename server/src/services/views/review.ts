import { redirect } from "next/navigation";
import { revisions } from "@/database/queries";
export async function loadReview({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
const { rows, member, supabase } = await revisions("/review", "review");
if (member.role !== "reviewer") redirect("/home");
const { filter = "waiting" } = await searchParams;
const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });
const filtered = rows.filter((r) =>
    filter === "reviewed"
      ? ["approved", "rejected", "retired"].includes(r.status)
      : filter === "changes"
        ? r.status === "draft" &&
          reviews?.some(
            (x) => x.revision_id === r.id && x.decision === "request_changes",
          )
        : r.status === "pending",
  );
return {filter,filtered};
}
