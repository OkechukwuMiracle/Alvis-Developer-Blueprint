"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="max-w-xl mx-auto p-8">
      <h1>Unable to load this page</h1>
      <p>Check the Supabase connection and database setup, then try again.</p>
      <button className="mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
