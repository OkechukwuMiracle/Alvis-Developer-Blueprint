import { identity } from "@/lib/api-server";
import { AuthCard } from "@/components/auth-card";
import { Invitation } from "@/components/invitation";
export const metadata = {
  title: "Accept an invitation · Alvis",
  robots: { index: false, follow: false },
};
export default async function Invite() {
  const { user, remembered } = await identity();
  return (
    <AuthCard title="Join your team">
      <Invitation
        signedIn={Boolean(user)}
        email={user?.email || ""}
        name={String(user?.user_metadata.full_name || "")}
        remembered={remembered}
      />
    </AuthCard>
  );
}
