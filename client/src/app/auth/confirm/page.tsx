import { AuthCard } from "@/components/auth-card";
import { ConfirmEmail } from "@/components/confirm-email";
export const metadata = {
  title: "Confirm your email · Alvis",
  robots: { index: false, follow: false },
};
export default function Confirm() {
  return (
    <AuthCard title="Confirm your email">
      <ConfirmEmail />
    </AuthCard>
  );
}
