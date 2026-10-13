import { Shell } from "@/components/shell";
import { CaptureForm } from "@/components/capture-form";
import { view, context } from "@/lib/api-server";
export default async function Capture() {
  const {assets} = await view("captures/new", {});
  const { member, user, active_context } = await context("/captures/new");
  return (
    <Shell>
      <div className="eyebrow">Capture expert judgment</div>
      <h1>Record knowledge</h1>
      <p className="muted mb-6">
        Show what happened. Explain what you noticed. Alvis preserves
        uncertainty for human review.
      </p>
      <CaptureForm assets={assets ?? []} workspaceKey={user.id + ":" + member.organization_id} personal={active_context === "personal"} />
    </Shell>
  );
}
