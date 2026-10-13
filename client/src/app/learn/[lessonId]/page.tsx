import { Shell } from "@/components/shell";
import { Assessment } from "@/components/learning-workspace";
import { view } from "@/lib/api-server";
export default async function Learn({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const {user,data} = await view("learn/[lessonId]", {params: await params});
  return (
    <Shell>
      <h1>Lesson and knowledge check</h1>
      <Assessment lesson={data} workerId={user.id} />
    </Shell>
  );
}
