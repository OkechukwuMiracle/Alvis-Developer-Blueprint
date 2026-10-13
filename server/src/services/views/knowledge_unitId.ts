import { notFound } from "next/navigation";
import { revisions } from "@/database/queries";
export async function loadDetail({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
const { unitId } = await params;
const { rows, member } = await revisions("/knowledge/" + unitId, "library");
const r = rows.find((x) => x.unit_id === unitId);
if (!r) notFound();
return {member,r};
}
