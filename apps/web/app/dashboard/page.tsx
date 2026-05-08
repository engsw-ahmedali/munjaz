"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type HealthResponse = {
    status: string;
};

const COLORS = {
    green: "#59BA47",
    greenDark: "#3f9633",
    navy: "#232122",
    page: "#F4F6F6",
    card: "#ffffff",
    border: "#DFE7E4",
    muted: "#6B7280",
    lightMuted: "#9CA3AF",
    amber: "#d97706",
    red: "#dc2626",
    blue: "#2563eb",
};

const FONT = "inherit";

export default function DashboardPage() {
    const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");
    const [apiMessage, setApiMessage] = useState("جارٍ الاتصال بالخادم...");

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
                const response = await fetch(`${baseUrl}/health`);
                const data: HealthResponse = await response.json();
                if (response.ok) {
                    setApiStatus("online");
                    setApiMessage(`الوكيل متصل بالخادم — الحالة: ${data.status}`);
                } else {
                    setApiStatus("offline");
                    setApiMessage("عاد الخادم باستجابة غير ناجحة");
                }
            } catch {
                setApiStatus("offline");
                setApiMessage("تعذر الاتصال بالخادم");
            }
        };
        checkHealth();
    }, []);

    const agentPipeline = [
        { step: "01", label: "استيعاب الكراسة", hint: "رفع ملف أو إدخال يدوي", icon: "⊛", color: COLORS.blue },
        { step: "02", label: "استخراج المتطلبات", hint: "تحليل LLM للبنود والمتطلبات", icon: "◈", color: COLORS.green },
        { step: "03", label: "مطابقة الموارد", hint: "ربط موارد الشركة بالمتطلبات", icon: "◎", color: COLORS.green },
        { step: "04", label: "التحقق من الأدلة", hint: "تقييم قوة الأدلة الداعمة", icon: "◇", color: COLORS.amber },
        { step: "05", label: "مهام الفجوات", hint: "إنشاء مهام لإغلاق الفجوات الحرجة", icon: "◉", color: COLORS.amber },
        { step: "06", label: "بوابة القرار", hint: "توصية Bid / No-Bid بثقة مدعومة", icon: "◆", color: COLORS.green },
    ];

    const quickLinks = [
        { href: "/tenders", label: "لوحة الفرص", sub: "كل المنافسات النشطة", color: COLORS.blue },
        { href: "/tenders/new?mode=file", label: "منافسة من ملف", sub: "رفع كراسة شروط", color: COLORS.green },
        { href: "/tenders/new?mode=manual", label: "إدخال يدوي", sub: "أدخل بيانات المنافسة", color: COLORS.navy },
        { href: "/resources", label: "موارد الشركة", sub: "ذاكرة الخبرات والشهادات", color: "#9333ea" },
    ];

    return (
        <main dir="rtl" style={pageStyle}>
            {/* ── Hero ──────────────────────────────────────────────── */}
            <section style={heroStyle}>
                <div style={heroGlowStyle} />
                <div style={{ position: "relative", zIndex: 1 }}>
                    <span style={eyebrowStyle}>مركز قيادة منجز OS</span>
                    <h1 style={heroTitleStyle}>لوحة التحكم</h1>
                    <p style={heroSubStyle}>
                        منجز OS — وكيل ذكاء اصطناعي متخصص في تحليل المناقصات، استخراج المتطلبات، مطابقة موارد الشركة، وتوليد قرار Bid / No-Bid مدعوم بالأدلة.
                    </p>
                </div>

                {/* API Status chip */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 14px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 900,
                        border: "1px solid",
                        background: apiStatus === "online" ? "rgba(89,186,71,0.12)" : apiStatus === "offline" ? "rgba(220,38,38,0.12)" : "rgba(255,255,255,0.08)",
                        color: apiStatus === "online" ? "#7de86a" : apiStatus === "offline" ? "#fca5a5" : "rgba(255,255,255,0.55)",
                        borderColor: apiStatus === "online" ? "rgba(89,186,71,0.3)" : apiStatus === "offline" ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.15)",
                    }}>
                        <span style={{ width: 7, height: 7, borderRadius: "999px", background: apiStatus === "online" ? COLORS.green : apiStatus === "offline" ? COLORS.red : "#9CA3AF", display: "inline-block" }} />
                        {apiStatus === "loading" ? "جارٍ الاتصال" : apiStatus === "online" ? "الوكيل متصل" : "الوكيل غير متصل"}
                    </span>
                </div>
            </section>

            {/* ── Agent Pipeline ────────────────────────────────────── */}
            <section style={sectionCardStyle}>
                <div style={sectionHeaderStyle}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: "3px", background: COLORS.green, borderRadius: "999px", alignSelf: "stretch", flexShrink: 0 }} />
                        <div>
                            <h2 style={sectionTitleStyle}>سير عمل الوكيل</h2>
                            <p style={sectionHintStyle}>دورة تحليل المنافسة من الكراسة إلى قرار الدخول</p>
                        </div>
                    </div>
                </div>

                <div style={pipelineGridStyle}>
                    {agentPipeline.map((item, index) => (
                        <div key={item.step} style={pipelineItemStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                                <div style={{ width: 32, height: 32, borderRadius: "10px", background: `${item.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: item.color, flexShrink: 0 }}>
                                    {item.icon}
                                </div>
                                <span style={{ fontSize: "10px", fontWeight: 900, color: item.color, letterSpacing: "0.08em" }}>{item.step}</span>
                            </div>
                            <p style={{ margin: "0 0 3px", fontWeight: 900, fontSize: "13px", color: COLORS.navy }}>{item.label}</p>
                            <p style={{ margin: 0, fontSize: "11px", color: COLORS.lightMuted, lineHeight: 1.5 }}>{item.hint}</p>
                            {index < agentPipeline.length - 1 && (
                                <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "100%", height: "1px", background: COLORS.border, zIndex: 0 }} />
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Quick Access ──────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                {quickLinks.map((link) => (
                    <Link key={link.href} href={link.href} style={{ ...quickLinkStyle, textDecoration: "none" }}>
                        <div style={{ width: "4px", background: link.color, borderRadius: "999px", alignSelf: "stretch", flexShrink: 0 }} />
                        <div style={{ padding: "14px", flex: 1 }}>
                            <p style={{ margin: "0 0 2px", fontWeight: 900, fontSize: "14px", color: COLORS.navy }}>{link.label}</p>
                            <p style={{ margin: 0, fontSize: "12px", color: COLORS.lightMuted }}>{link.sub}</p>
                        </div>
                        <span style={{ padding: "0 14px", color: COLORS.lightMuted, fontSize: "18px", alignSelf: "center" }}>←</span>
                    </Link>
                ))}
            </div>

            {/* ── System Status ─────────────────────────────────────── */}
            <section style={sectionCardStyle}>
                <div style={sectionHeaderStyle}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: "3px", background: apiStatus === "online" ? COLORS.green : COLORS.red, borderRadius: "999px", alignSelf: "stretch", flexShrink: 0 }} />
                        <div>
                            <h2 style={sectionTitleStyle}>حالة النظام</h2>
                            <p style={sectionHintStyle}>{apiMessage}</p>
                        </div>
                    </div>
                    <span style={{
                        padding: "4px 12px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 900,
                        background: apiStatus === "online" ? "#f0fdf4" : apiStatus === "offline" ? "#fef2f2" : "#f8fafc",
                        color: apiStatus === "online" ? "#15803d" : apiStatus === "offline" ? "#b91c1c" : COLORS.muted,
                        border: `1px solid ${apiStatus === "online" ? "#bbf7d0" : apiStatus === "offline" ? "#fecaca" : COLORS.border}`,
                    }}>
                        {apiStatus === "loading" ? "جارٍ الفحص..." : apiStatus === "online" ? "متصل" : "غير متصل"}
                    </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                    {[
                        { label: "واجهة الوكيل", status: apiStatus === "online" ? "نشطة" : "غير متصلة", ok: apiStatus === "online" },
                        { label: "قاعدة البيانات", status: apiStatus === "online" ? "متاحة" : "غير معروف", ok: apiStatus === "online" },
                        { label: "خدمة التحليل", status: apiStatus === "online" ? "جاهزة" : "غير معروف", ok: apiStatus === "online" },
                    ].map((item) => (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: COLORS.page, borderRadius: "14px", border: `1px solid ${COLORS.border}` }}>
                            <div style={{ width: 8, height: 8, borderRadius: "999px", background: item.ok ? COLORS.green : COLORS.red, flexShrink: 0 }} />
                            <div>
                                <p style={{ margin: 0, fontSize: "12px", fontWeight: 900, color: COLORS.navy }}>{item.label}</p>
                                <p style={{ margin: 0, fontSize: "11px", color: COLORS.lightMuted }}>{item.status}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: COLORS.page,
    color: COLORS.navy,
    display: "grid",
    gap: "12px",
    fontFamily: FONT,
};

const heroStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    padding: "28px 30px",
    borderRadius: "24px",
    background: "linear-gradient(135deg, #1c1b1c 0%, #232122 60%, #1a1819 100%)",
    boxShadow: "0 24px 56px rgba(35,33,34,0.22)",
};

const heroGlowStyle: CSSProperties = {
    position: "absolute",
    insetInlineEnd: "-40px",
    top: "-60px",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.10)",
    filter: "blur(60px)",
};

const eyebrowStyle: CSSProperties = {
    display: "inline-flex",
    padding: "4px 12px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.15)",
    color: "#7de86a",
    border: "1px solid rgba(89,186,71,0.25)",
    fontWeight: 900,
    fontSize: "11px",
    marginBottom: "10px",
    letterSpacing: "0.04em",
};

const heroTitleStyle: CSSProperties = {
    margin: "0 0 8px",
    fontSize: "28px",
    color: "#ffffff",
    letterSpacing: "-0.03em",
    fontWeight: 950,
};

const heroSubStyle: CSSProperties = {
    margin: 0,
    color: "rgba(255,255,255,0.52)",
    fontSize: "13px",
    lineHeight: 1.75,
    maxWidth: "680px",
};

const sectionCardStyle: CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(35,33,34,0.04)",
    display: "grid",
    gap: "14px",
};

const sectionHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: `1px solid ${COLORS.border}`,
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "16px",
    fontWeight: 900,
    color: COLORS.navy,
    letterSpacing: "-0.02em",
};

const sectionHintStyle: CSSProperties = {
    margin: "3px 0 0",
    color: COLORS.lightMuted,
    fontSize: "12px",
};

const pipelineGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
};

const pipelineItemStyle: CSSProperties = {
    position: "relative",
    background: COLORS.page,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "14px",
};

const quickLinkStyle: CSSProperties = {
    display: "flex",
    alignItems: "stretch",
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(35,33,34,0.04)",
};