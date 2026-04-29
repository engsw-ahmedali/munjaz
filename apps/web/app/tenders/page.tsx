"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { API_BASE_URL } from "@/lib/api";

type Tender = {
    id: number;
    title: string;
    client: string;
    status: string;
    readiness_score: number;
    description: string;
    submission_deadline: string;
};

function normalizeTendersResponse(payload: any): Tender[] {
    if (Array.isArray(payload)) return payload;

    if (Array.isArray(payload?.tenders)) return payload.tenders;

    if (Array.isArray(payload?.items)) return payload.items;

    if (Array.isArray(payload?.data)) return payload.data;

    return [];
}

function statusLabel(status: string) {
    const map: Record<string, string> = {
        UNDER_REVIEW: "قيد المراجعة",
        BID_IN_PROGRESS: "جاري التجهيز",
        CONDITIONAL_BID: "دخول مشروط",
        PASSED: "جاهز للتقديم",
        BLOCKED: "محجوب",
    };

    return map[status] || status;
}

function statusColor(status: string) {
    if (status === "PASSED") return "#16a34a";
    if (status === "BLOCKED") return "#dc2626";
    if (status === "CONDITIONAL_BID") return "#f59e0b";
    if (status === "BID_IN_PROGRESS") return "#2563eb";
    return "#64748b";
}

function scoreColor(score: number) {
    if (score >= 90) return "#16a34a";
    if (score >= 70) return "#0f766e";
    if (score >= 45) return "#f59e0b";
    return "#dc2626";
}

export default function TendersPage() {
    const [tenders, setTenders] = useState<Tender[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [query, setQuery] = useState("");

    async function loadTenders() {
        try {
            setLoading(true);
            setMessage("");

            const response = await fetch(`${API_BASE_URL}/tenders`, {
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const payload = await response.json();
            setTenders(normalizeTendersResponse(payload));
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحميل المناقصات. تأكد أن الباك إند يعمل.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTenders();
    }, []);

    const filteredTenders = useMemo(() => {
        const text = query.trim().toLowerCase();

        if (!text) return tenders;

        return tenders.filter((tender) => {
            return (
                tender.title.toLowerCase().includes(text) ||
                tender.client.toLowerCase().includes(text) ||
                tender.description.toLowerCase().includes(text) ||
                String(tender.id).includes(text)
            );
        });
    }, [query, tenders]);

    const readyCount = tenders.filter((tender) => tender.readiness_score >= 80).length;
    const averageReadiness = tenders.length
        ? Math.round(
            tenders.reduce((total, tender) => total + Number(tender.readiness_score || 0), 0) /
            tenders.length
        )
        : 0;

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div>
                    <span style={pillStyle}>مركز قيادة المنافسات</span>
                    <h1 style={titleStyle}>المناقصات</h1>
                    <p style={subtitleStyle}>
                        ابدأ منافسة جديدة يدويًا أو من ملف كراسة، ثم دع الوكيل يستخرج المتطلبات ويطابقها مع موارد الشركة ويصدر قرار التقديم.
                    </p>
                </div>

                <div style={actionsStyle}>
                    <a href="/tenders/new?mode=file" style={primaryButtonStyle}>
                        إنشاء منافسة من ملف
                    </a>
                    <a href="/tenders/new?mode=manual" style={secondaryButtonStyle}>
                        إضافة منافسة يدويًا
                    </a>
                </div>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            <section style={metricsGridStyle}>
                <MetricCard title="إجمالي المناقصات" value={`${tenders.length}`} hint="كل المنافسات داخل النظام" color="#2563eb" />
                <MetricCard title="متوسط الجاهزية" value={`${averageReadiness}%`} hint="متوسط readiness_score" color={scoreColor(averageReadiness)} />
                <MetricCard title="جاهزة أو قريبة" value={`${readyCount}`} hint="منافسات أعلى من 80%" color="#16a34a" />
                <MetricCard title="مصدر البيانات" value="داخلي" hint="حاليًا من قاعدة بيانات Munjiz" color="#9333ea" />
            </section>

            <section style={toolbarStyle}>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ابحث باسم المنافسة، الجهة، الوصف، أو رقم المنافسة..."
                    style={searchInputStyle}
                />

                <button onClick={loadTenders} style={secondaryButtonStyle}>
                    تحديث القائمة
                </button>
            </section>

            {loading ? <div style={emptyStyle}>جاري تحميل المناقصات...</div> : null}

            {!loading && filteredTenders.length === 0 ? (
                <div style={emptyStyle}>
                    لا توجد مناقصات مطابقة. ابدأ بإنشاء منافسة من ملف أو إدخالها يدويًا.
                </div>
            ) : null}

            <section style={cardsGridStyle}>
                {filteredTenders.map((tender) => (
                    <article key={tender.id} style={cardStyle}>
                        <div style={cardHeaderStyle}>
                            <div>
                                <span
                                    style={{
                                        ...statusPillStyle,
                                        color: statusColor(tender.status),
                                        borderColor: `${statusColor(tender.status)}55`,
                                        background: `${statusColor(tender.status)}12`,
                                    }}
                                >
                                    {statusLabel(tender.status)}
                                </span>

                                <h2 style={cardTitleStyle}>{tender.title}</h2>
                                <p style={clientStyle}>{tender.client}</p>
                            </div>

                            <div style={idBoxStyle}>
                                <span>رقم</span>
                                <strong>{tender.id}</strong>
                            </div>
                        </div>

                        <p style={descriptionStyle}>{tender.description}</p>

                        <div style={miniGridStyle}>
                            <MiniInfo title="آخر موعد" value={tender.submission_deadline} />
                            <MiniInfo title="الجاهزية" value={`${tender.readiness_score}%`} />
                        </div>

                        <div style={progressTrackStyle}>
                            <div
                                style={{
                                    ...progressBarStyle,
                                    width: `${Math.max(0, Math.min(100, tender.readiness_score || 0))}%`,
                                    background: scoreColor(tender.readiness_score || 0),
                                }}
                            />
                        </div>

                        <div style={cardActionsStyle}>
                            <a href={`/tenders/${tender.id}`} style={primaryButtonStyle}>
                                فتح التفاصيل
                            </a>

                            <a href={`/tenders/${tender.id}/reasoning`} style={secondaryButtonStyle}>
                                مذكرة القرار
                            </a>
                        </div>
                    </article>
                ))}
            </section>
        </main>
    );
}

function MetricCard({
    title,
    value,
    hint,
    color,
}: {
    title: string;
    value: string;
    hint: string;
    color: string;
}) {
    return (
        <div style={{ ...metricCardStyle, borderRight: `6px solid ${color}` }}>
            <div style={smallLabelStyle}>{title}</div>
            <strong style={{ color, fontSize: "32px" }}>{value}</strong>
            <p style={metricHintStyle}>{hint}</p>
        </div>
    );
}

function MiniInfo({ title, value }: { title: string; value: string }) {
    return (
        <div style={miniInfoStyle}>
            <div style={smallLabelStyle}>{title}</div>
            <strong>{value}</strong>
        </div>
    );
}

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    padding: "32px",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
};

const heroStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "22px",
    alignItems: "center",
    padding: "28px",
    borderRadius: "26px",
    border: "1px solid #d1fae5",
    background:
        "linear-gradient(135deg, rgba(236,253,245,1) 0%, rgba(255,255,255,1) 58%, rgba(239,246,255,1) 100%)",
    boxShadow: "0 18px 45px rgba(15,23,42,0.06)",
    marginBottom: "20px",
};

const pillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "7px 13px",
    borderRadius: "999px",
    background: "#ecfeff",
    color: "#0f766e",
    border: "1px solid #99f6e4",
    fontWeight: 900,
    fontSize: "12px",
    marginBottom: "10px",
};

const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: "34px",
};

const subtitleStyle: CSSProperties = {
    margin: "10px 0 0",
    color: "#64748b",
    lineHeight: 1.9,
    maxWidth: "850px",
};

const actionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
};

const primaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "16px",
    padding: "13px 18px",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 14px 30px rgba(15,23,42,0.16)",
};

const secondaryButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    padding: "12px 17px",
    background: "white",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
};

const errorStyle: CSSProperties = {
    padding: "16px",
    borderRadius: "16px",
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 800,
    marginBottom: "18px",
};

const metricsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "18px",
};

const metricCardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const smallLabelStyle: CSSProperties = {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "7px",
};

const metricHintStyle: CSSProperties = {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "12px",
};

const toolbarStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "12px",
    marginBottom: "18px",
};

const searchInputStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "18px",
    padding: "14px 16px",
    fontWeight: 800,
    outline: "none",
    background: "white",
};

const emptyStyle: CSSProperties = {
    padding: "34px",
    borderRadius: "20px",
    background: "white",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontWeight: 900,
    textAlign: "center",
};

const cardsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "20px",
    boxShadow: "0 16px 38px rgba(15,23,42,0.055)",
};

const cardHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    marginBottom: "14px",
};

const statusPillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "6px 11px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "12px",
    fontWeight: 900,
};

const cardTitleStyle: CSSProperties = {
    margin: "12px 0 6px",
    fontSize: "22px",
};

const clientStyle: CSSProperties = {
    margin: 0,
    color: "#64748b",
    fontWeight: 800,
};

const idBoxStyle: CSSProperties = {
    minWidth: "70px",
    height: "70px",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 900,
};

const descriptionStyle: CSSProperties = {
    margin: "0 0 14px",
    color: "#334155",
    lineHeight: 1.8,
};

const miniGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginBottom: "12px",
};

const miniInfoStyle: CSSProperties = {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: "16px",
    padding: "13px",
};

const progressTrackStyle: CSSProperties = {
    height: "9px",
    borderRadius: "999px",
    background: "#e2e8f0",
    overflow: "hidden",
    marginBottom: "16px",
};

const progressBarStyle: CSSProperties = {
    height: "100%",
    borderRadius: "999px",
};

const cardActionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
};