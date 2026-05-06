"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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

type StatusFilter =
    | "ALL"
    | "READY"
    | "IN_PROGRESS"
    | "BLOCKED"
    | "CONDITIONAL"
    | "REVIEW";

function normalizeTendersResponse(payload: any): Tender[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.tenders)) return payload.tenders;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function getStatusMeta(status: string) {
    const normalized = String(status || "").toUpperCase();

    const map: Record<
        string,
        {
            label: string;
            color: string;
            background: string;
            border: string;
        }
    > = {
        UNDER_REVIEW: {
            label: "قيد المراجعة",
            color: "#64748b",
            background: "#f8fafc",
            border: "#cbd5e1",
        },
        BID_IN_PROGRESS: {
            label: "جاري التجهيز",
            color: "#2563eb",
            background: "#eff6ff",
            border: "#bfdbfe",
        },
        CONDITIONAL_BID: {
            label: "دخول مشروط",
            color: "#b45309",
            background: "#fffbeb",
            border: "#fde68a",
        },
        PASSED: {
            label: "جاهز للتقديم",
            color: "#15803d",
            background: "#f0fdf4",
            border: "#bbf7d0",
        },
        BLOCKED: {
            label: "محجوب",
            color: "#b91c1c",
            background: "#fef2f2",
            border: "#fecaca",
        },
        CLOSED: {
            label: "مغلقة",
            color: "#475569",
            background: "#f8fafc",
            border: "#cbd5e1",
        },
        ARCHIVED: {
            label: "مؤرشفة",
            color: "#475569",
            background: "#f8fafc",
            border: "#cbd5e1",
        },
    };

    return (
        map[normalized] || {
            label: status || "غير محدد",
            color: "#475569",
            background: "#f8fafc",
            border: "#cbd5e1",
        }
    );
}

function scoreColor(score: number) {
    if (score >= 90) return "#15803d";
    if (score >= 80) return "#59BA47";
    if (score >= 65) return "#0f766e";
    if (score >= 45) return "#d97706";
    return "#dc2626";
}

function decisionLabel(score: number) {
    if (score >= 90) return "جاهزية عالية";
    if (score >= 80) return "جاهز غالبًا";
    if (score >= 65) return "بحاجة تدعيم";
    if (score >= 45) return "مخاطر متوسطة";
    return "غير جاهز";
}

function formatDate(value: string) {
    if (!value) return "غير محدد";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toISOString().slice(0, 10);
}

function matchesFilter(tender: Tender, filter: StatusFilter) {
    const status = String(tender.status || "").toUpperCase();
    const score = Number(tender.readiness_score || 0);

    if (filter === "ALL") return true;
    if (filter === "READY") return score >= 80 || status === "PASSED";
    if (filter === "IN_PROGRESS") return status === "BID_IN_PROGRESS";
    if (filter === "BLOCKED") return status === "BLOCKED";
    if (filter === "CONDITIONAL") return status === "CONDITIONAL_BID";
    if (filter === "REVIEW") return status === "UNDER_REVIEW";

    return true;
}

export default function TendersPage() {
    const [tenders, setTenders] = useState<Tender[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

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
            setMessage("تعذر تحميل المنافسات. تأكد أن الباك إند يعمل.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTenders();
    }, []);

    const stats = useMemo(() => {
        const total = tenders.length;
        const averageReadiness = total
            ? Math.round(
                tenders.reduce(
                    (sum, tender) => sum + Number(tender.readiness_score || 0),
                    0
                ) / total
            )
            : 0;

        const readyCount = tenders.filter(
            (tender) =>
                Number(tender.readiness_score || 0) >= 80 ||
                String(tender.status || "").toUpperCase() === "PASSED"
        ).length;

        const blockedCount = tenders.filter(
            (tender) => String(tender.status || "").toUpperCase() === "BLOCKED"
        ).length;

        const inProgressCount = tenders.filter((tender) =>
            ["BID_IN_PROGRESS", "UNDER_REVIEW", "CONDITIONAL_BID"].includes(
                String(tender.status || "").toUpperCase()
            )
        ).length;

        const bestReadiness = total
            ? Math.max(...tenders.map((tender) => Number(tender.readiness_score || 0)))
            : 0;

        return {
            total,
            averageReadiness,
            readyCount,
            blockedCount,
            inProgressCount,
            bestReadiness,
        };
    }, [tenders]);

    const filteredTenders = useMemo(() => {
        const text = query.trim().toLowerCase();

        return tenders.filter((tender) => {
            const matchesText =
                !text ||
                tender.title?.toLowerCase().includes(text) ||
                tender.client?.toLowerCase().includes(text) ||
                tender.description?.toLowerCase().includes(text) ||
                String(tender.id).includes(text);

            return matchesText && matchesFilter(tender, statusFilter);
        });
    }, [query, tenders, statusFilter]);

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div style={heroPatternStyle} />

                <div style={heroTextStyle}>
                    <span style={eyebrowStyle}>مركز قيادة المنافسات</span>
                    <h1 style={titleStyle}>المنافسات</h1>
                    <p style={subtitleStyle}>
                        مساحة تشغيلية لمتابعة فرص الشركة، تحليل كراسات المنافسات، قياس
                        الجاهزية، وتوجيه الفريق نحو قرار تقديم واضح ومدعوم بالأدلة.
                    </p>
                </div>

                <div style={heroActionClusterStyle}>
                    <Link href="/tenders/new?mode=file" style={primaryButtonStyle}>
                        إنشاء من ملف
                    </Link>
                    <Link href="/tenders/new?mode=manual" style={secondaryButtonStyle}>
                        إدخال يدوي
                    </Link>
                </div>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            <section style={bentoGridStyle}>
                <MetricCard
                    title="إجمالي المنافسات"
                    value={`${stats.total}`}
                    hint="كل الفرص المسجلة داخل النظام"
                    color="#2563eb"
                />

                <MetricCard
                    title="متوسط الجاهزية"
                    value={`${stats.averageReadiness}%`}
                    hint="متوسط جاهزية فرص التقديم"
                    color={scoreColor(stats.averageReadiness)}
                    emphasis
                />

                <MetricCard
                    title="جاهزة أو قريبة"
                    value={`${stats.readyCount}`}
                    hint="فرص تتجاوز عتبة 80%"
                    color={brand.green}
                />

                <MetricCard
                    title="قيد التجهيز"
                    value={`${stats.inProgressCount}`}
                    hint="فرص تحتاج متابعة تشغيلية"
                    color="#0f766e"
                />

                <MetricCard
                    title="محجوبة"
                    value={`${stats.blockedCount}`}
                    hint="فرص متوقفة بسبب فجوات حرجة"
                    color="#dc2626"
                />
            </section>

            <section style={controlPanelStyle}>
                <div style={searchWrapStyle}>
                    <span style={controlLabelStyle}>بحث سريع</span>
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ابحث باسم المنافسة، الجهة، الوصف، أو رقم المنافسة..."
                        style={searchInputStyle}
                    />
                </div>

                <div style={filterWrapStyle}>
                    <span style={controlLabelStyle}>تصفية حسب الحالة</span>
                    <div style={filterButtonsStyle}>
                        <FilterButton
                            active={statusFilter === "ALL"}
                            onClick={() => setStatusFilter("ALL")}
                        >
                            الكل
                        </FilterButton>
                        <FilterButton
                            active={statusFilter === "READY"}
                            onClick={() => setStatusFilter("READY")}
                        >
                            جاهزة
                        </FilterButton>
                        <FilterButton
                            active={statusFilter === "IN_PROGRESS"}
                            onClick={() => setStatusFilter("IN_PROGRESS")}
                        >
                            قيد التجهيز
                        </FilterButton>
                        <FilterButton
                            active={statusFilter === "CONDITIONAL"}
                            onClick={() => setStatusFilter("CONDITIONAL")}
                        >
                            مشروطة
                        </FilterButton>
                        <FilterButton
                            active={statusFilter === "BLOCKED"}
                            onClick={() => setStatusFilter("BLOCKED")}
                        >
                            محجوبة
                        </FilterButton>
                    </div>
                </div>

                <button onClick={loadTenders} style={refreshButtonStyle}>
                    تحديث
                </button>
            </section>

            <section style={sectionHeaderStyle}>
                <div>
                    <h2 style={sectionTitleStyle}>قائمة الفرص</h2>
                    <p style={sectionHintStyle}>
                        {loading
                            ? "جاري تحميل بيانات المنافسات..."
                            : `${filteredTenders.length} فرصة ظاهرة من أصل ${tenders.length}`}
                    </p>
                </div>
            </section>

            {loading ? (
                <section style={cardsGridStyle}>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </section>
            ) : null}

            {!loading && filteredTenders.length === 0 ? (
                <EmptyState />
            ) : null}

            {!loading && filteredTenders.length > 0 ? (
                <section style={cardsGridStyle}>
                    {filteredTenders.map((tender) => (
                        <TenderCard key={tender.id} tender={tender} />
                    ))}
                </section>
            ) : null}
        </main>
    );
}

function TenderCard({ tender }: { tender: Tender }) {
    const score = Number(tender.readiness_score || 0);
    const status = getStatusMeta(tender.status);
    const scoreAccent = scoreColor(score);

    return (
        <article style={cardStyle}>
            <div style={cardAccentStyle} />

            <div style={cardTopStyle}>
                <div style={idBoxStyle}>
                    <span>رقم</span>
                    <strong>{tender.id}</strong>
                </div>

                <span
                    style={{
                        ...statusPillStyle,
                        color: status.color,
                        background: status.background,
                        borderColor: status.border,
                    }}
                >
                    {status.label}
                </span>
            </div>

            <div style={cardBodyStyle}>
                <h2 style={cardTitleStyle}>{tender.title}</h2>
                <p style={clientStyle}>{tender.client}</p>
                <p style={descriptionStyle}>
                    {tender.description || "لا يوجد وصف متاح لهذه المنافسة."}
                </p>
            </div>

            <div style={insightRowStyle}>
                <MiniInfo title="آخر موعد" value={formatDate(tender.submission_deadline)} />
                <MiniInfo title="قرار مبدئي" value={decisionLabel(score)} />
            </div>

            <div style={readinessBlockStyle}>
                <div style={readinessHeaderStyle}>
                    <span>الجاهزية</span>
                    <strong style={{ color: scoreAccent }}>{score}%</strong>
                </div>

                <div style={progressTrackStyle}>
                    <div
                        style={{
                            ...progressBarStyle,
                            width: `${Math.max(0, Math.min(100, score))}%`,
                            background: scoreAccent,
                        }}
                    />
                </div>
            </div>

            <div style={cardActionsStyle}>
                <Link href={`/tenders/${tender.id}`} style={primarySmallButtonStyle}>
                    فتح التفاصيل
                </Link>

                <Link href={`/tenders/${tender.id}/reasoning`} style={secondarySmallButtonStyle}>
                    مذكرة القرار
                </Link>

                <Link href={`/workbench?tenderId=${tender.id}`} style={ghostSmallButtonStyle}>
                    مساحة العمل
                </Link>
            </div>
        </article>
    );
}

function MetricCard({
    title,
    value,
    hint,
    color,
    emphasis,
}: {
    title: string;
    value: string;
    hint: string;
    color: string;
    emphasis?: boolean;
}) {
    return (
        <div
            style={{
                ...metricCardStyle,
                ...(emphasis ? metricCardEmphasisStyle : {}),
                borderTop: `4px solid ${color}`,
            }}
        >
            <div style={smallLabelStyle}>{title}</div>
            <strong style={{ color, fontSize: emphasis ? "34px" : "30px" }}>
                {value}
            </strong>
            <p style={metricHintStyle}>{hint}</p>
        </div>
    );
}

function MiniInfo({ title, value }: { title: string; value: string }) {
    return (
        <div style={miniInfoStyle}>
            <span>{title}</span>
            <strong>{value || "غير محدد"}</strong>
        </div>
    );
}

function FilterButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                ...filterButtonStyle,
                ...(active ? filterButtonActiveStyle : {}),
            }}
        >
            {children}
        </button>
    );
}

function SkeletonCard() {
    return (
        <div style={cardStyle}>
            <div style={skeletonLineWideStyle} />
            <div style={skeletonLineStyle} />
            <div style={skeletonBoxStyle} />
            <div style={skeletonLineStyle} />
        </div>
    );
}

function EmptyState() {
    return (
        <div style={emptyStyle}>
            <div style={emptyIconStyle}>＋</div>
            <h3 style={emptyTitleStyle}>لا توجد منافسات مطابقة</h3>
            <p style={emptyTextStyle}>
                جرّب تغيير الفلاتر أو ابدأ بإضافة منافسة جديدة من ملف كراسة.
            </p>
            <Link href="/tenders/new?mode=file" style={primaryButtonStyle}>
                إنشاء منافسة من ملف
            </Link>
        </div>
    );
}

const brand = {
    green: "#59BA47",
    greenDark: "#3f9633",
    dark: "#232122",
    background: "#F4F6F6",
    card: "#ffffff",
    border: "#DFE7E4",
    muted: "#6B7280",
};

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: brand.background,
    color: brand.dark,
    display: "grid",
    gap: "18px",
};

const heroStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    justifyContent: "space-between",
    gap: "22px",
    alignItems: "center",
    padding: "26px 28px",
    borderRadius: "30px",
    border: "1px solid rgba(89,186,71,0.22)",
    background:
        "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(248,250,249,1) 58%, rgba(236,253,245,0.9) 100%)",
    boxShadow: "0 18px 45px rgba(35,33,34,0.055)",
};

const heroPatternStyle: CSSProperties = {
    position: "absolute",
    insetInlineStart: "-60px",
    top: "-70px",
    width: "220px",
    height: "220px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.08)",
    filter: "blur(2px)",
};

const heroTextStyle: CSSProperties = {
    position: "relative",
    maxWidth: "860px",
    zIndex: 1,
};

const eyebrowStyle: CSSProperties = {
    display: "inline-flex",
    padding: "7px 13px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.1)",
    color: brand.greenDark,
    border: "1px solid rgba(89,186,71,0.32)",
    fontWeight: 900,
    fontSize: "12px",
    marginBottom: "10px",
};

const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: "34px",
    color: brand.dark,
    letterSpacing: "-0.04em",
};

const subtitleStyle: CSSProperties = {
    margin: "10px 0 0",
    color: brand.muted,
    lineHeight: 1.9,
    maxWidth: "820px",
    fontWeight: 600,
};

const heroActionClusterStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
};

const primaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "15px",
    padding: "12px 17px",
    background: brand.dark,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 26px rgba(35,33,34,0.18)",
};

const secondaryButtonStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "15px",
    padding: "11px 16px",
    background: "white",
    color: brand.dark,
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
};

const errorStyle: CSSProperties = {
    padding: "15px 16px",
    borderRadius: "18px",
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 800,
};

const bentoGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
};

const metricCardStyle: CSSProperties = {
    background: brand.card,
    border: `1px solid ${brand.border}`,
    borderRadius: "22px",
    padding: "17px",
    boxShadow: "0 12px 30px rgba(35,33,34,0.04)",
    minHeight: "124px",
};

const metricCardEmphasisStyle: CSSProperties = {
    background:
        "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,253,244,0.92) 100%)",
};

const smallLabelStyle: CSSProperties = {
    color: "#8a9591",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "7px",
};

const metricHintStyle: CSSProperties = {
    margin: "8px 0 0",
    color: brand.muted,
    fontSize: "12px",
    lineHeight: 1.7,
};

const controlPanelStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1fr) minmax(300px, auto) auto",
    gap: "12px",
    alignItems: "end",
    padding: "14px",
    borderRadius: "22px",
    background: "rgba(255,255,255,0.82)",
    border: `1px solid ${brand.border}`,
    boxShadow: "0 10px 26px rgba(35,33,34,0.035)",
};

const searchWrapStyle: CSSProperties = {
    display: "grid",
    gap: "7px",
};

const filterWrapStyle: CSSProperties = {
    display: "grid",
    gap: "7px",
};

const controlLabelStyle: CSSProperties = {
    fontSize: "12px",
    color: brand.muted,
    fontWeight: 900,
};

const searchInputStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "16px",
    padding: "13px 15px",
    fontWeight: 800,
    outline: "none",
    background: "white",
    color: brand.dark,
    minHeight: "46px",
};

const filterButtonsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
};

const filterButtonStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    background: "white",
    color: brand.dark,
    borderRadius: "999px",
    padding: "10px 13px",
    fontSize: "12px",
    fontWeight: 900,
};

const filterButtonActiveStyle: CSSProperties = {
    background: brand.dark,
    color: "white",
    borderColor: brand.dark,
};

const refreshButtonStyle: CSSProperties = {
    ...secondaryButtonStyle,
    minHeight: "46px",
};

const sectionHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    marginTop: "2px",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "20px",
    color: brand.dark,
};

const sectionHintStyle: CSSProperties = {
    margin: "6px 0 0",
    color: brand.muted,
    fontSize: "13px",
    fontWeight: 700,
};

const emptyStyle: CSSProperties = {
    padding: "38px",
    borderRadius: "24px",
    background: "white",
    border: `1px dashed ${brand.border}`,
    color: brand.muted,
    fontWeight: 900,
    textAlign: "center",
    display: "grid",
    justifyItems: "center",
    gap: "10px",
};

const emptyIconStyle: CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    background: "rgba(89,186,71,0.1)",
    color: brand.greenDark,
    fontSize: "28px",
};

const emptyTitleStyle: CSSProperties = {
    margin: "4px 0 0",
    color: brand.dark,
    fontSize: "20px",
};

const emptyTextStyle: CSSProperties = {
    margin: 0,
    color: brand.muted,
    lineHeight: 1.8,
};

const cardsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(390px, 1fr))",
    gap: "16px",
};

const cardStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    background: "white",
    border: `1px solid ${brand.border}`,
    borderRadius: "26px",
    padding: "20px",
    boxShadow: "0 14px 34px rgba(35,33,34,0.052)",
    display: "grid",
    gap: "14px",
};

const cardAccentStyle: CSSProperties = {
    position: "absolute",
    insetInlineStart: 0,
    top: 0,
    bottom: 0,
    width: 4,
    background: brand.green,
};

const cardTopStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "center",
};

const idBoxStyle: CSSProperties = {
    minWidth: "60px",
    height: "60px",
    borderRadius: "17px",
    border: `1px solid ${brand.border}`,
    background: "#fbfdfc",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: brand.muted,
    fontSize: "12px",
    fontWeight: 900,
};

const statusPillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "7px 12px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "12px",
    fontWeight: 900,
};

const cardBodyStyle: CSSProperties = {
    display: "grid",
    gap: "6px",
    minHeight: "112px",
};

const cardTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "21px",
    color: brand.dark,
    letterSpacing: "-0.02em",
    lineHeight: 1.45,
};

const clientStyle: CSSProperties = {
    margin: 0,
    color: "#51615c",
    fontWeight: 900,
};

const descriptionStyle: CSSProperties = {
    margin: 0,
    color: "#475569",
    lineHeight: 1.8,
    fontWeight: 600,
};

const insightRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
};

const miniInfoStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    background: "#fbfdfc",
    borderRadius: "16px",
    padding: "12px 13px",
    display: "grid",
    gap: "5px",
};

const readinessBlockStyle: CSSProperties = {
    display: "grid",
    gap: "8px",
};

const readinessHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: brand.muted,
    fontSize: "13px",
    fontWeight: 900,
};

const progressTrackStyle: CSSProperties = {
    height: "9px",
    borderRadius: "999px",
    background: "#e8eeec",
    overflow: "hidden",
};

const progressBarStyle: CSSProperties = {
    height: "100%",
    borderRadius: "999px",
};

const cardActionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    paddingTop: "2px",
};

const primarySmallButtonStyle: CSSProperties = {
    ...primaryButtonStyle,
    padding: "10px 14px",
    borderRadius: "14px",
    fontSize: "13px",
};

const secondarySmallButtonStyle: CSSProperties = {
    ...secondaryButtonStyle,
    padding: "10px 13px",
    borderRadius: "14px",
    fontSize: "13px",
};

const ghostSmallButtonStyle: CSSProperties = {
    border: "1px solid rgba(89,186,71,0.34)",
    borderRadius: "14px",
    padding: "10px 13px",
    background: "rgba(89,186,71,0.08)",
    color: brand.greenDark,
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
};

const skeletonLineWideStyle: CSSProperties = {
    height: 22,
    width: "70%",
    borderRadius: 999,
    background: "#eef3f1",
};

const skeletonLineStyle: CSSProperties = {
    height: 16,
    width: "48%",
    borderRadius: 999,
    background: "#eef3f1",
};

const skeletonBoxStyle: CSSProperties = {
    height: 90,
    borderRadius: 18,
    background: "#f2f6f4",
};