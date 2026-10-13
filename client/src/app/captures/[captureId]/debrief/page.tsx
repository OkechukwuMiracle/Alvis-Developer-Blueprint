import { Shell } from "@/components/shell";
import { CaptureWorkspace } from "@/components/capture-workspace";
import { view } from "@/lib/api-server";
export default async function Debrief({
  params,
}: {
  params: Promise<{ captureId: string }>;
}) {
  const {captureId} = await view("captures/[captureId]/debrief", {params: await params});
  return (
    <Shell>
      <CaptureWorkspace id={captureId} debrief />
    </Shell>
  );
}
