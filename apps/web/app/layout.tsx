import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "منجز",
  description: "نظام ذكي لإدارة جاهزية وتحليل المنافسات",
};

const navItems = [
  { href: "/dashboard", label: "لوحة التحكم" },
  { href: "/tenders", label: "المنافسات" },
  { href: "/workbench", label: "مساحة العمل" },
  { href: "/resources", label: "الموارد" },
  { href: "/tasks", label: "المهام" },
  { href: "/archives", label: "الأرشيف" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#F4F6F6",
          color: "#232122",
          fontFamily:
            '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            direction: "rtl",
            background: "#F4F6F6",
          }}
        >
          <aside
            style={{
              width: 240,
              minWidth: 240,
              minHeight: "100vh",
              position: "sticky",
              top: 0,
              alignSelf: "flex-start",
              background: "#232122",
              color: "#ffffff",
              padding: "22px 16px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              overflow: "hidden",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                paddingBottom: 20,
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                textAlign: "center",
              }}
            >
              <Link
                href="/dashboard"
                aria-label="منجز"
                style={{
                  width: 142,
                  height: 82,
                  margin: "0 auto 12px",
                  borderRadius: 22,
                  background: "rgba(255,255,255,0.055)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 12,
                  overflow: "hidden",
                  textDecoration: "none",
                  boxSizing: "border-box",
                }}
              >
                <img
                  src="/brand/munjiz-logo-transparent.png"
                  alt="منجز"
                  style={{
                    display: "block",
                    width: 118,
                    maxWidth: 118,
                    maxHeight: 58,
                    height: "auto",
                    objectFit: "contain",
                  }}
                />
              </Link>

              <div style={{ display: "grid", gap: 4, textAlign: "center" }}>
                <strong
                  style={{
                    color: "#ffffff",
                    fontSize: "1.08rem",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  مُنجز
                </strong>
                <span
                  style={{
                    color: "rgba(255,255,255,0.68)",
                    fontSize: "0.8rem",
                    lineHeight: 1.7,
                  }}
                >
                  نظام تحليل المناقصات
                </span>
              </div>
            </div>

            <nav
              aria-label="التنقل الرئيسي"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    color: "rgba(255,255,255,0.86)",
                    textDecoration: "none",
                    padding: "11px 13px",
                    borderRadius: 14,
                    fontSize: "0.94rem",
                    fontWeight: 700,
                    border: "1px solid transparent",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div
              style={{
                marginTop: "auto",
                padding: "11px 13px",
                borderRadius: 16,
                background: "rgba(89,186,71,0.12)",
                color: "rgba(255,255,255,0.78)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: "0.78rem",
                lineHeight: 1.6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#59BA47",
                  boxShadow: "0 0 0 4px rgba(89,186,71,0.16)",
                }}
              />
              <span>بيئة تشغيل داخلية</span>
            </div>
          </aside>

          <main
            style={{
              flex: 1,
              minWidth: 0,
              background: "#F4F6F6",
              padding: 28,
              overflowX: "hidden",
              boxSizing: "border-box",
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}