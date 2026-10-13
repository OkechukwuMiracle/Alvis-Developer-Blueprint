import { redirect } from "next/navigation";
import { revisions } from "@/database/queries";
export async function loadDrafts({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
const { rows, member, units } = await revisions("/drafts", "drafts");
if (member.role !== "expert") redirect("/home");
const { error } = await searchParams;
return {rows,units,error};
}
