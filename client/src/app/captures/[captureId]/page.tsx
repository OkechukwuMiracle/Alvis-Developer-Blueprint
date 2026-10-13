import { Shell } from "@/components/shell";
import { CaptureWorkspace } from "@/components/capture-workspace";
import { WithdrawRecording } from "@/components/withdraw-recording";
import { view } from "@/lib/api-server";
export default async function Capture({
  params,
}: {
  params: Promise<{ captureId: string }>;
}) {
  const {captureId,member,c} = await view("captures/[captureId]", {params: await params});
  return (
    <Shell>
      {c.state === "deleted" ? (
        <div className="notice" role="status">
          <h1>Recording withdrawn</h1>
          <p>
            Its evidence and dependent knowledge are unavailable for retrieval
            and training.
          </p>
        </div>
      ) : (
        <CaptureWorkspace id={captureId} />
      )}
      {c.state !== "deleted" &&
        (member.role === "admin" || member.role === "expert") && (
          <WithdrawRecording id={captureId} title={c.title} />
        )}
    </Shell>
  );
}
