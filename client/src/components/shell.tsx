import Link from "next/link";
import { context } from "@/lib/api-server";
import { signOut } from "@/app/actions";
import { NavLink } from "./nav-link";
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
          <NavLink href={personal ? "/community/home" : "/home"}>Home</NavLink>
          <NavLink href={personal ? "/community/library" : "/knowledge"}>Knowledge library</NavLink>
          <NavLink href={personal ? "/community/ask" : "/ask"}>Ask Alvis</NavLink>
          <NavLink href={personal ? "/community/learning" : "/learning"}>Learning</NavLink>
          <NavLink href="/onboarding">Switch workspace</NavLink>
          {member.role === "admin" && <NavLink href="/settings">Workspace settings</NavLink>}
          {member.role === "expert" && (
            <>
              <NavLink href="/captures/new">Record knowledge</NavLink>
              <NavLink href="/drafts">My drafts</NavLink>
            </>
          )}
          {member.role === "reviewer" && (
            <>
              <NavLink href={personal ? "/community/review" : "/review"}>Review queue</NavLink>
              <NavLink href={personal ? "/community/lesson-review" : "/review/lessons"}>Lesson review</NavLink>
            </>
          )}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="workspace-indicator"><span className={"context-label" + (personal ? " personal" : "")}>{personal ? "Personal" : "Private organization"}</span><strong>{personal ? "Personal · Community" : org?.name}</strong></div>
            <div className="muted">
              {personal ? "Community roles are not professional credentials" : org?.demo_only
                ? "Training simulation workspace"
                : "Reviewed knowledge workspace"}
            </div>
          </div>
          <div className="account-menu">
            <div><span className="badge">{member.role}</span> {member.display_name}</div>
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
