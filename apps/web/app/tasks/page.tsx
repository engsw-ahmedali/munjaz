"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { API_BASE_URL } from "@/lib/api";

type GapTask = {
    id: number;
    tender_id: number;
    requirement_title: string;
    title: string;
    description: string;
    owner_role: string;
    owner_name: string;
    owner_department: string;
    priority: string;
    status: string;
    evidence_type: string;
    impact_score: number;
    due_date?: string;
    verification_status: string;
    created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
    OPEN: "مفتوحة",
    IN_PROGRESS: "قيد التنفيذ",
    WAITING_REVIEW: "بانتظار مراجعة",
    WAITING_MANAGER_APPROVAL: "بانتظار اعتماد المدير",
    CLOSED: "مغلقة",
    BLOCKED: "محجوبة",
};

const PRIORITY_LABEL: Record<string, string> = {
    عالية: "عالية",
    متوسطة: "متوسطة",
    منخفضة: "منخفضة",
};

function statusColor(status: string) {
    const map: Record<string, { bg: string; text: string; border: string }> = {
        OPEN:                      { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
        IN_PROGRESS:               { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
        WAITING_REVIEW:            { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
        WAITING_MANAGER_APPROVAL:  { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
        CLOSED:                    { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" },
        BLOCKED:                   { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
    };
    return map[status] || { bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" };
}

function priorityColor(priority: string) {
    if (priority === "عالية") return "#dc2626";
    if (priority === "متوسطة") return "#d97706";
    return "#64748b";
}

type TenderListItem = {
    id: number;
    title: string;
    client: string;
    status: string;
    readiness_score: number;
    submission_deadline: string;
};

export default function TasksPage() {
    const [tenderId, setTenderId] = useState("");
    const [tenders, setTenders] = useState<TenderListItem[]>([]);
    const [tendersLoading, setTendersLoading] = useState(false);
    const [tendersError, setTendersError] = useState("");
    const [tasks, setTasks] = useState<GapTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterPriority, setFilterPriority] = useState("all");
    const [search, setSearch] = useState("");

    async function loadTenders() {
        setTendersLoading(true);
        setTendersError("");
        try {
            const response = await fetch(`${API_BASE_URL}/tenders`, { cache: "no-store" });
            if (!response.ok) throw new Error(await response.text());
            const payload = await response.json();
            const list: TenderListItem[] = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.tenders)
                ? payload.tenders
                : [];
            setTenders(list);
            if (list.length > 0) {
                const firstId = String(list[0].id);
                setTenderId(firstId);
                loadTasks(firstId);
            }
        } catch (err) {
            console.error(err);
            setTendersError("تعذر تحميل المنافسات. حاول تحديث الصفحة.");
        } finally {
            setTendersLoading(false);
        }
    }

    async function loadTasks(id: string) {
        if (!id.trim()) return;
        try {
            setLoading(true);
            setError("");
            const response = await fetch(
                `${API_BASE_URL}/gap-closure/tasks?tender_id=${encodeURIComponent(id)}`,
                { cache: "no-store" }
            );
            if (!response.ok) throw new Error(await response.text());
            const data: { tasks: GapTask[] } = await response.json();
            setTasks(data.tasks || []);
        } catch (err) {
            console.error(err);
            setError("تعذر تحميل مهام الفجوات. تأكد من رقم المنافسة وأن الخادم يعمل.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTenders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reload tasks when tenderId changes (after dropdown selection)
    useEffect(() => {
        if (tenderId) loadTasks(tenderId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenderId]);

    const filteredTasks = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tasks.filter((t) => {
            const matchSearch = !q || `${t.title} ${t.owner_name} ${t.requirement_title}`.toLowerCase().includes(q);
            const matchStatus = filterStatus === "all" || t.status === filterStatus;
            const matchPriority = filterPriority === "all" || t.priority === filterPriority;
            return matchSearch && matchStatus && matchPriority;
        });
    }, [tasks, search, filterStatus, filterPriority]);

    const stats = useMemo(() => ({
        total: tasks.length,
        open: tasks.filter(t => t.status === "OPEN" || t.status === "IN_PROGRESS").length,
        waiting: tasks.filter(t => t.status === "WAITING_REVIEW" || t.status === "WAITING_MANAGER_APPROVAL").length,
        closed: tasks.filter(t => t.status === "CLOSED").length,
        blocked: tasks.filter(t => t.status === "BLOCKED").length,
    }), [tasks]);

    return (
        <main dir="rtl" style={pageStyle}>
            {/* ── Hero ────────────────────────────────────────────── */}
            <section style={heroStyle}>
                <div style={heroGlowStyle} />
                <div style={{ position: "relative", zIndex: 1 }}>
                    <span style={eyebrowStyle}>▸ لوحة قيادة المهام</span>
                    <h1 style={heroTitleStyle}>مهام إغلاق الفجوات</h1>
                    <p style={heroSubStyle}>
                        عرض شامل لمهام إغلاق الفجوات المرتبطة بالمنافسة. كل مهمة تمثل متطلبًا غير مغطى يحتاج دليلًا أو إجراءً من الفريق.
                    </p>
                    {tasks.length > 0 && (
                        <div style={{ marginTop: "14px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
                            <div style={heroStatStyle}><span style={heroStatNumStyle}>{stats.total}</span><span style={heroStatLabelStyle}>إجمالي</span></div>
                            <div style={heroStatStyle}><span style={heroStatNumStyle}>{stats.open}</span><span style={heroStatLabelStyle}>مفتوحة</span></div>
                            <div style={heroStatStyle}><span style={{ ...heroStatNumStyle, color: "#fbbf24" }}>{stats.waiting}</span><span style={heroStatLabelStyle}>مراجعة</span></div>
                            <div style={heroStatStyle}><span style={{ ...heroStatNumStyle, color: "#4ade80" }}>{stats.closed}</span><span style={heroStatLabelStyle}>مغلقة</span></div>
                            <div style={heroStatStyle}><span style={{ ...heroStatNumStyle, color: "#f87171" }}>{stats.blocked}</span><span style={heroStatLabelStyle}>محجوبة</span></div>
                        </div>
                    )}
                </div>
                <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <Link href="/workbench" style={heroPrimaryButtonStyle}>
                        مساحة العمل التفصيلية
                    </Link>
                    <Link href="/tenders" style={heroSecondaryButtonStyle}>
                        ← المنافسات
                    </Link>
                </div>
            </section>

            {/* ── Tender Selector ──────────────────────────────── */}
            <section style={tenderSelectorWrapperStyle}>
                <div style={tenderSelectorHeaderStyle}>
                    <div>
                        <div style={selectorEyebrowStyle}>▸ نطاق المنافسة</div>
                        <p style={selectorHintStyle}>اختر المنافسة لعرض مهام فجواتها وتصفيتها.</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="🔍 بحث في المهام..."
                            style={searchInputStyle}
                        />
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
                            <option value="all">كل الحالات</option>
                            {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                            ))}
                        </select>
                        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={selectStyle}>
                            <option value="all">كل الأولويات</option>
                            <option value="عالية">🔴 عالية</option>
                            <option value="متوسطة">🟠 متوسطة</option>
                            <option value="منخفضة">🟢 منخفضة</option>
                        </select>
                    </div>
                </div>

                {tendersLoading ? (
                    <div style={selectorLoadingStyle}>جاري تحميل المنافسات...</div>
                ) : tendersError ? (
                    <div style={selectorErrorStyle}>{tendersError}</div>
                ) : tenders.length === 0 ? (
                    <div style={selectorLoadingStyle}>لا توجد منافسات متاحة للاختيار.</div>
                ) : (
                    <select
                        value={tenderId}
                        onChange={(e) => setTenderId(e.target.value)}
                        style={tenderSelectStyle}
                        aria-label="اختر المنافسة"
                    >
                        {tenders.map((t) => (
                            <option key={t.id} value={String(t.id)}>
                                {t.title} — {t.client} — رقم {t.id}
                            </option>
                        ))}
                    </select>
                )}

                {/* Selected tender premium summary */}
                {tenderId && (() => {
                    const sel = tenders.find((t) => String(t.id) === tenderId);
                    if (!sel) return null;
                    const score = Number(sel.readiness_score || 0);
                    const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
                    const scoreBg = score >= 80 ? "rgba(22,163,74,0.08)" : score >= 50 ? "rgba(217,119,6,0.08)" : "rgba(220,38,38,0.08)";
                    return (
                        <div style={selectedTenderCardStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#59BA47", marginBottom: "6px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>المنافسة النشطة</div>
                                    <div style={{ fontWeight: 900, fontSize: "16px", color: "#232122", marginBottom: "4px", lineHeight: 1.4 }}>{sel.title}</div>
                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                        <span style={{ fontSize: "13px", color: "#6b7280" }}>📋 {sel.client}</span>
                                        {sel.submission_deadline && <span style={{ fontSize: "12px", color: "#9ca3af" }}>⏱ {sel.submission_deadline.slice(0, 10)}</span>}
                                        <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#475569", fontWeight: 800 }}>رقم {sel.id}</span>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
                                    <div style={{ textAlign: "center" }}>
                                        <div style={{ width: "56px", height: "56px", borderRadius: "999px", border: `3px solid ${scoreColor}`, display: "flex", alignItems: "center", justifyContent: "center", background: scoreBg }}>
                                            <span style={{ fontSize: "13px", fontWeight: 900, color: scoreColor }}>{score}%</span>
                                        </div>
                                        <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "3px", fontWeight: 800 }}>جاهزية</div>
                                    </div>
                                    <Link href={`/workbench?tenderId=${sel.id}`} style={{ padding: "8px 14px", borderRadius: "12px", fontSize: "12px", fontWeight: 900, background: "#232122", color: "white", textDecoration: "none" }}>
                                        مساحة العمل
                                    </Link>
                                </div>
                            </div>
                            <div style={{ marginTop: "12px", height: "5px", borderRadius: "999px", background: "#e5e7eb", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${score}%`, borderRadius: "999px", background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)` }} />
                            </div>
                        </div>
                    );
                })()}
            </section>

            {error && <div style={errorStyle}>{error}</div>}

            {/* ── Stats Row ───────────────────────────────────── */}
            {tasks.length > 0 && (
                <div style={statsRowStyle}>
                    {[
                        { label: "الإجمالي", value: stats.total, color: "#2563eb" },
                        { label: "مفتوحة / جارية", value: stats.open, color: "#15803d" },
                        { label: "بانتظار مراجعة", value: stats.waiting, color: "#b45309" },
                        { label: "مغلقة", value: stats.closed, color: "#475569" },
                        { label: "محجوبة", value: stats.blocked, color: "#b91c1c" },
                    ].map((s) => (
                        <div key={s.label} style={statTileStyle}>
                            <div style={{ width: "3px", background: s.color, borderRadius: "999px", alignSelf: "stretch", flexShrink: 0 }} />
                            <div style={{ padding: "10px 12px", flex: 1 }}>
                                <div style={{ fontSize: "10px", fontWeight: 900, color: "#8a9591", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</div>
                                <div style={{ fontSize: "24px", fontWeight: 950, letterSpacing: "-0.03em", lineHeight: 1, color: s.color }}>{s.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Tasks List ──────────────────────────────────── */}
            {loading ? (
                <section style={emptyStyle}>جاري تحميل مهام الفجوات...</section>
            ) : filteredTasks.length === 0 ? (
                <section style={emptyStyle}>
                    {tasks.length === 0
                        ? "اختر منافسة من القائمة أعلاه لعرض المهام."
                        : "لا توجد مهام تطابق الفلاتر الحالية."}
                </section>
            ) : (
                <section style={{ display: "grid", gap: "8px" }}>
                    <div style={tableHeaderStyle}>
                        <span style={{ flex: "0 0 44px", textAlign: "center" }}>#</span>
                        <span style={{ flex: "2 1 0" }}>عنوان المهمة / المتطلب</span>
                        <span style={{ flex: "1 1 0" }}>المسؤول</span>
                        <span style={{ flex: "0 0 110px", textAlign: "center" }}>الأولوية</span>
                        <span style={{ flex: "0 0 150px", textAlign: "center" }}>الحالة</span>
                        <span style={{ flex: "0 0 90px", textAlign: "center" }}>الإجراء</span>
                    </div>

                    {filteredTasks.map((task) => {
                        const sc = statusColor(task.status);
                        return (
                            <article key={task.id} style={taskRowStyle}>
                                <span style={{ flex: "0 0 44px", textAlign: "center", color: "#8a9591", fontSize: "12px", fontWeight: 900 }}>
                                    {task.id}
                                </span>
                                <div style={{ flex: "2 1 0", minWidth: 0 }}>
                                    <p style={{ margin: "0 0 2px", fontWeight: 900, fontSize: "14px", color: "#232122", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {task.title}
                                    </p>
                                    <p style={{ margin: 0, fontSize: "11px", color: "#8a9591", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {task.requirement_title}
                                    </p>
                                </div>
                                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                                    <p style={{ margin: "0 0 2px", fontWeight: 800, fontSize: "13px", color: "#232122", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {task.owner_name}
                                    </p>
                                    <p style={{ margin: 0, fontSize: "11px", color: "#8a9591", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {task.owner_department}
                                    </p>
                                </div>
                                <div style={{ flex: "0 0 110px", textAlign: "center" }}>
                                    <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, background: `${priorityColor(task.priority)}14`, color: priorityColor(task.priority), border: `1px solid ${priorityColor(task.priority)}33` }}>
                                        {PRIORITY_LABEL[task.priority] || task.priority}
                                    </span>
                                </div>
                                <div style={{ flex: "0 0 150px", textAlign: "center" }}>
                                    <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                                        {STATUS_LABEL[task.status] || task.status}
                                    </span>
                                </div>
                                <div style={{ flex: "0 0 90px", textAlign: "center" }}>
                                    <Link
                                        href={`/workbench?tenderId=${task.tender_id}`}
                                        style={{ display: "inline-flex", padding: "5px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 900, background: "#f1f5f9", color: "#232122", border: "1px solid #DFE7E4", textDecoration: "none" }}
                                    >
                                        فتح
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}
        </main>
    );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: "#F4F6F6",
    color: "#232122",
    display: "grid",
    gap: "14px",
    alignContent: "start",
    padding: "28px 32px",
    fontFamily: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
};

const heroStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    padding: "28px 32px",
    borderRadius: "24px",
    background: "linear-gradient(135deg, #1a1819 0%, #232122 55%, #1c2820 100%)",
    boxShadow: "0 24px 56px rgba(35,33,34,0.28)",
};

const heroGlowStyle: CSSProperties = {
    position: "absolute",
    insetInlineEnd: "-40px",
    top: "-60px",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.10)",
    filter: "blur(70px)",
    pointerEvents: "none",
};

const heroStatStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    paddingInlineEnd: "20px",
    borderInlineEnd: "1px solid rgba(255,255,255,0.10)",
};

const heroStatNumStyle: CSSProperties = {
    fontSize: "22px",
    fontWeight: 900,
    color: "white",
    letterSpacing: "-0.03em",
    lineHeight: 1,
};

const heroStatLabelStyle: CSSProperties = {
    fontSize: "10px",
    fontWeight: 800,
    color: "rgba(255,255,255,0.40)",
    letterSpacing: "0.04em",
};

const heroPrimaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "12px",
    padding: "10px 18px",
    background: "#59BA47",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    fontSize: "13px",
    boxShadow: "0 6px 20px rgba(89,186,71,0.40)",
};

const heroSecondaryButtonStyle: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: "12px",
    padding: "9px 15px",
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.80)",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    fontSize: "13px",
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
    margin: "0 0 6px",
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
    maxWidth: "620px",
};

const primaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "12px",
    padding: "10px 16px",
    background: "#59BA47",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    fontSize: "13px",
    boxShadow: "0 6px 16px rgba(89,186,71,0.35)",
};

const secondaryButtonStyle: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "12px",
    padding: "9px 15px",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    fontSize: "13px",
};

const tenderSelectorWrapperStyle: CSSProperties = {
    background: "white",
    border: "1px solid #DFE7E4",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 2px 8px rgba(35,33,34,0.04)",
    display: "grid",
    gap: "12px",
};

const tenderSelectorHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
    paddingBottom: "12px",
    borderBottom: "1px solid #DFE7E4",
};

const selectorEyebrowStyle: CSSProperties = {
    fontSize: "11px",
    fontWeight: 900,
    color: "#59BA47",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "3px",
};

const selectorHintStyle: CSSProperties = {
    margin: 0,
    fontSize: "12px",
    color: "#8a9591",
};

const tenderSelectStyle: CSSProperties = {
    width: "100%",
    border: "1px solid #DFE7E4",
    borderRadius: "14px",
    padding: "12px 14px",
    fontWeight: 900,
    fontSize: "14px",
    color: "#232122",
    background: "#F4F6F6",
    outline: "none",
    cursor: "pointer",
};

const selectedTenderCardStyle: CSSProperties = {
    padding: "14px",
    borderRadius: "14px",
    background: "#fafcfb",
    border: "1px solid #DFE7E4",
};

const selectorLoadingStyle: CSSProperties = {
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#F4F6F6",
    color: "#8a9591",
    fontSize: "13px",
    fontWeight: 800,
};

const selectorErrorStyle: CSSProperties = {
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: "13px",
    fontWeight: 800,
};

const searchInputStyle: CSSProperties = {
    border: "1px solid #DFE7E4",
    borderRadius: "12px",
    padding: "9px 12px",
    width: "180px",
    fontWeight: 700,
    outline: "none",
    background: "#F4F6F6",
    color: "#232122",
    fontSize: "13px",
};

const selectStyle: CSSProperties = {
    border: "1px solid #DFE7E4",
    borderRadius: "12px",
    padding: "9px 12px",
    fontWeight: 700,
    outline: "none",
    background: "#F4F6F6",
    color: "#232122",
    fontSize: "13px",
    cursor: "pointer",
};

const statsRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "8px",
};

const statTileStyle: CSSProperties = {
    background: "white",
    border: "1px solid #DFE7E4",
    borderRadius: "14px",
    display: "flex",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(35,33,34,0.03)",
};

const emptyStyle: CSSProperties = {
    padding: "36px",
    borderRadius: "18px",
    background: "white",
    border: "1px dashed #DFE7E4",
    textAlign: "center",
    color: "#8a9591",
    fontWeight: 800,
    fontSize: "14px",
};

const errorStyle: CSSProperties = {
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontWeight: 800,
    fontSize: "13px",
};

const tableHeaderStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    padding: "10px 16px",
    background: "#F4F6F6",
    border: "1px solid #DFE7E4",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 900,
    color: "#8a9591",
    letterSpacing: "0.04em",
};

const taskRowStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    padding: "12px 16px",
    background: "white",
    border: "1px solid #DFE7E4",
    borderRadius: "14px",
    boxShadow: "0 1px 4px rgba(35,33,34,0.03)",
};