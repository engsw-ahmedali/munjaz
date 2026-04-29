"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { API_BASE_URL } from "@/lib/api";

type RequirementReasoning = {
    requirement_id: number;
    requirement_title: string;
    reasoning: string;
    best_resource: string | null;
    match_score: number;
    documents_count: number;
};

type DecisionMemoResponse = {
    tender_id: number;
    tender_title: string;
    client: string;
    generated_at: string;
    provider: string;
    model?: string | null;
    decision: string;
    gate_status: string;
    confidence: string;
    scores: {
        internal_readiness_score: number;
        documents_coverage_score: number;
        resource_readiness_score: number;
        resource_evidence_coverage_score: number;
        open_tasks_count: number;
        critical_open_tasks_count: number;
        total_requirements: number;
    };
    executive_memo: string;
    bid_strategy: string;
    risk_notes: string[];
    recommended_actions: string[];
    requirement_reasoning: RequirementReasoning[];
    engine: string;
};

type MemoBlock =
    | { type: "heading"; text: string }
    | { type: "paragraph"; text: string }
    | { type: "bullet"; text: string };

function cleanInlineMarkdown(value: string) {
    return value
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/^#+\s*/g, "")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function parseMemoBlocks(rawText: string): MemoBlock[] {
    if (!rawText?.trim()) return [];

    const normalized = rawText
        .replace(/\r\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const lines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const blocks: MemoBlock[] = [];

    for (const line of lines) {
        const clean = cleanInlineMarkdown(line);

        if (!clean) continue;

        const isHeading =
            /^#{1,4}\s/.test(line) ||
            /^(\*\*)[^*]+(\*\*)$/.test(line) ||
            clean.endsWith(":") ||
            [
                "مذكرة قرار تنفيذية",
                "خلاصة القرار",
                "مبررات القرار",
                "أدلة الموارد",
                "المخاطر",
                "التوصية التنفيذية",
                "الإجراء النهائي",
                "العميل",
                "موعد التقديم",
            ].some((keyword) => clean.includes(keyword) && clean.length <= 45);

        const isBullet = /^[-*•]\s+/.test(line) || /^\d+[\).]\s+/.test(line);

        if (isBullet) {
            blocks.push({
                type: "bullet",
                text: cleanInlineMarkdown(line.replace(/^[-*•]\s+/, "").replace(/^\d+[\).]\s+/, "")),
            });
        } else if (isHeading) {
            blocks.push({ type: "heading", text: clean.replace(/:$/, "") });
        } else {
            blocks.push({ type: "paragraph", text: clean });
        }
    }

    return blocks;
}

function scoreColor(score: number) {
    if (score >= 90) return "#16a34a";
    if (score >= 70) return "#0f766e";
    if (score >= 45) return "#f59e0b";
    return "#dc2626";
}

function gateColor(status: string) {
    if (status === "PASSED") return "#16a34a";
    if (status === "CONDITIONAL") return "#f59e0b";
    return "#dc2626";
}

export default function TenderReasoningPage() {
    const params = useParams();
    const tenderId = params?.id;

    const [data, setData] = useState<DecisionMemoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [copied, setCopied] = useState(false);

    async function loadMemo() {
        if (!tenderId) return;

        try {
            setLoading(true);
            setMessage("");
            setCopied(false);

            const response = await fetch(
                `${API_BASE_URL}/reasoning/tenders/${tenderId}/decision-memo`,
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result: DecisionMemoResponse = await response.json();
            setData(result);
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحميل مذكرة القرار. تأكد أن الباك إند يعمل وأن OpenAI Reasoning Layer شغال.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMemo();
    }, [tenderId]);

    const memoBlocks = useMemo(() => {
        return parseMemoBlocks(data?.executive_memo || "");
    }, [data?.executive_memo]);

    async function copyMemo() {
        if (!data) return;

        const text = [
            `مذكرة قرار الوكيل`,
            `المنافسة: ${data.tender_title}`,
            `العميل: ${data.client}`,
            `القرار: ${data.decision}`,
            `الثقة: ${data.confidence}`,
            "",
            cleanInlineMarkdown(data.executive_memo),
            "",
            "استراتيجية الدخول:",
            cleanInlineMarkdown(data.bid_strategy),
            "",
            "ملاحظات المخاطر:",
            ...data.risk_notes.map((item) => `- ${cleanInlineMarkdown(item)}`),
            "",
            "الإجراءات المقترحة:",
            ...data.recommended_actions.map((item) => `- ${cleanInlineMarkdown(item)}`),
        ].join("\n");

        await navigator.clipboard.writeText(text);
        setCopied(true);

        window.setTimeout(() => setCopied(false), 1800);
    }

    function printMemo() {
        window.print();
    }

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div>
                    <span style={pillStyle}>طبقة التفكير الاصطناعي LLM</span>
                    <h1 style={titleStyle}>مذكرة قرار الوكيل</h1>
                    <p style={subtitleStyle}>
                        تحويل بيانات الجاهزية، موارد الشركة، المستندات، وأدلة الموارد إلى مذكرة تنفيذية نظيفة قابلة للعرض على صاحب القرار.
                    </p>
                </div>

                <div style={heroActionsStyle}>
                    <a href={`/tenders/${tenderId}`} style={secondaryButtonStyle}>
                        العودة للمنافسة
                    </a>

                    <button onClick={copyMemo} disabled={!data} style={secondaryButtonStyle}>
                        {copied ? "تم النسخ" : "نسخ المذكرة"}
                    </button>

                    <button onClick={printMemo} disabled={!data} style={secondaryButtonStyle}>
                        طباعة / حفظ PDF
                    </button>

                    <button onClick={loadMemo} disabled={loading} style={buttonStyle}>
                        {loading ? "جاري التحليل..." : "إعادة توليد المذكرة"}
                    </button>
                </div>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            {loading ? (
                <section style={emptyStyle}>جاري بناء مذكرة القرار من طبقة OpenAI Reasoning...</section>
            ) : null}

            {data ? (
                <>
                    <section style={decisionStyle}>
                        <div>
                            <div style={smallLabelStyle}>المنافسة</div>
                            <h2 style={tenderTitleStyle}>{data.tender_title}</h2>
                            <p style={clientStyle}>{data.client}</p>
                        </div>

                        <div style={{ ...decisionBadgeStyle, borderColor: `${gateColor(data.gate_status)}55` }}>
                            <div style={smallLabelStyle}>قرار الوكيل</div>
                            <strong style={{ color: gateColor(data.gate_status), fontSize: "25px" }}>
                                {data.decision}
                            </strong>
                            <span style={{ color: "#475569", fontWeight: 800 }}>الثقة: {data.confidence}</span>
                        </div>
                    </section>

                    <section style={metricsGridStyle}>
                        <MetricCard
                            title="الجاهزية الداخلية"
                            value={`${data.scores.internal_readiness_score}%`}
                            color={scoreColor(data.scores.internal_readiness_score)}
                        />

                        <MetricCard
                            title="تغطية أدلة المنافسة"
                            value={`${data.scores.documents_coverage_score}%`}
                            color={scoreColor(data.scores.documents_coverage_score)}
                        />

                        <MetricCard
                            title="جاهزية الموارد"
                            value={`${data.scores.resource_readiness_score}%`}
                            color={scoreColor(data.scores.resource_readiness_score)}
                        />

                        <MetricCard
                            title="أدلة الموارد"
                            value={`${data.scores.resource_evidence_coverage_score}%`}
                            color={scoreColor(data.scores.resource_evidence_coverage_score)}
                        />
                    </section>

                    <section style={memoCardStyle}>
                        <div style={sectionHeaderStyle}>
                            <span style={pillStyle}>مذكرة القرار التنفيذية</span>
                            <h2 style={sectionTitleStyle}>المذكرة التنفيذية</h2>
                            <p style={sectionSubtitleStyle}>
                                تم تنظيف مخرجات OpenAI وعرضها كأقسام قابلة للقراءة بدل النص الخام.
                            </p>
                        </div>

                        <div style={structuredMemoStyle}>
                            {memoBlocks.length ? (
                                memoBlocks.map((block, index) => (
                                    <MemoBlockView key={`${block.type}-${index}`} block={block} />
                                ))
                            ) : (
                                <p style={memoTextStyle}>{cleanInlineMarkdown(data.executive_memo)}</p>
                            )}
                        </div>

                        <div style={providerStyle}>
                            <span>المحرك: {data.engine}</span>
                            <span>المصدر: {data.provider}</span>
                            {data.model ? <span>النموذج: {data.model}</span> : null}
                            <span>تاريخ التوليد: {formatDate(data.generated_at)}</span>
                        </div>
                    </section>

                    <section style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <span style={pillStyle}>استراتيجية الدخول</span>
                            <h2 style={sectionTitleStyle}>استراتيجية الدخول المقترحة</h2>
                        </div>

                        <p style={memoTextStyle}>{cleanInlineMarkdown(data.bid_strategy)}</p>
                    </section>

                    <section style={twoColumnsStyle}>
                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <span style={pillStyle}>ملاحظات المخاطر</span>
                                <h2 style={sectionTitleStyle}>ملاحظات المخاطر</h2>
                            </div>

                            <CleanList items={data.risk_notes} emptyText="لا توجد مخاطر ظاهرة في هذه المرحلة." />
                        </div>

                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <span style={pillStyle}>الإجراءات القادمة</span>
                                <h2 style={sectionTitleStyle}>الإجراءات المقترحة</h2>
                            </div>

                            <CleanList items={data.recommended_actions} emptyText="لا توجد إجراءات مطلوبة حاليًا." />
                        </div>
                    </section>

                    <section style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <span style={pillStyle}>مبررات المتطلبات</span>
                            <h2 style={sectionTitleStyle}>تفسير كل متطلب</h2>
                            <p style={sectionSubtitleStyle}>
                                كل متطلب يتم تفسيره بناءً على أفضل مورد مطابق وعدد المستندات الداعمة.
                            </p>
                        </div>

                        <div style={requirementsGridStyle}>
                            {data.requirement_reasoning.map((item) => (
                                <article key={item.requirement_id} style={requirementCardStyle}>
                                    <div style={requirementHeaderStyle}>
                                        <span style={requirementIdStyle}>متطلب {item.requirement_id}</span>
                                        <strong style={{ color: scoreColor(item.match_score), fontSize: "18px" }}>
                                            {item.match_score}%
                                        </strong>
                                    </div>

                                    <h3 style={requirementTitleStyle}>{item.requirement_title}</h3>

                                    <p style={requirementTextStyle}>{cleanInlineMarkdown(item.reasoning)}</p>

                                    <div style={miniGridStyle}>
                                        <MiniInfo title="أفضل مورد" value={item.best_resource || "لا يوجد"} />
                                        <MiniInfo title="المستندات" value={`${item.documents_count}`} />
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </>
            ) : null}
        </main>
    );
}

function MemoBlockView({ block }: { block: MemoBlock }) {
    if (block.type === "heading") {
        return <h3 style={memoHeadingStyle}>{block.text}</h3>;
    }

    if (block.type === "bullet") {
        return (
            <div style={memoBulletStyle}>
                <span style={bulletDotStyle}>✓</span>
                <span>{block.text}</span>
            </div>
        );
    }

    return <p style={memoParagraphStyle}>{block.text}</p>;
}

function CleanList({ items, emptyText }: { items: string[]; emptyText: string }) {
    const cleanItems = items.map(cleanInlineMarkdown).filter(Boolean);

    if (!cleanItems.length) {
        return <div style={emptyMiniStyle}>{emptyText}</div>;
    }

    return (
        <div style={cleanListStyle}>
            {cleanItems.map((item, index) => (
                <div key={`${item}-${index}`} style={cleanListItemStyle}>
                    <span style={bulletDotStyle}>✓</span>
                    <span>{item}</span>
                </div>
            ))}
        </div>
    );
}

function MetricCard({
    title,
    value,
    color,
}: {
    title: string;
    value: string;
    color: string;
}) {
    return (
        <div style={{ ...metricStyle, borderRight: `6px solid ${color}` }}>
            <div style={smallLabelStyle}>{title}</div>
            <strong style={{ color, fontSize: "34px" }}>{value}</strong>
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

function formatDate(value: string) {
    if (!value) return "غير محدد";

    try {
        return new Date(value).toLocaleString("ar-SA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return value;
    }
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
    alignItems: "center",
    gap: "24px",
    padding: "28px",
    background:
        "linear-gradient(135deg, rgba(236,253,245,1) 0%, rgba(255,255,255,1) 55%, rgba(239,246,255,1) 100%)",
    border: "1px solid #d1fae5",
    borderRadius: "26px",
    boxShadow: "0 18px 45px rgba(15,23,42,0.06)",
    marginBottom: "22px",
};

const heroActionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "flex-end",
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

const buttonStyle: CSSProperties = {
    border: "0",
    borderRadius: "16px",
    padding: "14px 22px",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 16px 35px rgba(15,23,42,0.18)",
};

const secondaryButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    padding: "13px 17px",
    background: "white",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
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

const emptyStyle: CSSProperties = {
    padding: "36px",
    textAlign: "center",
    borderRadius: "20px",
    background: "white",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontWeight: 800,
};

const decisionStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    alignItems: "center",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "22px",
    padding: "22px",
    marginBottom: "18px",
};

const tenderTitleStyle: CSSProperties = {
    margin: "6px 0 0",
    fontSize: "26px",
};

const clientStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "#64748b",
};

const decisionBadgeStyle: CSSProperties = {
    minWidth: "240px",
    padding: "18px",
    borderRadius: "18px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
};

const metricsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "18px",
};

const metricStyle: CSSProperties = {
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

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "22px",
    padding: "22px",
    marginBottom: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const memoCardStyle: CSSProperties = {
    ...cardStyle,
    border: "1px solid #bbf7d0",
    background:
        "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(240,253,250,0.65) 100%)",
};

const sectionHeaderStyle: CSSProperties = {
    marginBottom: "12px",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "24px",
};

const sectionSubtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.7,
    fontSize: "13px",
};

const structuredMemoStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
};

const memoTextStyle: CSSProperties = {
    color: "#334155",
    lineHeight: 2,
    fontSize: "16px",
    margin: 0,
};

const memoHeadingStyle: CSSProperties = {
    margin: "12px 0 2px",
    padding: "10px 14px",
    borderRadius: "14px",
    background: "#ecfdf5",
    color: "#166534",
    border: "1px solid #bbf7d0",
    fontSize: "18px",
};

const memoParagraphStyle: CSSProperties = {
    margin: 0,
    color: "#334155",
    lineHeight: 2,
    fontSize: "16px",
};

const memoBulletStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: "14px",
    background: "white",
    border: "1px solid #e2e8f0",
    color: "#334155",
    lineHeight: 1.8,
    fontWeight: 700,
};

const bulletDotStyle: CSSProperties = {
    width: "22px",
    height: "22px",
    minWidth: "22px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: "12px",
    marginTop: "2px",
};

const providerStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 800,
};

const twoColumnsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
};

const cleanListStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
};

const cleanListItemStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    padding: "12px",
    borderRadius: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#334155",
    lineHeight: 1.8,
    fontWeight: 800,
};

const emptyMiniStyle: CSSProperties = {
    padding: "18px",
    borderRadius: "16px",
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontWeight: 800,
};

const requirementsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
};

const requirementCardStyle: CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "16px",
};

const requirementHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    marginBottom: "10px",
};

const requirementIdStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#e0f2fe",
    color: "#075985",
    fontWeight: 900,
    fontSize: "12px",
};

const requirementTitleStyle: CSSProperties = {
    margin: "0 0 10px",
    fontSize: "18px",
};

const requirementTextStyle: CSSProperties = {
    margin: 0,
    color: "#475569",
    lineHeight: 1.9,
};

const miniGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.3fr 0.7fr",
    gap: "10px",
    marginTop: "14px",
};

const miniInfoStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
};