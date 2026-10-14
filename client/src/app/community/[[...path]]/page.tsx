import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { context } from "@/lib/api-server";
import { Shell } from "@/components/shell";
import { Community } from "@/components/community";
export const metadata = { title: "Alvis community · Reviewed knowledge", description: "Discover explicitly shared, community-reviewed experience. Review is not certification or guaranteed correctness." };
export default async function CommunityPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path || ["library"];
  const screen = path[0];
  if (!["library", "publication", "profile", "home", "ask", "review", "lesson-review", "learning", "guide", "lesson"].includes(screen)) notFound();
  if (["library", "publication", "profile"].includes(screen)) return <main className="main max-w-5xl mx-auto"><nav className="community-navigation" aria-label="Community navigation"><Link href="/">alvis.</Link><Link href="/community/library">Public library</Link><Link href="/community/home">Personal workspace</Link><Link href="/signup">Get started</Link></nav><Community screen={screen} id={path[1]} /></main>;
  const current = await context("/community/" + screen);
  if (current.active_context !== "personal") redirect("/onboarding");
  return <Shell><Community key={path.join("/")} screen={screen} id={path[1]} role={current.member.role} userId={current.user.id} /></Shell>;
}
