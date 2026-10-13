import Link from "next/link";
export default function NotFound() {
  return (
    <main className="max-w-xl mx-auto p-8">
      <h1>Record unavailable</h1>
      <p>
        This record is unavailable in your workspace or is no longer active.
      </p>
      <Link className="button mt-6" href="/home">
        Return home
      </Link>
    </main>
  );
}
