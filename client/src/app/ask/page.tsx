import { Shell } from "@/components/shell";
import { AskForm } from "@/components/learning-workspace";
import { view } from "@/lib/api-server";
export default async function Ask() {
  const {data} = await view("ask", {});
  return (
    <Shell>
      <div className="eyebrow">Reviewed knowledge</div>
      <h1>Ask Alvis</h1>
      <p className="notice">
        Describe a supervised training problem. For active equipment hazards,
        contact the designated supervisor.
      </p>
      <AskForm assets={data ?? []} />
    </Shell>
  );
}
