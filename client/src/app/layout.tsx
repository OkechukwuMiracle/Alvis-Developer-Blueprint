import type { Metadata } from "next";
import "./globals.css";
import "./design-system.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"),
  title: "Alvis · Reviewed knowledge",
  description: "Expert judgment, reviewed and traceable.",
  openGraph: { title: "Alvis · Preserve expert judgment", description: "Evidence-linked, reviewed knowledge and contextual manufacturing training.", type: "website" },
  twitter: { card: "summary_large_image", title: "Alvis · Preserve expert judgment", description: "Reviewed knowledge. Contextual learning.", images: ["/opengraph-image"] },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
