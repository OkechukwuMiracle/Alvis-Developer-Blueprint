import { context } from "@/database/supabase";
import type { Content } from "@/validation/content";
import { checkDatabaseError } from "./errors";
export type Revision = {
  id: string;
  unit_id: string;
  capture_id: string | null;
  version: number;
  status: string;
  content: Content;
  content_hash: string;
  created_by: string;
  index_ready: boolean;
};
export async function revisions(
  path: string,
  kind: "library" | "drafts" | "review",
) {
  const ctx = await context(path);
  let query = ctx.supabase
    .from("knowledge_revisions")
    .select("*")
    .eq("organization_id", ctx.member.organization_id)
    .order("created_at", { ascending: false });
  if (kind === "library")
    query = query.eq("status", "approved").eq("index_ready", true);
  if (kind === "drafts") query = query.eq("created_by", ctx.user.id);
  const { data, error } = await query;
  checkDatabaseError(error);
  if (error)
    throw new Error(
      "Knowledge could not be loaded. Check database migrations.",
    );
  const { data: units } = await ctx.supabase
    .from("knowledge_units")
    .select("id,active_revision_id,asset_id")
    .eq("organization_id", ctx.member.organization_id);
  const { data: assets } = await ctx.supabase
    .from("assets")
    .select("id,code,name")
    .eq("organization_id", ctx.member.organization_id);
  return {
    ...ctx,
    rows: (data ?? ([] as Revision[])).filter(
      (r: Revision) =>
        kind !== "library" ||
        units?.some((u) => u.id === r.unit_id && u.active_revision_id === r.id),
    ) as Revision[],
    units: units ?? [],
    assets: assets ?? [],
  };
}
