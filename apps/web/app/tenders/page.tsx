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

function getAgentRecommendation(tender: Tender) {
    const score = Number(tender.readiness_score || 0);
    const status = String(tender.status || "").toUpperCase();

    if (status === "BLOCKED" || score < 45) {
        return {
            label: "لا يعتمد الآن",
            tone: "red",
            color: "#b91c1c",
            background: "#fff1f2",
            border: "#fecdd3",
            summary: "توصية الوكيل: أوقف التقديم مؤقتًا حتى إغلاق الفجوات الحرجة وتثبيت الأدلة المطلوبة.",
            nextAction: "راجع بوابة التقديم ومصفوفة الأدلة",
        };
    }

    if (status === "CONDITIONAL_BID" || (score >= 45 && score < 65)) {
        return {
            label: "دخول مشروط",
            tone: "amber",
            color: "#b45309",
            background: "#fffbeb",
            border: "#fde68a",
            summary: "توصية الوكيل: يمكن دراسة الدخول بشرط تدعيم الأدلة وإغلاق البنود عالية الحساسية قبل الاعتماد.",
            nextAction: "أغلق مهام الفجوات أولًا",
        };
    }

    if (status === "BID_IN_PROGRESS" || (score >= 65 && score < 80)) {
        return {
            label: "قابل للتجهيز",
            tone: "teal",
            color: "#0f766e",
            background: "#ecfdf5",
            border: "#a7f3d0",
            summary: "توصية الوكيل: الفرصة واعدة، لكنها تحتاج متابعة تشغيلية وتوثيق أقوى قبل قرار التقديم النهائي.",
            nextAction: "استكمل المستندات والموارد",
        };
    }

    if (score >= 80 && score < 90) {
        return {
            label: "مناسب مبدئيًا",
            tone: "green",
            color: brand.greenDark,
            background: "#f0fdf4",
            border: "#bbf7d0",
            summary: "توصية الوكيل: مناسب مبدئيًا للتقديم مع مراجعة الأدلة النهائية قبل الاعتماد.",
            nextAction: "راجع مذكرة القرار",
        };
    }

    return {
        label: "جاهز للتقديم",
        tone: "green",
        color: "#15803d",
        background: "#f0fdf4",
        border: "#bbf7d0",
        summary: "توصية الوكيل: الجاهزية مرتفعة، ويمكن الانتقال لمراجعة الاعتماد النهائي ومذكرة القرار.",
        nextAction: "افتح التفاصيل للاعتماد",
    };
}

function getDeadlineMeta(value: string) {
    if (!value) {
        return { label: "موعد غير محدد", color: "#64748b", background: "#f8fafc", border: "#cbd5e1" };
    }

    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) {
        return { label: "موعد يحتاج مراجعة", color: "#64748b", background: "#f8fafc", border: "#cbd5e1" };
    }

    const today = new Date();
    const ms = deadline.getTime() - today.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));

    if (days < 0) {
        return { label: "منتهي", color: "#b91c1c", background: "#fef2f2", border: "#fecaca" };
    }
    if (days <= 7) {
        return { label: `${days} أيام متبقية`, color: "#b45309", background: "#fffbeb", border: "#fde68a" };
    }
    if (days <= 21) {
        return { label: `${days} يوم للتقديم`, color: "#0f766e", background: "#ecfdf5", border: "#a7f3d0" };
    }

    return { label: "وقت كافٍ للمراجعة", color: "#15803d", background: "#f0fdf4", border: "#bbf7d0" };
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
                        قائمة فرص تشغيلية يقيّمها الوكيل حسب الجاهزية، قوة الأدلة، المخاطر،
                        والموعد النهائي حتى ينتقل الفريق من متابعة الفرص إلى قرار Bid / No-Bid واضح.
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
                        <FilterButton
                            active={statusFilter === "REVIEW"}
                            onClick={() => setStatusFilter("REVIEW")}
                        >
                            مراجعة
                        </FilterButton>
                    </div>
                </div>

                <button onClick={loadTenders} style={refreshButtonStyle}>
                    تحديث
                </button>
            </section>

            <section style={sectionHeaderStyle}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ width: "3px", background: brand.green, borderRadius: "999px", alignSelf: "stretch", flexShrink: 0 }} />
                    <div>
                        <h2 style={sectionTitleStyle}>قائمة فرص التقديم</h2>
                        <p style={sectionHintStyle}>
                            {loading
                                ? "جاري تحميل بيانات المنافسات..."
                                : `${filteredTenders.length} فرصة يعرضها الوكيل من أصل ${tenders.length}`}
                        </p>
                    </div>
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
    const recommendation = getAgentRecommendation(tender);
    const deadline = getDeadlineMeta(tender.submission_deadline);

    return (
        <article style={cardStyle}>
            <div style={{ ...cardAccentStyle, background: scoreAccent }} />

            <div style={cardTopStyle}>
                <div style={cardIdentityStyle}>
                    <div style={idBoxStyle}>
                        <span>رقم</span>
                        <strong>{tender.id}</strong>
                    </div>

                    <div style={cardStatusStackStyle}>
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
                        <span style={agentMiniLabelStyle}>وكيل منجز يراقب الفرصة</span>
                    </div>
                </div>

                <span
                    style={{
                        ...deadlinePillStyle,
                        color: deadline.color,
                        background: deadline.background,
                        borderColor: deadline.border,
                    }}
                >
                    {deadline.label}
                </span>
            </div>

            <div style={cardBodyStyle}>
                <h2 style={cardTitleStyle}>{tender.title}</h2>
                <p style={clientStyle}>{tender.client}</p>
                <p style={descriptionStyle}>
                    {tender.description || "لا يوجد وصف متاح لهذه المنافسة."}
                </p>
            </div>

            <div
                style={{
                    ...agentRecommendationStyle,
                    background: recommendation.background,
                    borderColor: recommendation.border,
                }}
            >
                <div style={agentRecommendationHeaderStyle}>
                    <span style={agentRecommendationTitleStyle}>توصية الوكيل</span>
                    <strong style={{ color: recommendation.color, fontSize: "12px" }}>{recommendation.label}</strong>
                </div>
                <p style={agentRecommendationTextStyle}>{recommendation.summary}</p>
                <div style={agentChipRowStyle}>
                    <span style={{ ...agentChipStyle, color: recommendation.color, borderColor: recommendation.border, background: recommendation.background }}>
                        {recommendation.nextAction}
                    </span>
                </div>
            </div>

            <div style={insightRowStyle}>
                <MiniInfo title="آخر موعد" value={formatDate(tender.submission_deadline)} />
                <MiniInfo title="قرار مبدئي" value={decisionLabel(score)} />
                <MiniInfo title="حالة المتابعة" value={status.label} />
            </div>

            <div style={readinessBlockStyle}>
                <div style={readinessHeaderStyle}>
                    <span>جاهزية التقديم حسب الوكيل</span>
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
                    فتح مركز القرار
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
            }}
        >
            {/* Left accent bar (RTL: insetInlineStart) */}
            <div style={{ width: "4px", background: color, flexShrink: 0 }} />
            <div style={{ padding: "14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={smallLabelStyle}>{title}</div>
                <strong style={{ color, fontSize: emphasis ? "32px" : "28px", fontWeight: 950, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {value}
                </strong>
                <p style={metricHintStyle}>{hint}</p>
            </div>
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
    borderRadius: "26px",
    background: "linear-gradient(135deg, #1c1b1c 0%, #232122 60%, #1a1819 100%)",
    boxShadow: "0 24px 56px rgba(35,33,34,0.22)",
};

const heroPatternStyle: CSSProperties = {
    position: "absolute",
    insetInlineEnd: "-40px",
    top: "-60px",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.10)",
    filter: "blur(60px)",
};

const heroTextStyle: CSSProperties = {
    position: "relative",
    maxWidth: "860px",
    zIndex: 1,
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

const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: "30px",
    color: "#ffffff",
    letterSpacing: "-0.04em",
    fontWeight: 950,
};

const subtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.8,
    maxWidth: "820px",
    fontWeight: 600,
    fontSize: "13px",
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
    borderRadius: "14px",
    padding: "11px 18px",
    background: brand.green,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 8px 20px ${brand.green}44`,
    fontSize: "13px",
};

const secondaryButtonStyle: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "14px",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
};

const metricCardStyle: CSSProperties = {
    background: brand.card,
    border: `1px solid ${brand.border}`,
    borderRadius: "18px",
    padding: "0",
    boxShadow: "0 2px 10px rgba(35,33,34,0.04)",
    minHeight: "108px",
    display: "flex",
    overflow: "hidden",
};

const metricCardEmphasisStyle: CSSProperties = {
    background: "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,253,244,0.92) 100%)",
};

const smallLabelStyle: CSSProperties = {
    color: "#8a9591",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "6px",
};

const metricHintStyle: CSSProperties = {
    margin: "6px 0 0",
    color: brand.muted,
    fontSize: "11px",
    lineHeight: 1.6,
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
    background: brand.green,
    color: "white",
    borderColor: brand.green,
    boxShadow: `0 4px 12px ${brand.green}44`,
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
    paddingBottom: "10px",
    borderBottom: `1px solid ${brand.border}`,
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "17px",
    color: brand.dark,
    fontWeight: 900,
    letterSpacing: "-0.02em",
};

const sectionHintStyle: CSSProperties = {
    margin: "4px 0 0",
    color: brand.muted,
    fontSize: "12px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
    gap: "12px",
};

const cardStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    background: "white",
    border: `1px solid ${brand.border}`,
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(35,33,34,0.04)",
    display: "grid",
    gap: "12px",
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

const cardIdentityStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
};

const cardStatusStackStyle: CSSProperties = {
    display: "grid",
    gap: "5px",
    justifyItems: "start",
};

const agentMiniLabelStyle: CSSProperties = {
    color: "#8a9591",
    fontSize: "11px",
    fontWeight: 900,
};

const deadlinePillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "7px 11px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
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
    gap: "4px",
    minHeight: "80px",
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
    lineHeight: 1.7,
    fontWeight: 600,
    fontSize: "13px",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
};

const agentRecommendationStyle: CSSProperties = {
    border: "1px solid",
    borderRadius: "14px",
    padding: "10px 12px",
    display: "grid",
    gap: "6px",
};

const agentRecommendationHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
};

const agentRecommendationTitleStyle: CSSProperties = {
    color: brand.dark,
    fontSize: "12px",
    fontWeight: 950,
};

const agentRecommendationTextStyle: CSSProperties = {
    margin: 0,
    color: "#475569",
    fontSize: "12px",
    lineHeight: 1.65,
    fontWeight: 700,
};

const agentChipRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
};

const agentChipStyle: CSSProperties = {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: "999px",
    border: `1px solid ${brand.border}`,
    background: "rgba(255,255,255,0.72)",
    color: "#51615c",
    fontSize: "11px",
    fontWeight: 900,
};

const insightRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
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
    border: "0",
    borderRadius: "12px",
    padding: "9px 16px",
    background: brand.dark,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    boxShadow: "0 4px 12px rgba(35,33,34,0.16)",
};

const secondarySmallButtonStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "12px",
    padding: "8px 13px",
    background: "white",
    color: brand.dark,
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
};

const ghostSmallButtonStyle: CSSProperties = {
    border: "1px solid rgba(89,186,71,0.30)",
    borderRadius: "12px",
    padding: "8px 13px",
    background: "rgba(89,186,71,0.07)",
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