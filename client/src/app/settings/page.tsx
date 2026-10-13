import { Shell } from "@/components/shell";
import { Settings } from "@/components/settings";
import { view } from "@/lib/api-server";
function requestTimestamp() {
  return Date.now();
}
export const metadata = { title: "Workspace settings · Alvis" };
export default async function WorkspaceSettings() {
  const {user,invites,members} = await view("settings", {});
  return (
    <Shell>
      <h1>Workspace settings</h1>
      {invites.error || members.error ? (
        <p className="notice error">
          Settings unavailable. Apply the onboarding migration and retry.
        </p>
      ) : (
        <Settings
          invitations={invites.data || []}
          members={members.data || []}
          self={user.id}
          now={requestTimestamp()}
        />
      )}
    </Shell>
  );
}
