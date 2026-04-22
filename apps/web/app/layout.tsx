import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Munjiz OS",
  description: "Agentic tender-readiness workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <aside
            style={{
              width: "240px",
              background: "#111827",
              color: "white",
              padding: "24px 16px",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Munjiz OS</h2>

            <nav style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Link href="/dashboard" style={{ color: "white", textDecoration: "none" }}>
                Dashboard
              </Link>
              <Link href="/tenders" style={{ color: "white", textDecoration: "none" }}>
                Tenders
              </Link>
              <Link href="/resources" style={{ color: "white", textDecoration: "none" }}>
                Resources
              </Link>
              <Link href="/tasks" style={{ color: "white", textDecoration: "none" }}>
                Tasks
              </Link>
              <Link href="/approvals" style={{ color: "white", textDecoration: "none" }}>
                Approvals
              </Link>
            </nav>
          </aside>

          <main style={{ flex: 1, background: "#f9fafb", padding: "24px" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}