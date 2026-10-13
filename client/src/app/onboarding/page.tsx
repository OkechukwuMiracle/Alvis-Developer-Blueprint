import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { RequestId, Submit } from "@/components/account-form";
import { activatePersonal, createOrganization, switchOrganization } from "../account-actions";
import { view } from "@/lib/api-server";
export const metadata = { title: "Choose your Alvis workspace" };
export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, p, members, personal } = await view("onboarding", { searchParams: await searchParams });
  return <AuthCard title="Your workspaces">
    {p.error && <p className="notice error" role="alert">Unable to complete onboarding. Verify your email and check database setup, then retry.</p>}
    {!user.email_confirmed_at ? <p className="notice">Verify your email before activating a personal profile, creating an organization or accepting an invitation.</p> : <>
      {(personal || members.length > 0) && <form action={switchOrganization}>
        <label htmlFor="workspace">Active workspace</label><select name="organization" id="workspace">
          {personal && <option value="personal">Personal · {personal.role}</option>}
          {members.map(m => <option key={m.organization_id} value={m.organization_id}>{m.organizations.name} · {m.role}</option>)}
        </select><Submit>Open workspace</Submit>
      </form>}
      {!personal && <section><h2>Use Alvis personally</h2><p>No organization or invitation required. All community roles can discover, ask and learn. Role selection does not verify professional credentials or grant organization access.</p>
        <form action={activatePersonal}><label htmlFor="personal-name">Your public display name</label><input id="personal-name" name="name" defaultValue={String(user.user_metadata.full_name || "")} minLength={2} maxLength={100} required />
          <label htmlFor="community-role">Community role</label><select id="community-role" name="role"><option value="worker">Worker / Learner</option><option value="expert">Expert contributor</option><option value="reviewer">Community reviewer</option></select>
          <Submit>Activate personal account</Submit>
        </form></section>}
      <section><h2>Create an organization</h2><p>Start a private organization as its admin. Organization roles remain separate from your community role.</p>
        <form action={createOrganization}><RequestId /><label htmlFor="org-person-name">Your full name</label><input id="org-person-name" name="name" defaultValue={String(user.user_metadata.full_name || "")} minLength={2} maxLength={100} required />
          <label htmlFor="organization">Organization name</label><input id="organization" name="organization" minLength={2} maxLength={100} required /><Submit>Create organization</Submit>
        </form></section>
    </>}
    <div className="auth-links"><Link href="/invite">Accept an invitation</Link><Link href="/community/library">Browse community knowledge</Link></div>
  </AuthCard>;
}
