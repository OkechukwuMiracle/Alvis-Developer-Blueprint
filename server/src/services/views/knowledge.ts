import { revisions } from "@/database/queries";
export async function loadKnowledge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
const { rows, assets, supabase, member } = await revisions(
    "/knowledge",
    "library",
  );
const p = await searchParams;
const { data: summaryData, error } = await supabase.rpc(
    "alvis_review_summaries",
    { org: member.organization_id },
  );
if (error)
    throw new Error("Review summaries unavailable. Check database migrations.");
const reviews = (summaryData ?? []) as {
    revision_id: string;
    reviewer_name: string;
    approved_at: string;
  }[];
const tags = [...new Set(rows.flatMap((r) => r.content.skill_tags))];
const filtered = rows.filter(
    (r) =>
      (!p.asset || r.content.asset_code === p.asset) &&
      (!p.skill || r.content.skill_tags.includes(p.skill)) &&
      (!p.q ||
        JSON.stringify(r.content).toLowerCase().includes(p.q.toLowerCase())),
  );
return {assets,p,reviews,tags,filtered};
}
