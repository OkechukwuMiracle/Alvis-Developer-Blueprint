import Link from "next/link";
export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        alvis.
      </Link>
      <section className="auth-card">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
