import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "منجز",
  description: "نظام ذكي لإدارة جاهزية المنافسات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif' }}>
        <div style={{ display: "flex", minHeight: "100vh", direction: "rtl" }}>
          <aside
            style={{
              width: "240px",
              background: "#111827",
              color: "white",
              padding: "24px 16px",
            }}
          >
            <h2 style={{ marginTop: 0 }}>منجز</h2>

            <nav style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Link href="/dashboard" style={{ color: "white", textDecoration: "none" }}>
                لوحة التحكم
              </Link>
              <Link href="/tenders" style={{ color: "white", textDecoration: "none" }}>
                المنافسات
              </Link>
              <Link href="/resources" style={{ color: "white", textDecoration: "none" }}>
                الموارد
              </Link>
              <Link href="/tasks" style={{ color: "white", textDecoration: "none" }}>
                المهام
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