"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const child = pathname.startsWith(href + "/") && !(href === "/review" && pathname.startsWith("/review/lessons"));
  const active = pathname === href || (href !== "/home" && href !== "/community/home" && child);
  return <Link href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}
