import Link from "next/link";
import { context } from "@/lib/api-server";
import { signOut } from "@/app/actions";
export async function Shell({ children }: { children: React.ReactNode }) {
  const { member, org, active_context } = await context();
  const personal = active_context === "personal";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          alvis<span className="text-emerald-300">.</span>
        </div>
        <nav aria-label="Main navigation">
          <Link href={personal ? "/community/home" : "/home"}>Home</Link>
          <Link href={personal ? "/community/library" : "/knowledge"}>Knowledge library</Link>
          <Link href={personal ? "/community/ask" : "/ask"}>Ask Alvis</Link>
          <Link href={personal ? "/community/learning" : "/learning"}>Learning</Link>
          <Link href="/onboarding">Switch workspace</Link>
          {member.role === "admin" && <Link href="/settings">Workspace settings</Link>}
          {member.role === "expert" && (
            <>
              <Link href="/captures/new">Record knowledge</Link>
              <Link href="/drafts">My drafts</Link>
            </>
          )}
          {member.role === "reviewer" && (
            <>
              <Link href={personal ? "/community/review" : "/review"}>Review queue</Link>
              <Link href={personal ? "/community/lesson-review" : "/review/lessons"}>Lesson review</Link>
            </>
          )}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <strong>{personal ? "Personal · Community" : org?.name}</strong>
            <div className="muted">
              {personal ? "Community roles are not professional credentials" : org?.demo_only
                ? "Training simulation workspace"
                : "Reviewed knowledge workspace"}
            </div>
          </div>
          <div>
            <span className="badge">{member.role}</span> {member.display_name}
            <form action={signOut}>
              <button className="secondary mt-2">Sign out</button>
            </form>
          </div>
        </header>
        {children}
        <Link className="button mobile-ask" href={personal ? "/community/ask" : "/ask"}>
          Ask Alvis
        </Link>
      </main>
    </div>
  );
}
