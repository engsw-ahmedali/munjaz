"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { API_BASE_URL } from "@/lib/api";

type ResourceDocument = {
    id: number;
    resource_id: number;
    document_name: string;
    document_type: string;
    mime_type?: string | null;
    notes?: string | null;
    status: string;
    uploaded_at: string;
};

type ResourceMatch = {
    resource_id: number;
    resource_name: string;
    resource_type: string;
    resource_category: string;
    resource_owner: string;
    resource_status: string;
    documents_count: number;
    documents: ResourceDocument[];
    match_score: number;
    confidence: string;
    matched_terms: string[];
    reasons: string[];
    evidence_status: string;
    recommended_action: string;
};

type RequirementMatch = {
    requirement_id: number;
    requirement_title: string;
    requirement_category: string;
    requirement_priority: string;
    current_requirement_status: string;
    decision: string;
    best_score: number;
    best_match: ResourceMatch | null;
    matches_count: number;
    matches: ResourceMatch[];
};

type ResourceIntelligenceResponse = {
    tender_id: number;
    tender_title: string;
    client: string;
    requirements_count: number;
    resources_checked: number;
    resource_readiness_score: number;
    evidence_coverage_score: number;
    requirements_with_usable_evidence: number;
    agent_decision: string;
    recommended_next_action: string;
    requirements: RequirementMatch[];
    engine: string;
};

function scoreColor(score: number) {
    if (score >= 90) return "#16a34a";
    if (score >= 70) return "#0f766e";
    if (score >= 45) return "#f59e0b";
    return "#dc2626";
}

function confidenceColor(confidence: string) {
    if (confidence === "عالية") return "#16a34a";
    if (confidence === "متوسطة") return "#f59e0b";
    if (confidence === "منخفضة") return "#ea580c";
    return "#64748b";
}

function translateResourceType(type: string) {
    const map: Record<string, string> = {
        employee: "موظف",
        project_experience: "خبرة سابقة",
        certification: "شهادة",
        template: "قالب",
        product: "منتج",
        capability: "قدرة تشغيلية",
        partner: "شريك / مورد",
    };

    return map[type] || type;
}

export default function CompanyResourceIntelligence() {
    const params = useParams();
    const tenderId = params?.id;

    const [data, setData] = useState<ResourceIntelligenceResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    async function runResourceAnalysis() {
        if (!tenderId) return;

        try {
            setLoading(true);
            setMessage("");

            const response = await fetch(
                `${API_BASE_URL}/resources/match/tender/${tenderId}`,
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result: ResourceIntelligenceResponse = await response.json();
            setData(result);
        } catch (error) {
            console.error(error);
            setMessage("تعذر تشغيل تحليل موارد الشركة. تأكد أن الباك إند يعمل وأن endpoint المطابقة شغال.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        runResourceAnalysis();
    }, [tenderId]);

    return (
        <section style={wrapperStyle}>
            <div style={headerStyle}>
                <div>
                    <span style={pillStyle}>Company Resource Intelligence</span>
                    <h2 style={titleStyle}>تحليل موارد الشركة</h2>
                    <p style={subtitleStyle}>
                        الوكيل يطابق متطلبات المنافسة مع موارد الشركة، ويتحقق من وجود مستندات داعمة قابلة للاستخدام قبل قرار التقديم.
                    </p>
                </div>

                <button onClick={runResourceAnalysis} disabled={loading} style={buttonStyle}>
                    {loading ? "جاري التحليل..." : "تشغيل التحليل"}
                </button>
            </div>

            {message ? <div style={errorStyle}>{message}</div> : null}

            {!data && !loading ? (
                <div style={emptyStyle}>
                    اضغط تشغيل التحليل لعرض مطابقة موارد الشركة مع متطلبات المنافسة.
                </div>
            ) : null}

            {loading ? (
                <div style={emptyStyle}>جاري تحليل موارد الشركة وربطها بالمتطلبات...</div>
            ) : null}

            {data ? (
                <>
                    <div style={summaryGridStyle}>
                        <MetricCard
                            label="جاهزية موارد الشركة"
                            value={`${data.resource_readiness_score}%`}
                            hint="متوسط قوة مطابقة الموارد للمتطلبات"
                            color={scoreColor(data.resource_readiness_score)}
                        />

                        <MetricCard
                            label="تغطية الأدلة"
                            value={`${data.evidence_coverage_score}%`}
                            hint="المتطلبات التي تملك موردًا مع مستند داعم"
                            color={scoreColor(data.evidence_coverage_score)}
                        />

                        <MetricCard
                            label="متطلبات مدعومة بدليل"
                            value={`${data.requirements_with_usable_evidence}/${data.requirements_count}`}
                            hint="عدد المتطلبات التي يمكن دعمها من الموارد"
                            color="#2563eb"
                        />

                        <MetricCard
                            label="موارد تم فحصها"
                            value={`${data.resources_checked}`}
                            hint="عدد موارد الشركة التي راجعها الوكيل"
                            color="#9333ea"
                        />
                    </div>

                    <div style={decisionBoxStyle}>
                        <div>
                            <div style={smallLabelStyle}>قرار الوكيل</div>
                            <strong style={decisionTextStyle}>{data.agent_decision}</strong>
                        </div>

                        <div style={recommendationStyle}>
                            <div style={smallLabelStyle}>الإجراء التالي المقترح</div>
                            <span>{data.recommended_next_action}</span>
                        </div>
                    </div>

                    <div style={requirementsListStyle}>
                        {data.requirements.map((requirement) => (
                            <article key={requirement.requirement_id} style={requirementCardStyle}>
                                <div style={requirementHeaderStyle}>
                                    <div>
                                        <div style={badgeRowStyle}>
                                            <Badge text={`متطلب ${requirement.requirement_id}`} color="#0f172a" />
                                            <Badge text={requirement.requirement_category} color="#2563eb" />
                                            <Badge text={`أولوية: ${requirement.requirement_priority}`} color="#dc2626" />
                                        </div>

                                        <h3 style={requirementTitleStyle}>{requirement.requirement_title}</h3>
                                        <p style={requirementDecisionStyle}>{requirement.decision}</p>
                                    </div>

                                    <div style={scoreBoxStyle}>
                                        <div style={smallLabelStyle}>أفضل نتيجة</div>
                                        <strong style={{ color: scoreColor(requirement.best_score), fontSize: "28px" }}>
                                            {requirement.best_score}%
                                        </strong>
                                    </div>
                                </div>

                                {requirement.best_match ? (
                                    <div style={matchBoxStyle}>
                                        <div style={matchHeaderStyle}>
                                            <div>
                                                <div style={smallLabelStyle}>أفضل مورد مطابق</div>
                                                <h4 style={matchTitleStyle}>{requirement.best_match.resource_name}</h4>
                                            </div>

                                            <div style={badgeRowStyle}>
                                                <Badge
                                                    text={translateResourceType(requirement.best_match.resource_type)}
                                                    color="#0f766e"
                                                />
                                                <Badge
                                                    text={`الثقة: ${requirement.best_match.confidence}`}
                                                    color={confidenceColor(requirement.best_match.confidence)}
                                                />
                                                <Badge
                                                    text={`المستندات: ${requirement.best_match.documents_count}`}
                                                    color={requirement.best_match.documents_count > 0 ? "#16a34a" : "#dc2626"}
                                                />
                                            </div>
                                        </div>

                                        <div style={miniGridStyle}>
                                            <MiniInfo title="المالك" value={requirement.best_match.resource_owner} />
                                            <MiniInfo title="حالة الدليل" value={requirement.best_match.evidence_status} />
                                            <MiniInfo title="عدد المطابقات" value={`${requirement.matches_count}`} />
                                        </div>

                                        <div style={reasonBoxStyle}>
                                            <strong>سبب المطابقة:</strong>
                                            <ul style={listStyle}>
                                                {requirement.best_match.reasons.map((reason, index) => (
                                                    <li key={`${requirement.requirement_id}-reason-${index}`}>{reason}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div style={actionBoxStyle}>
                                            <strong>الإجراء المقترح:</strong>
                                            <span>{requirement.best_match.recommended_action}</span>
                                        </div>

                                        {requirement.best_match.documents.length > 0 ? (
                                            <div style={documentsBoxStyle}>
                                                <strong style={{ display: "block", marginBottom: "10px" }}>
                                                    المستندات الداعمة
                                                </strong>

                                                {requirement.best_match.documents.map((document) => (
                                                    <div key={document.id} style={documentRowStyle}>
                                                        <div>
                                                            <strong>{document.document_name}</strong>
                                                            <div style={documentNoteStyle}>
                                                                {document.notes || "لا توجد ملاحظات."}
                                                            </div>
                                                        </div>

                                                        <a
                                                            href={`${API_BASE_URL}/resources/documents/${document.id}/download`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={downloadButtonStyle}
                                                        >
                                                            فتح المستند
                                                        </a>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={warningBoxStyle}>
                                                لا يوجد مستند داعم على أفضل مورد مطابق. ارفع مستندًا من صفحة موارد الشركة لزيادة قوة القرار.
                                            </div>
                                        )}

                                        {requirement.best_match.matched_terms.length > 0 ? (
                                            <div style={termsRowStyle}>
                                                {requirement.best_match.matched_terms.map((term) => (
                                                    <span key={term} style={termStyle}>
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div style={warningBoxStyle}>
                                        لا يوجد مورد مناسب لهذا المتطلب. أضف موردًا جديدًا أو ارفع مستندات داعمة في صفحة الموارد.
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}

function MetricCard({
    label,
    value,
    hint,
    color,
}: {
    label: string;
    value: string;
    hint: string;
    color: string;
}) {
    return (
        <div style={{ ...metricCardStyle, borderRight: `6px solid ${color}` }}>
            <div style={smallLabelStyle}>{label}</div>
            <strong style={{ fontSize: "32px", color }}>{value}</strong>
            <div style={metricHintStyle}>{hint}</div>
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

function Badge({ text, color }: { text: string; color: string }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: "999px",
                background: `${color}12`,
                color,
                border: `1px solid ${color}33`,
                fontWeight: 900,
                fontSize: "12px",
            }}
        >
            {text}
        </span>
    );
}

const wrapperStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "24px",
    marginTop: "24px",
    marginBottom: "24px",
    boxShadow: "0 18px 45px rgba(15,23,42,0.05)",
};

const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    alignItems: "flex-start",
    marginBottom: "20px",
};

const pillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "8px 14px",
    borderRadius: "999px",
    background: "#ecfeff",
    color: "#0f766e",
    border: "1px solid #99f6e4",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "10px",
};

const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: "26px",
    letterSpacing: "-0.03em",
};

const subtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.8,
};

const buttonStyle: CSSProperties = {
    border: "0",
    borderRadius: "14px",
    padding: "13px 18px",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(15,23,42,0.18)",
    minWidth: "145px",
};

const errorStyle: CSSProperties = {
    padding: "14px",
    borderRadius: "14px",
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 800,
    marginBottom: "16px",
};

const emptyStyle: CSSProperties = {
    padding: "28px",
    borderRadius: "18px",
    background: "#f8fafc",
    color: "#64748b",
    border: "1px dashed #cbd5e1",
    textAlign: "center",
    fontWeight: 800,
};

const summaryGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "16px",
};

const metricCardStyle: CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "18px",
};

const smallLabelStyle: CSSProperties = {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "6px",
};

const metricHintStyle: CSSProperties = {
    color: "#64748b",
    fontSize: "12px",
    marginTop: "6px",
    lineHeight: 1.6,
};

const decisionBoxStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1.6fr",
    gap: "14px",
    padding: "18px",
    borderRadius: "18px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    marginBottom: "18px",
};

const decisionTextStyle: CSSProperties = {
    color: "#166534",
    fontSize: "20px",
};

const recommendationStyle: CSSProperties = {
    color: "#166534",
    lineHeight: 1.8,
    fontWeight: 700,
};

const requirementsListStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
};

const requirementCardStyle: CSSProperties = {
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "18px",
    background: "#ffffff",
};

const requirementHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    marginBottom: "14px",
};

const badgeRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
};

const requirementTitleStyle: CSSProperties = {
    margin: "12px 0 6px",
    fontSize: "20px",
};

const requirementDecisionStyle: CSSProperties = {
    margin: 0,
    color: "#64748b",
    fontWeight: 800,
};

const scoreBoxStyle: CSSProperties = {
    minWidth: "110px",
    textAlign: "center",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
};

const matchBoxStyle: CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "16px",
};

const matchHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    marginBottom: "14px",
};

const matchTitleStyle: CSSProperties = {
    margin: "0",
    fontSize: "18px",
};

const miniGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "12px",
};

const miniInfoStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
};

const reasonBoxStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
    marginBottom: "10px",
    color: "#334155",
};

const listStyle: CSSProperties = {
    margin: "8px 0 0",
    paddingRight: "18px",
    color: "#475569",
    lineHeight: 1.8,
};

const actionBoxStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e3a8a",
    borderRadius: "14px",
    padding: "12px",
    marginBottom: "10px",
    lineHeight: 1.8,
};

const documentsBoxStyle: CSSProperties = {
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    borderRadius: "14px",
    padding: "12px",
    marginBottom: "10px",
};

const documentRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    background: "white",
    border: "1px solid #d1fae5",
    borderRadius: "12px",
    padding: "12px",
};

const documentNoteStyle: CSSProperties = {
    color: "#64748b",
    marginTop: "5px",
    fontSize: "12px",
    lineHeight: 1.6,
};

const downloadButtonStyle: CSSProperties = {
    display: "inline-flex",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#0f766e",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: "12px",
    whiteSpace: "nowrap",
};

const warningBoxStyle: CSSProperties = {
    padding: "14px",
    borderRadius: "14px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontWeight: 800,
    lineHeight: 1.8,
};

const termsRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
};

const termStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#e0f2fe",
    color: "#075985",
    fontWeight: 900,
    fontSize: "12px",
};