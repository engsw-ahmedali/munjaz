"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type GapTask = {
    id: number;
    tender_id: number;
    title: string;
    description: string;
    owner_name: string;
    owner_department: string;
    priority: string;
    status: string;
    evidence_type: string;
    evidence_instruction: string;
    impact_score: number;
    verification_status: string;
    verification_notes?: string;
};

type Summary = {
    total: number;
    open: number;
    in_progress: number;
    waiting_review: number;
    closed: number;
    blocked: number;
    high_priority_open: number;
    closure_score: number;
    decision: string;
    recommendation: string;
};

type DashboardResponse = {
    tender?: {
        id: number;
        title?: string;
        client?: string;
        status?: string;
        readiness_score?: number;
        submission_deadline?: string;
    };
    summary: Summary;
    owners: Array<{
        owner_role: string;
        owner_name: string;
        owner_department: string;
        total: number;
        closed: number;
        open_count: number;
        high_open: number;
    }>;
    recent_evidence: Array<{
        id: number;
        original_filename: string;
        file_size: number;
        verification_status: string;
        uploaded_at: string;
    }>;
    recent_events: Array<{
        id: number;
        task_id: number;
        task_title: string;
        owner_name: string;
        event_type: string;
        message: string;
        created_at: string;
    }>;
};

export default function ExecutiveDecisionPage() {
    const params = useParams();
    const tenderId = String(params?.id || "");

    const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
    const [tasks, setTasks] = useState<GapTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    async function fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(body || response.statusText);
        }

        return response.json();
    }

    async function loadData() {
        setLoading(true);

        try {
            const [dashboardData, tasksData] = await Promise.all([
                fetchJson<DashboardResponse>(`${API_BASE_URL}/gap-closure/tenders/${tenderId}/dashboard`),
                fetchJson<{ tasks: GapTask[] }>(`${API_BASE_URL}/gap-closure/tasks?tender_id=${tenderId}`),
            ]);

            setDashboard(dashboardData);
            setTasks(tasksData.tasks || []);
            setMessage("");
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحميل بيانات لوحة القرار التنفيذية. تأكد من تشغيل الخادم الخلفي.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (tenderId) {
            loadData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenderId]);

    const summary = dashboard?.summary;

    const criticalTasks = useMemo(() => {
        return tasks
            .filter((task) => task.status !== "CLOSED")
            .sort((a, b) => {
                const priorityOrder: Record<string, number> = { عالية: 1, متوسطة: 2, منخفضة: 3 };
                const priorityDiff = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
                if (priorityDiff !== 0) return priorityDiff;
                return Number(b.impact_score || 0) - Number(a.impact_score || 0);
            })
            .slice(0, 8);
    }, [tasks]);

    const closedTasks = useMemo(() => {
        return tasks.filter((task) => task.status === "CLOSED");
    }, [tasks]);

    const managerApprovals = useMemo(() => {
        return dashboard?.recent_events?.filter(
            (event) => event.event_type === "MANAGER_APPROVED" || event.event_type === "MANAGER_REJECTED"
        ) || [];
    }, [dashboard]);

    const decisionNarrative = useMemo(() => {
        if (!summary) return "لا توجد بيانات كافية لإصدار ملخص تنفيذي.";

        if (summary.high_priority_open > 0) {
            return `قرار الدخول مشروط. توجد ${summary.high_priority_open} فجوة عالية التأثير تعيق اعتماد التقديم النهائي. يرجى التركيز على إغلاق الفجوات الحرجة المعلقة.`;
        }

        if (summary.decision === "جاهز للتقديم" || summary.closure_score >= 85) {
            return "تشير نتائج إغلاق الفجوات إلى أن المنافسة جاهزة للتقديم. تم إغلاق كافة الفجوات الحرجة بنجاح. يوصى بمراجعة اعتمادات الإدارة وتصدير حزمة القرار النهائية.";
        }

        return "ما تزال المنافسة في مرحلة التجهيز التشغيلي، ويجب استكمال الأدلة المطلوبة ورفع نسبة الإغلاق قبل عرض القرار النهائي.";
    }, [summary]);

    const finalRecommendation = useMemo(() => {
        if (!summary) return "";
        let rec = "";
        if (summary.high_priority_open > 0) {
            rec = "دخول مشروط مع إغلاق الفجوات عالية التأثير قبل اعتماد التقديم.";
        } else if (summary.closure_score >= 85) {
            rec = "جاهز للمراجعة النهائية قبل التقديم.";
        } else {
            rec = "تستمر جهود الإغلاق لتحسين درجة الجاهزية.";
        }
        
        const waitingManagerCount = tasks.filter((t) => t.status === "WAITING_MANAGER_APPROVAL").length;
        if (waitingManagerCount > 0) {
            rec += " توجد أدلة بانتظار اعتماد مدير المنافسة.";
        }
        return rec;
    }, [summary, tasks]);

    const printTimestamp = new Date().toLocaleString("ar-SA", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

    return (
        <main dir="rtl" style={pageStyle}>
            <style dangerouslySetInnerHTML={{ __html: `
                @page {
                    size: A4 portrait;
                    margin: 12mm;
                }

                @media print {
                    /* ── Hide app shell globally ── */
                    aside, nav, header, footer,
                    [data-sidebar], [data-nav],
                    .sidebar, .side-nav, .app-sidebar,
                    .no-print {
                        display: none !important;
                    }

                    /* ── Reset html/body to fill the A4 sheet ── */
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    /* ── Wipe any Next.js wrapper layouts ── */
                    body > div,
                    #__next,
                    #__next > div,
                    #__next > div > div {
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        background: white !important;
                    }

                    /* ── The report main element ── */
                    main {
                        width: 100% !important;
                        max-width: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        background: white !important;
                        overflow: visible !important;
                        display: block !important;
                    }

                    /* ── Cards / sections ── */
                    section, article, div {
                        box-shadow: none !important;
                        max-width: none !important;
                        overflow: visible !important;
                    }

                    section {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        margin-bottom: 16px !important;
                        border-color: #cbd5e1 !important;
                    }

                    /* ── Collapse multi-column grids to single column ── */
                    section[style*="grid"],
                    div[style*="grid-template-columns"] {
                        display: block !important;
                    }

                    /* ── Print-only header ── */
                    .print-only-header {
                        display: block !important;
                        border-bottom: 2px solid #0f172a;
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                    }

                    /* ── Screen-only hero ── */
                    .screen-hero {
                        display: none !important;
                    }
                }

                /* Screen: hide print-only header */
                @media screen {
                    .print-only-header {
                        display: none !important;
                    }
                }
            ` }} />

            {/* Print-only report header — visible only when printing */}
            <div className="print-only-header" dir="rtl" style={{
                fontFamily: "inherit",
                marginBottom: "20px",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px", fontWeight: 700 }}>
                            نظام إدارة المنافسات — مُنجز
                        </div>
                        <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 900 }}>
                            حزمة قرار المنافسة
                        </h1>
                        <p style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 700 }}>
                            {dashboard?.tender?.title || `منافسة رقم ${tenderId}`}
                        </p>
                        {dashboard?.tender?.client ? (
                            <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
                                الجهة: {dashboard.tender.client}
                            </p>
                        ) : null}
                    </div>
                    <div style={{ textAlign: "left", fontSize: "11px", color: "#64748b" }}>
                        <div style={{ fontWeight: 700 }}>تاريخ الإصدار</div>
                        <div>{printTimestamp}</div>
                    </div>
                </div>
            </div>

            {/* Screen hero — hidden during print */}
            <section style={heroStyle} className="screen-hero no-print">
                <div>
                    <span style={pillStyle}>لوحة القرار التنفيذية</span>
                    <h1 style={titleStyle}>لوحة القرار التنفيذية</h1>
                    <p style={subtitleStyle}>
                        ملخص تنفيذي لجاهزية المنافسة، الفجوات المؤثرة، حالة الأدلة، وتوزيع المسؤوليات قبل اعتماد قرار التقديم.
                    </p>
                </div>

                <div style={heroActionsStyle} className="no-print">
                    <button onClick={() => window.print()} style={primaryButtonStyle}>
                        تصدير حزمة القرار
                    </button>
                    <Link href={`/workbench?tenderId=${tenderId}`} style={secondaryButtonStyle}>
                        فتح مساحة إغلاق الفجوات
                    </Link>
                    <Link href="/tenders" style={secondaryButtonStyle}>
                        العودة للمناقصات
                    </Link>
                </div>
            </section>

            {message ? <div style={messageStyle}>{message}</div> : null}

            {loading ? <div style={emptyStyle}>جاري تحميل بيانات القرار...</div> : null}

            {!loading && summary ? (
                <>
                    <section style={decisionPanelStyle}>
                        <div>
                            <span style={pillStyle}>جاهزية المنافسة</span>
                            <h2 style={sectionTitleStyle}>
                                {dashboard?.tender?.title || `منافسة رقم ${tenderId}`}
                            </h2>
                            <p style={sectionSubtitleStyle}>
                                {dashboard?.tender?.client ? `الجهة: ${dashboard.tender.client}` : "الجهة غير محددة"}
                            </p>
                        </div>

                        <div style={decisionBoxStyle(summary.decision)}>
                            <span>قرار الجاهزية</span>
                            <strong>{summary.decision}</strong>
                            <small>{summary.recommendation}</small>
                        </div>
                    </section>

                    <section style={metricsGridStyle}>
                        <Metric title="درجة الإغلاق" value={`${summary.closure_score}%`} />
                        <Metric title="إجمالي المهام" value={`${summary.total}`} />
                        <Metric title="المفتوحة" value={`${summary.open}`} />
                        <Metric title="بانتظار مراجعة" value={`${summary.waiting_review}`} />
                        <Metric title="المغلقة" value={`${summary.closed}`} />
                        <Metric title="فجوات عالية مفتوحة" value={`${summary.high_priority_open}`} />
                    </section>

                    <section style={cardStyle}>
                        <span style={pillStyle}>الملخص التنفيذي</span>
                        <h2 style={sectionTitleStyle}>الملخص التنفيذي المختصر</h2>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
                            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                                <h3 style={{ fontSize: "15px", color: "#64748b", margin: "0 0 12px" }}>المؤشرات الأساسية</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700 }}>قرار الجاهزية:</span>
                                        <strong style={{ color: summary.decision === "جاهز للتقديم" ? "#166534" : "#b91c1c" }}>{summary.decision}</strong>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700 }}>درجة الإغلاق:</span>
                                        <strong>{summary.closure_score}%</strong>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700 }}>إجمالي المهام:</span>
                                        <strong>{summary.total}</strong>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700 }}>الفجوات المغلقة:</span>
                                        <strong>{summary.closed}</strong>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700, color: "#b91c1c" }}>فجوات عالية التأثير:</span>
                                        <strong style={{ color: "#b91c1c" }}>{summary.high_priority_open}</strong>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontWeight: 700, color: "#ca8a04" }}>بانتظار اعتماد الإدارة:</span>
                                        <strong style={{ color: "#ca8a04" }}>{tasks.filter((t) => t.status === "WAITING_MANAGER_APPROVAL").length}</strong>
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "16px", border: "1px solid #bbf7d0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <h3 style={{ fontSize: "15px", color: "#166534", margin: "0 0 8px" }}>التوصية النهائية</h3>
                                <p style={{ fontSize: "16px", fontWeight: 900, color: "#14532d", margin: 0, lineHeight: 1.6 }}>
                                    {finalRecommendation}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                            <div>
                                <h3 style={{ fontSize: "15px", color: "#64748b", margin: "0 0 12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>أهم 3 فجوات مؤثرة على القرار</h3>
                                <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {criticalTasks.slice(0, 3).map(task => (
                                        <li key={task.id} style={{ fontSize: "14px", fontWeight: 700, display: "flex", gap: "8px", alignItems: "flex-start" }}>
                                            <span style={{ color: "#b91c1c" }}>•</span> <span>{task.title}</span>
                                        </li>
                                    ))}
                                    {criticalTasks.length === 0 && <li style={{ fontSize: "14px", color: "#64748b" }}>لا توجد فجوات مؤثرة</li>}
                                </ul>
                            </div>
                            <div>
                                <h3 style={{ fontSize: "15px", color: "#64748b", margin: "0 0 12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>أهم 3 إجراءات مطلوبة</h3>
                                <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {criticalTasks.slice(0, 3).map(task => (
                                        <li key={`action-${task.id}`} style={{ fontSize: "14px", fontWeight: 700, display: "flex", gap: "8px", alignItems: "flex-start" }}>
                                            <span style={{ color: "#2563eb" }}>•</span> <span>{task.evidence_instruction}</span>
                                        </li>
                                    ))}
                                    {criticalTasks.length === 0 && <li style={{ fontSize: "14px", color: "#64748b" }}>لا توجد إجراءات مطلوبة</li>}
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section style={cardStyle}>
                        <span style={pillStyle}>المذكرة التنفيذية</span>
                        <h2 style={sectionTitleStyle}>ملخص القرار</h2>
                        <p style={memoStyle}>{decisionNarrative}</p>
                    </section>

                    <section style={twoColumnsStyle}>
                        <section style={cardStyle}>
                            <span style={pillStyle}>البنود الحرجة المفتوحة</span>
                            <h2 style={sectionTitleStyle}>الفجوات المؤثرة على القرار</h2>

                            {criticalTasks.length ? (
                                <div style={listStyle}>
                                    {criticalTasks.map((task) => (
                                        <article key={task.id} style={criticalTaskStyle}>
                                            <strong>{task.title}</strong>
                                            <span>{task.owner_name} — {task.owner_department}</span>
                                            <small>
                                                {translateStatus(task.status)} — {task.priority} — أثر {task.impact_score}%
                                            </small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا توجد فجوات مفتوحة مؤثرة على القرار.</div>
                            )}
                        </section>

                        <section style={cardStyle}>
                            <span style={pillStyle}>توزيع المسؤوليات</span>
                            <h2 style={sectionTitleStyle}>توزيع المسؤوليات</h2>

                            {dashboard?.owners?.length ? (
                                <div style={listStyle}>
                                    {dashboard.owners.map((owner) => (
                                        <article key={owner.owner_role} style={ownerCardStyle}>
                                            <strong>{owner.owner_name}</strong>
                                            <span>{owner.owner_department}</span>
                                            <small>
                                                إجمالي: {owner.total} — مغلقة: {owner.closed || 0} — مفتوحة: {owner.open_count || 0}
                                            </small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا توجد بيانات مسؤوليات.</div>
                            )}
                        </section>
                    </section>

                    <section style={twoColumnsStyle} className="page-break">
                        <section style={cardStyle}>
                            <span style={pillStyle}>البنود المغلقة المعتمدة</span>
                            <h2 style={sectionTitleStyle}>الفجوات المغلقة المعتمدة</h2>

                            {closedTasks.length ? (
                                <div style={listStyle}>
                                    {closedTasks.slice(0, 8).map((task) => (
                                        <article key={task.id} style={criticalTaskStyle}>
                                            <strong>{task.title}</strong>
                                            <span>{task.owner_name} — {task.owner_department}</span>
                                            <small>
                                                {translateStatus(task.status)} — {task.priority}
                                            </small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا توجد فجوات مغلقة بأدلة معتمدة حتى الآن.</div>
                            )}
                        </section>

                        <section style={cardStyle}>
                            <span style={pillStyle}>اعتمادات المدير</span>
                            <h2 style={sectionTitleStyle}>اعتمادات الإدارة</h2>

                            {managerApprovals.length ? (
                                <div style={listStyle}>
                                    {managerApprovals.slice(0, 10).map((event) => (
                                        <article key={event.id} style={ownerCardStyle}>
                                            <strong>{translateEvent(event.event_type)}</strong>
                                            <span>{event.message}</span>
                                            <small>{formatDate(event.created_at)}</small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا توجد اعتمادات إدارية مسجلة حتى الآن.</div>
                            )}
                        </section>
                    </section>

                    <section style={twoColumnsStyle} className="page-break">
                        <section style={cardStyle}>
                            <span style={pillStyle}>سجل الأدلة</span>
                            <h2 style={sectionTitleStyle}>آخر الأدلة المستلمة</h2>

                            {dashboard?.recent_evidence?.length ? (
                                <div style={listStyle}>
                                    {dashboard.recent_evidence.slice(0, 10).map((evidence) => (
                                        <article key={evidence.id} style={ownerCardStyle}>
                                            <strong>{evidence.original_filename}</strong>
                                            <span>{translateVerification(evidence.verification_status)}</span>
                                            <small>{formatDate(evidence.uploaded_at)}</small>
                                            <a
                                                href={`${API_BASE_URL}/gap-closure/evidence/${evidence.id}/download`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={downloadLinkStyle}
                                            >
                                                فتح / تحميل الدليل
                                            </a>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا توجد أدلة مستلمة.</div>
                            )}
                        </section>

                        <section style={cardStyle}>
                            <span style={pillStyle}>سجل النشاط</span>
                            <h2 style={sectionTitleStyle}>آخر النشاطات</h2>

                            {dashboard?.recent_events?.length ? (
                                <div style={listStyle}>
                                    {dashboard.recent_events.slice(0, 10).map((event) => (
                                        <article key={event.id} style={ownerCardStyle}>
                                            <strong>{event.message}</strong>
                                            <span>{event.owner_name}</span>
                                            <small>{formatDate(event.created_at)}</small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyStyle}>لا يوجد سجل نشاط بعد.</div>
                            )}
                        </section>
                    </section>
                </>
            ) : null}
        </main>
    );
}

function Metric({ title, value }: { title: string; value: string }) {
    return (
        <div style={metricCardStyle}>
            <span>{title}</span>
            <strong>{value}</strong>
        </div>
    );
}

function translateStatus(status: string) {
    const map: Record<string, string> = {
        OPEN: "مفتوحة",
        IN_PROGRESS: "قيد التنفيذ",
        WAITING_REVIEW: "بانتظار مراجعة",
        CLOSED: "مغلقة",
        BLOCKED: "محجوبة",
    };

    return map[status] || status;
}

function translateVerification(status: string) {
    const map: Record<string, string> = {
        NOT_SUBMITTED: "لم يرفع دليل",
        SUBMITTED: "دليل محفوظ",
        ACCEPTED: "مقبول",
        REJECTED: "مرفوض",
        NEEDS_REVIEW: "يحتاج مراجعة",
        NOT_VERIFIED: "لم يتحقق بعد",
    };

    return map[status] || status;
}

function translateEvent(type: string) {
    const map: Record<string, string> = {
        MANAGER_APPROVED: "اعتماد المدير",
        MANAGER_REJECTED: "إرجاع المدير",
        TASK_CREATED: "إنشاء مهمة",
        TASK_UPDATED: "تحديث مهمة",
        EVIDENCE_UPLOADED: "رفع دليل",
        TASK_VERIFIED: "تحقق",
        EVIDENCE_RECORD: "سجل دليل",
    };

    return map[type] || type;
}

function formatDate(value?: string) {
    if (!value) return "غير محدد";
    return value.replace("T", " ").replace("Z", "");
}

function decisionBoxStyle(decision: string): CSSProperties {
    const color =
        decision === "جاهز للتقديم"
            ? "#16a34a"
            : decision === "دخول مشروط"
                ? "#f59e0b"
                : "#2563eb";

    return {
        minWidth: "290px",
        padding: "18px",
        borderRadius: "20px",
        border: `1px solid ${color}44`,
        background: `${color}12`,
        color,
        display: "flex",
        flexDirection: "column",
        gap: "7px",
    };
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

const heroActionsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
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

const messageStyle: CSSProperties = {
    padding: "15px 16px",
    borderRadius: "16px",
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 850,
    marginBottom: "18px",
};

const decisionPanelStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "22px",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    marginBottom: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const metricsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "18px",
};

const metricCardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "22px",
    boxShadow: "0 16px 38px rgba(15,23,42,0.055)",
    marginBottom: "18px",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "24px",
};

const sectionSubtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.8,
};

const memoStyle: CSSProperties = {
    margin: "10px 0 0",
    lineHeight: 2,
    color: "#334155",
    fontSize: "16px",
};

const twoColumnsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
};

const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "16px",
};

const criticalTaskStyle: CSSProperties = {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    lineHeight: 1.7,
};

const ownerCardStyle: CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    lineHeight: 1.7,
};

const downloadLinkStyle: CSSProperties = {
    color: "#075985",
    fontWeight: 950,
    textDecoration: "none",
};

const emptyStyle: CSSProperties = {
    padding: "22px",
    borderRadius: "16px",
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontWeight: 850,
    textAlign: "center",
};
