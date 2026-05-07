"use client";
import CompanyResourceIntelligence from "./CompanyResourceIntelligence";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

type TenderDetails = {
    id: number;
    title: string;
    client: string;
    status: string;
    readiness_score: number;
    description: string;
    submission_deadline: string;
};

type Requirement = {
    id: number;
    title: string;
    category: string;
    priority: string;
    status: string;
};

type Analysis = {
    tender_id: number;
    covered_count: number;
    partial_count: number;
    uncovered_count: number;
    risk_level: string;
    recommendation: string;
    blockers: string[];
};

type SuggestedTask = {
    id: string;
    title: string;
    owner: string;
    priority: string;
    status: string;
    reason: string;
    linked_requirement_id: number;
    category: string;
    tender_id: number;
    source?: string;
};

type TenderDocument = {
    id: number;
    tender_id: number;
    original_filename: string;
    stored_filename: string;
    file_path: string;
    mime_type: string | null;
    extraction_status: string;
    extracted_text: string | null;
    uploaded_at: string;
};

type CoverageRequirement = {
    requirement_id: number;
    requirement_title: string;
    category: string;
    priority: string;
    current_system_status: string;
    document_coverage_status: string;
    confidence: string;
    matched_keywords: string[];
    reason: string;
};

type DocumentCoverageAnalysis = {
    tender_id: number;
    document_id: number;
    document_name: string;
    coverage_summary: {
        covered_count: number;
        partial_count: number;
        uncovered_count: number;
        total_requirements: number;
        risk_level: string;
        recommendation: string;
    };
    requirements_coverage: CoverageRequirement[];
    gaps: CoverageRequirement[];
};

type CreateGapTasksResponse = {
    message: string;
    created_count: number;
    skipped_count: number;
    created_tasks: SuggestedTask[];
    skipped_task_ids: string[];
    coverage_summary: {
        covered_count: number;
        partial_count: number;
        uncovered_count: number;
        total_requirements: number;
        risk_level: string;
        recommendation: string;
    };
};

type RequirementDocumentCoverage = {
    requirement_id: number;
    requirement_title: string;
    category: string;
    priority: string;
    current_system_status: string;
    best_document_coverage_status: string;
    confidence: string;
    matched_keywords: string[];
    best_evidence_document: {
        document_id: number;
        document_name: string;
    } | null;
    reason: string;
};

type DocumentsCoverageSummary = {
    tender_id: number;
    internal_readiness_score: number;
    documents_coverage_score: number;
    covered_count: number;
    partial_count: number;
    uncovered_count: number;
    total_requirements: number;
    documents_count: number;
    risk_level: string;
    recommendation: string;
    decision_note: string;
    requirements_document_coverage: RequirementDocumentCoverage[];
};

type SubmissionGateCheck = {
    key: string;
    label: string;
    passed: boolean;
    value: number;
    required_value: number;
    message: string;
};

type SubmissionGateBlocker = {
    requirement_id: number;
    requirement_title: string;
    priority: string;
    evidence_status: string;
    confidence: string;
    has_open_gap_task: boolean;
    best_evidence_document: {
        document_id: number;
        document_name: string;
    } | null;
    reason: string;
    required_action: string;
};

type SubmissionGateAction = {
    action_type: string;
    title: string;
    description: string;
    owner: string;
    priority: string;
    evidence_status?: string;
    requirement_id?: number;
};

type SubmissionGateCheckCollection = SubmissionGateCheck[] | Record<string, SubmissionGateCheck>;

type SubmissionGate = {
    tender_id: number;
    tender_title: string;
    client: string;
    can_submit: boolean;
    gate_status: string;
    decision: string;
    risk_level: string;
    human_review_required: boolean;
    internal_readiness_score: number;
    documents_coverage_score: number;
    documents_count: number;
    total_requirements: number;
    covered_count: number;
    partial_count: number;
    uncovered_count: number;
    open_tasks_count: number;
    open_gap_tasks_count: number;
    critical_blockers_count: number;
    critical_blockers: SubmissionGateBlocker[];
    required_actions: SubmissionGateAction[];
    failed_checks: SubmissionGateCheckCollection;
    passed_checks: SubmissionGateCheckCollection;
    rules: string[];
    blocking_reasons: string[];
    next_action: string;
    audit_trail: {
        agent: string;
        rules: string[];
        internal_analysis: Analysis;
        documents_summary_decision_note: string;
        documents_summary_recommendation: string;
    };
};

type DecisionGate = {
    decision: string;
    confidence: string;
    tone: "go" | "conditional" | "block";
    mainReason: string;
    nextAction: string;
};

type ResourceEvidenceDocument = {
    id: number;
    resource_id: number;
    document_name: string;
    document_type: string;
    mime_type?: string | null;
    notes?: string | null;
    status: string;
    uploaded_at: string;
};

type ResourceRequirementBestMatch = {
    resource_id: number;
    resource_name: string;
    resource_type: string;
    resource_category: string;
    resource_owner: string;
    resource_status: string;
    documents_count: number;
    documents: ResourceEvidenceDocument[];
    match_score: number;
    confidence: string;
    matched_terms: string[];
    reasons: string[];
    evidence_status: string;
    recommended_action: string;
};

type ResourceRequirementMatch = {
    requirement_id: number;
    requirement_title: string;
    requirement_category: string;
    requirement_priority: string;
    current_requirement_status: string;
    decision: string;
    best_score: number;
    best_match: ResourceRequirementBestMatch | null;
    matches_count: number;
    matches: ResourceRequirementBestMatch[];
};

type CompanyResourceGate = {
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
    requirements: ResourceRequirementMatch[];
    engine: string;
};

const COLORS = {
    navy: "#0f172a",
    navy2: "#111827",
    page: "#f8fafc",
    card: "#ffffff",
    muted: "#64748b",
    lightMuted: "#94a3b8",
    border: "#e5e7eb",
    softBorder: "#eef2f7",
    blue: "#2563eb",
    green: "#059669",
    red: "#dc2626",
    orange: "#ea580c",
    amber: "#b45309",
    purple: "#7c3aed",
    teal: "#0f766e",
};

function getApiBaseUrl() {
    return process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
}

function translateStatus(status: string) {
    const map: Record<string, string> = {
        UNDER_REVIEW: "قيد المراجعة",
        BID_IN_PROGRESS: "التجهيز للتقديم",
        CONDITIONAL_BID: "دخول مشروط",
        NO_BID: "عدم التقديم",
        SUBMISSION_READY: "جاهز للتقديم",
        SUBMITTED: "تم التقديم",
    };

    return map[status] || status;
}

function translateExtractionStatus(status: string) {
    const map: Record<string, string> = {
        pending: "بانتظار الاستخراج",
        completed: "تم الاستخراج",
        failed: "فشل الاستخراج",
    };

    return map[status] || status;
}

function translateGateStatus(status: string) {
    const map: Record<string, string> = {
        PASSED: "اجتازت بوابة التقديم",
        READY_TO_SUBMIT: "جاهز للتقديم",
        BLOCKED: "محجوب",
        BLOCKED_BY_EVIDENCE: "محجوب بسبب ضعف الأدلة",
        BLOCKED_BY_INTERNAL_READINESS: "محجوب بسبب الجاهزية الداخلية",
        BLOCKED_BY_TASKS: "محجوب بسبب مهام مفتوحة",
        HUMAN_REVIEW_REQUIRED: "يتطلب مراجعة بشرية",
    };

    return map[status] || status;
}

function normalizeSubmissionGateChecks(
    checks: SubmissionGateCheckCollection | null | undefined
): SubmissionGateCheck[] {
    if (Array.isArray(checks)) {
        return checks;
    }

    if (checks && typeof checks === "object") {
        return Object.values(checks);
    }

    return [];
}

function formatDate(value: string) {
    if (!value) return "-";

    try {
        return new Date(value).toLocaleString("ar-SA");
    } catch {
        return value;
    }
}

function getCoverageBadgeStyle(status: string): CSSProperties {
    if (status === "مغطى") {
        return {
            background: "#ecfdf5",
            color: "#065f46",
            border: "1px solid #a7f3d0",
        };
    }

    if (status === "مغطى جزئيًا") {
        return {
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
        };
    }

    return {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
    };
}

function getRiskStyle(riskLevel: string): CSSProperties {
    if (riskLevel === "منخفض") {
        return {
            background: "#ecfdf5",
            color: "#065f46",
            border: "1px solid #a7f3d0",
        };
    }

    if (riskLevel === "متوسط") {
        return {
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
        };
    }

    return {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
    };
}

function getPriorityStyle(priority: string): CSSProperties {
    if (priority === "عالية") {
        return {
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
        };
    }

    if (priority === "متوسطة") {
        return {
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
        };
    }

    return {
        background: "#f8fafc",
        color: "#334155",
        border: "1px solid #cbd5e1",
    };
}

function getDecisionVisual(tone: DecisionGate["tone"]) {
    if (tone === "go") {
        return {
            gradient: "linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)",
            badgeBackground: "#ecfdf5",
            badgeColor: "#065f46",
            accent: "#10b981",
            label: "قرار آمن",
        };
    }

    if (tone === "conditional") {
        return {
            gradient: "linear-gradient(135deg, #7c2d12 0%, #ea580c 52%, #f59e0b 100%)",
            badgeBackground: "#fff7ed",
            badgeColor: "#9a3412",
            accent: "#f97316",
            label: "قرار مشروط",
        };
    }

    return {
        gradient: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 52%, #ef4444 100%)",
        badgeBackground: "#fef2f2",
        badgeColor: "#991b1b",
        accent: "#ef4444",
        label: "قرار محجوب",
    };
}

function buildDecisionGate(
    tender: TenderDetails | null,
    analysis: Analysis | null,
    summary: DocumentsCoverageSummary | null,
    submissionGate: SubmissionGate | null,
    resourceGate: CompanyResourceGate | null
): DecisionGate {
    const resourceReadinessScore = resourceGate?.resource_readiness_score ?? 0;
    const resourceEvidenceCoverageScore = resourceGate?.evidence_coverage_score ?? 0;
    const resourceEvidenceIsStrong =
        resourceReadinessScore >= 80 && resourceEvidenceCoverageScore >= 90;

    if (submissionGate) {
        const failedChecks = normalizeSubmissionGateChecks(submissionGate.failed_checks);
        const hasBlockingReasons = submissionGate.blocking_reasons.length > 0;
        const hasRequiredActions = submissionGate.required_actions.length > 0;
        const hasExecutionBlockers =
            submissionGate.open_gap_tasks_count > 0 ||
            submissionGate.open_tasks_count > 0 ||
            submissionGate.critical_blockers_count > 0;

        if (
            !submissionGate.can_submit &&
            resourceEvidenceIsStrong &&
            submissionGate.internal_readiness_score >= 90 &&
            !hasExecutionBlockers
        ) {
            return {
                decision: "جاهز للتقديم بدعم موارد الشركة",
                confidence: resourceEvidenceCoverageScore >= 95 ? "مرتفعة" : "متوسطة",
                tone: "go",
                mainReason:
                    "بوابة التقديم استفادت من طبقة موارد الشركة: الجاهزية الداخلية قوية، والموارد المطابقة تغطي المتطلبات، ويوجد دليل داعم قابل للاستخدام لكل مورد مؤثر.",
                nextAction:
                    resourceGate?.recommended_next_action ||
                    "اعتماد أدلة الموارد المطابقة ضمن ملف التقديم وإجراء مراجعة نهائية قبل الإرسال.",
            };
        }

        if (submissionGate.can_submit || submissionGate.gate_status === "PASSED") {
            return {
                decision: "جاهز للتقديم",
                confidence:
                    submissionGate.documents_coverage_score >= 90 &&
                        submissionGate.internal_readiness_score >= 90
                        ? "مرتفعة"
                        : "متوسطة",
                tone: "go",
                mainReason:
                    resourceEvidenceIsStrong
                        ? "بوابة التقديم اجتازت الفحوصات، وطبقة موارد الشركة أكدت أن المتطلبات مدعومة بموارد داخلية عليها أدلة قابلة للاستخدام."
                        : "بوابة التقديم اجتازت جميع الفحوصات: الجاهزية الداخلية مكتملة، الأدلة مقبولة، ولا توجد مهام أو عوائق حرجة تمنع التقديم.",
                nextAction:
                    resourceGate?.recommended_next_action ||
                    submissionGate.next_action ||
                    "إجراء مراجعة نهائية للعرض واعتماد نسخة التقديم.",
            };
        }

        if (
            submissionGate.gate_status === "BLOCKED_BY_EVIDENCE" ||
            submissionGate.documents_coverage_score < 90
        ) {
            return {
                decision: "محجوب بسبب ضعف الأدلة",
                confidence: "متوسطة",
                tone: "block",
                mainReason:
                    submissionGate.blocking_reasons[0] ||
                    "الجاهزية الداخلية قد تكون مقبولة، لكن الأدلة المرفوعة لا تثبت المتطلبات بدرجة كافية لاعتماد التقديم.",
                nextAction:
                    submissionGate.next_action ||
                    "رفع أدلة داعمة وربطها بالمتطلبات ثم إعادة فحص بوابة التقديم.",
            };
        }

        if (
            submissionGate.gate_status === "BLOCKED_BY_INTERNAL_READINESS" ||
            submissionGate.internal_readiness_score < 90
        ) {
            return {
                decision: "محجوب بسبب الجاهزية الداخلية",
                confidence: "متوسطة",
                tone: "block",
                mainReason:
                    submissionGate.blocking_reasons[0] ||
                    "لا تزال بعض المتطلبات الداخلية غير مكتملة، وهذا يمنع اعتماد قرار التقديم حتى لو توفرت مستندات داعمة.",
                nextAction:
                    submissionGate.next_action ||
                    "إغلاق المتطلبات غير المغطاة أو المغطاة جزئيًا ثم إعادة تحديث المركز.",
            };
        }

        if (submissionGate.open_gap_tasks_count > 0 || submissionGate.open_tasks_count > 0) {
            return {
                decision: "محجوب بسبب مهام مفتوحة",
                confidence: "متوسطة",
                tone: "block",
                mainReason:
                    submissionGate.blocking_reasons[0] ||
                    "توجد مهام تنفيذية مفتوحة مرتبطة بالفجوات، ولا يمكن اعتماد التقديم قبل إغلاقها أو ربطها بدليل مقبول.",
                nextAction:
                    submissionGate.next_action ||
                    "إكمال المهام المفتوحة وربطها بأدلة ثم إعادة فحص بوابة التقديم.",
            };
        }

        if (submissionGate.human_review_required || failedChecks.length > 0 || hasBlockingReasons) {
            return {
                decision: "يتطلب مراجعة بشرية",
                confidence: "متوسطة",
                tone: "conditional",
                mainReason:
                    submissionGate.blocking_reasons[0] ||
                    "توجد مؤشرات تحتاج مراجعة بشرية قبل اعتماد القرار النهائي.",
                nextAction:
                    submissionGate.next_action ||
                    "مراجعة الفحوصات غير الناجحة واتخاذ قرار اعتماد يدوي.",
            };
        }

        if (hasRequiredActions) {
            return {
                decision: "دخول مشروط",
                confidence: "متوسطة",
                tone: "conditional",
                mainReason:
                    "توجد إجراءات تشغيلية مطلوبة قبل اعتماد التقديم النهائي.",
                nextAction:
                    submissionGate.next_action ||
                    submissionGate.required_actions[0]?.title ||
                    "استكمال الإجراءات المطلوبة قبل الاعتماد.",
            };
        }
    }

    const internalScore = summary?.internal_readiness_score ?? tender?.readiness_score ?? 0;
    const evidenceScore = Math.max(
        summary?.documents_coverage_score ?? 0,
        resourceGate?.evidence_coverage_score ?? 0
    );
    const uncovered = summary?.uncovered_count ?? analysis?.uncovered_count ?? 0;
    const partial = summary?.partial_count ?? analysis?.partial_count ?? 0;
    const documentsCount = summary?.documents_count ?? 0;

    if (documentsCount === 0) {
        return {
            decision: "دخول مشروط",
            confidence: "منخفضة",
            tone: "conditional",
            mainReason:
                "لا توجد مستندات كافية لإثبات الجاهزية، حتى لو كانت المتطلبات الداخلية تبدو مقبولة.",
            nextAction:
                "رفع مستندات داعمة ثم تشغيل استخراج النص وتحليل تغطية المتطلبات.",
        };
    }

    if (internalScore >= 90 && evidenceScore >= 90 && uncovered === 0 && partial === 0) {
        return {
            decision: "دخول موصى به",
            confidence: "مرتفعة",
            tone: "go",
            mainReason:
                "الجاهزية الداخلية قوية ومستندات الإثبات تغطي المتطلبات بشكل كافٍ.",
            nextAction:
                "إجراء مراجعة نهائية للتقديم وتجهيز نسخة العرض النهائي.",
        };
    }

    if (internalScore >= 80 && evidenceScore < 80) {
        return {
            decision: "دخول مشروط بالأدلة",
            confidence: evidenceScore >= 50 ? "متوسطة" : "منخفضة",
            tone: "conditional",
            mainReason:
                "الفريق يبدو جاهزًا داخليًا، لكن المستندات لا تثبت كل المتطلبات بصورة كافية.",
            nextAction:
                "إكمال مهام فجوات المستندات أو رفع أدلة داعمة قبل اعتماد قرار التقديم.",
        };
    }

    if (uncovered >= 2 || evidenceScore < 50) {
        return {
            decision: "لا يعتمد قبل المعالجة",
            confidence: "متوسطة",
            tone: "block",
            mainReason:
                "توجد فجوات أدلة مؤثرة قد تجعل قرار الدخول عالي المخاطرة.",
            nextAction:
                "معالجة الفجوات الحرجة أولًا ثم إعادة تشغيل تحليل التغطية.",
        };
    }

    return {
        decision: "دخول مشروط",
        confidence: "متوسطة",
        tone: "conditional",
        mainReason:
            "توجد تغطية جزئية لبعض المتطلبات، ويجب استكمال الأدلة قبل القرار النهائي.",
        nextAction:
            "استكمال الأدلة الجزئية ومراجعة المتطلبات ذات الثقة المتوسطة أو المنخفضة.",
    };
}

type AgentWorkflowStepperProps = {
    documentsCount: number;
    requirementsCount: number;
    resourceGate: CompanyResourceGate | null;
    documentsCoverageSummary: DocumentsCoverageSummary | null;
    suggestedTasksCount: number;
    submissionGate: SubmissionGate | null;
};

function AgentWorkflowStepper({
    documentsCount,
    requirementsCount,
    resourceGate,
    documentsCoverageSummary,
    suggestedTasksCount,
    submissionGate,
}: AgentWorkflowStepperProps) {
    const steps: { label: string; done: boolean; active: boolean }[] = [
        {
            label: "قراءة الكراسة",
            done: documentsCount > 0,
            active: documentsCount === 0,
        },
        {
            label: "استخراج المتطلبات",
            done: requirementsCount > 0,
            active: documentsCount > 0 && requirementsCount === 0,
        },
        {
            label: "مطابقة الموارد",
            done: resourceGate !== null,
            active: requirementsCount > 0 && resourceGate === null,
        },
        {
            label: "تحليل الأدلة",
            done: documentsCoverageSummary !== null,
            active: resourceGate !== null && documentsCoverageSummary === null,
        },
        {
            label: "توليد مهام الفجوات",
            done: suggestedTasksCount > 0,
            active: documentsCoverageSummary !== null && suggestedTasksCount === 0,
        },
        {
            label: "بوابة التقديم",
            done: submissionGate?.can_submit === true,
            active: suggestedTasksCount > 0 && submissionGate?.can_submit !== true,
        },
    ];

    return (
        <div
            style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "18px",
                padding: "14px 20px",
                marginBottom: "14px",
                boxShadow: "0 8px 22px rgba(15,23,42,0.035)",
                display: "flex",
                alignItems: "center",
                gap: "0",
                overflowX: "auto",
            }}
        >
            <span
                style={{
                    fontSize: "11px",
                    fontWeight: 900,
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                    marginLeft: "14px",
                    paddingLeft: "14px",
                    borderLeft: "1px solid #e5e7eb",
                    letterSpacing: "0.04em",
                }}
            >
                سير عمل الوكيل
            </span>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0",
                    flex: 1,
                }}
            >
                {steps.map((step, idx) => (
                    <div
                        key={step.label}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "7px",
                                padding: "7px 11px",
                                borderRadius: "999px",
                                background: step.done
                                    ? "rgba(89,186,71,0.10)"
                                    : step.active
                                        ? "rgba(37,99,235,0.09)"
                                        : "transparent",
                                border: step.done
                                    ? "1px solid rgba(89,186,71,0.30)"
                                    : step.active
                                        ? "1px solid rgba(37,99,235,0.22)"
                                        : "1px solid transparent",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <span
                                style={{
                                    width: "16px",
                                    height: "16px",
                                    borderRadius: "999px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "10px",
                                    fontWeight: 900,
                                    background: step.done
                                        ? "#59BA47"
                                        : step.active
                                            ? "#2563eb"
                                            : "#e5e7eb",
                                    color: step.done || step.active ? "white" : "#94a3b8",
                                    flexShrink: 0,
                                }}
                            >
                                {step.done ? "✓" : idx + 1}
                            </span>
                            <span
                                style={{
                                    fontSize: "12px",
                                    fontWeight: 800,
                                    color: step.done
                                        ? "#2d7a1e"
                                        : step.active
                                            ? "#1d4ed8"
                                            : "#94a3b8",
                                }}
                            >
                                {step.label}
                            </span>
                        </div>

                        {idx < steps.length - 1 && (
                            <div
                                style={{
                                    flex: 1,
                                    height: "1px",
                                    background: step.done
                                        ? "#59BA47"
                                        : "#e5e7eb",
                                    minWidth: "8px",
                                    opacity: step.done ? 0.5 : 1,
                                }}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function MiniStatPill({ label, value }: { label: string; value: string }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.22)",
                fontSize: "12px",
                fontWeight: 800,
                color: "rgba(255,255,255,0.90)",
                whiteSpace: "nowrap",
            }}
        >
            <strong style={{ fontSize: "14px" }}>{value}</strong>
            {label}
        </span>
    );
}

function Badge({
    children,
    style,
}: {
    children: ReactNode;
    style: CSSProperties;
}) {
    return (
        <span
            style={{
                ...style,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                padding: "6px 11px",
                fontSize: "12px",
                fontWeight: 800,
                whiteSpace: "nowrap",
                lineHeight: 1,
            }}
        >
            {children}
        </span>
    );
}

function PrimaryButton({
    children,
    onClick,
    disabled,
    tone = "navy",
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    tone?: "navy" | "teal" | "brown" | "light";
}) {
    const styles: Record<string, CSSProperties> = {
        navy: {
            background: COLORS.navy,
            color: "white",
            border: "1px solid transparent",
        },
        teal: {
            background: COLORS.teal,
            color: "white",
            border: "1px solid transparent",
        },
        brown: {
            background: "#7c2d12",
            color: "white",
            border: "1px solid transparent",
        },
        light: {
            background: "#f8fafc",
            color: COLORS.navy,
            border: "1px solid #d1d5db",
        },
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                ...styles[tone],
                borderRadius: "12px",
                padding: "11px 14px",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.68 : 1,
                fontWeight: 900,
                boxShadow:
                    tone === "light" ? "none" : "0 10px 20px rgba(15, 23, 42, 0.12)",
            }}
        >
            {children}
        </button>
    );
}

function KpiCard({
    label,
    value,
    helper,
    accent,
}: {
    label: string;
    value: string | number;
    helper?: string;
    accent: string;
}) {
    return (
        <div
            style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "18px",
                padding: "17px",
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.04)",
                position: "relative",
                overflow: "hidden",
                minHeight: "108px",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    insetInlineEnd: 0,
                    insetBlockStart: 0,
                    width: "7px",
                    height: "100%",
                    background: accent,
                }}
            />

            <p
                style={{
                    margin: 0,
                    color: COLORS.muted,
                    fontSize: "13px",
                    fontWeight: 800,
                }}
            >
                {label}
            </p>

            <h3
                style={{
                    margin: "12px 0 4px",
                    color: COLORS.navy,
                    fontSize: "32px",
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                }}
            >
                {value}
            </h3>

            {helper && (
                <p
                    style={{
                        margin: 0,
                        color: COLORS.lightMuted,
                        fontSize: "12px",
                        lineHeight: 1.7,
                    }}
                >
                    {helper}
                </p>
            )}
        </div>
    );
}

function ProgressBar({
    value,
    color,
}: {
    value: number;
    color: string;
}) {
    const safeValue = Math.max(0, Math.min(100, value));

    return (
        <div
            style={{
                width: "100%",
                height: "10px",
                borderRadius: "999px",
                background: "#e5e7eb",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    width: `${safeValue}%`,
                    height: "100%",
                    borderRadius: "999px",
                    background: color,
                }}
            />
        </div>
    );
}

function SectionCard({
    children,
    style,
}: {
    children: ReactNode;
    style?: CSSProperties;
}) {
    return (
        <section
            style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "22px",
                padding: "22px",
                marginBottom: "22px",
                boxShadow: "0 14px 36px rgba(15, 23, 42, 0.04)",
                ...style,
            }}
        >
            {children}
        </section>
    );
}

function SectionHeader({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
}) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "18px",
            }}
        >
            <div>
                <h2
                    style={{
                        margin: 0,
                        color: COLORS.navy,
                        fontSize: "22px",
                        lineHeight: 1.4,
                        letterSpacing: "-0.02em",
                    }}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p
                        style={{
                            margin: "8px 0 0",
                            color: COLORS.muted,
                            lineHeight: 1.9,
                            maxWidth: "850px",
                        }}
                    >
                        {subtitle}
                    </p>
                )}
            </div>

            {action}
        </div>
    );
}

export default function TenderDetailsPage() {
    const params = useParams<{ id: string }>();

    const [tender, setTender] = useState<TenderDetails | null>(null);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);
    const [documents, setDocuments] = useState<TenderDocument[]>([]);
    const [documentsCoverageSummary, setDocumentsCoverageSummary] =
        useState<DocumentsCoverageSummary | null>(null);
    const [submissionGate, setSubmissionGate] = useState<SubmissionGate | null>(null);
    const [resourceGate, setResourceGate] = useState<CompanyResourceGate | null>(null);

    type WorkspaceTab = "overview" | "gate" | "documents" | "evidence" | "tasks" | "resources";
    const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

    const [coverageAnalyses, setCoverageAnalyses] = useState<
        Record<number, DocumentCoverageAnalysis>
    >({});

    const [gapTaskResults, setGapTaskResults] = useState<
        Record<number, CreateGapTasksResponse>
    >({});

    const [expandedTextDocuments, setExpandedTextDocuments] = useState<
        Record<number, boolean>
    >({});

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [approvalMessage, setApprovalMessage] = useState("");
    const [approving, setApproving] = useState(false);

    const [documentMessage, setDocumentMessage] = useState("");
    const [extractingDocumentId, setExtractingDocumentId] = useState<number | null>(
        null
    );

    const [coverageMessage, setCoverageMessage] = useState("");
    const [analyzingCoverageDocumentId, setAnalyzingCoverageDocumentId] = useState<
        number | null
    >(null);

    const [gapTaskMessage, setGapTaskMessage] = useState("");
    const [creatingGapTasksDocumentId, setCreatingGapTasksDocumentId] = useState<
        number | null
    >(null);

    const tenderId = params?.id;

    const decisionGate = useMemo(
        () =>
            buildDecisionGate(
                tender,
                analysis,
                documentsCoverageSummary,
                submissionGate,
                resourceGate
            ),
        [tender, analysis, documentsCoverageSummary, submissionGate, resourceGate]
    );

    const decisionInternalReadinessScore =
        submissionGate?.internal_readiness_score ??
        documentsCoverageSummary?.internal_readiness_score ??
        tender?.readiness_score ??
        0;

    const decisionDocumentsCoverageScore =
        submissionGate?.documents_coverage_score ??
        documentsCoverageSummary?.documents_coverage_score ??
        0;

    const resourceReadinessScore = resourceGate?.resource_readiness_score ?? 0;
    const resourceEvidenceCoverageScore = resourceGate?.evidence_coverage_score ?? 0;
    const combinedEvidenceCoverageScore = Math.max(
        decisionDocumentsCoverageScore,
        resourceEvidenceCoverageScore
    );

    const displayCoveredCount =
        submissionGate?.covered_count ??
        documentsCoverageSummary?.covered_count ??
        analysis?.covered_count ??
        0;

    const displayUncoveredCount =
        submissionGate?.uncovered_count ??
        documentsCoverageSummary?.uncovered_count ??
        analysis?.uncovered_count ??
        0;

    const displayDocumentsCount =
        submissionGate?.documents_count ??
        documentsCoverageSummary?.documents_count ??
        documents.length;

    const decisionVisual = getDecisionVisual(decisionGate.tone);

    const loadTenderData = async () => {
        try {
            setLoading(true);
            setError("");

            const baseUrl = getApiBaseUrl();

            if (!tenderId) {
                throw new Error("Missing tender id");
            }

            const requiredFetchJson = async <T,>(url: string): Promise<T> => {
                const response = await fetch(url, { cache: "no-store" });

                if (!response.ok) {
                    throw new Error(`Required request failed: ${url}`);
                }

                return (await response.json()) as T;
            };

            const optionalFetchJson = async <T,>(
                url: string,
                fallback: T
            ): Promise<T> => {
                try {
                    const response = await fetch(url, { cache: "no-store" });

                    if (!response.ok) {
                        console.warn(`Optional request failed: ${url}`);
                        return fallback;
                    }

                    return (await response.json()) as T;
                } catch (error) {
                    console.warn(`Optional request crashed: ${url}`, error);
                    return fallback;
                }
            };

            const tenderData = await requiredFetchJson<TenderDetails>(
                `${baseUrl}/tenders/${tenderId}`
            );

            const [
                requirementsData,
                analysisData,
                suggestedTasksData,
                documentsData,
                documentsCoverageSummaryData,
                submissionGateData,
                resourceGateData,
            ] = await Promise.all([
                optionalFetchJson<Requirement[]>(
                    `${baseUrl}/tenders/${tenderId}/requirements`,
                    []
                ),
                optionalFetchJson<Analysis | null>(
                    `${baseUrl}/tenders/${tenderId}/analysis`,
                    null
                ),
                optionalFetchJson<SuggestedTask[]>(
                    `${baseUrl}/tenders/${tenderId}/suggested-tasks`,
                    []
                ),
                optionalFetchJson<TenderDocument[]>(
                    `${baseUrl}/tenders/${tenderId}/documents`,
                    []
                ),
                optionalFetchJson<DocumentsCoverageSummary | null>(
                    `${baseUrl}/tenders/${tenderId}/documents/coverage-summary`,
                    null
                ),
                optionalFetchJson<SubmissionGate | null>(
                    `${baseUrl}/tenders/${tenderId}/submission-gate`,
                    null
                ),
                optionalFetchJson<CompanyResourceGate | null>(
                    `${baseUrl}/resources/match/tender/${tenderId}`,
                    null
                ),
            ]);

            setTender(tenderData);
            setRequirements(requirementsData);
            setAnalysis(analysisData);
            setSuggestedTasks(suggestedTasksData);
            setDocuments(documentsData);
            setDocumentsCoverageSummary(documentsCoverageSummaryData);
            setSubmissionGate(submissionGateData);
            setResourceGate(resourceGateData);
        } catch (error) {
            console.error(error);
            setError("تعذر تحميل تفاصيل المنافسة من الخادم");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTenderData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenderId]);

    const approveSuggestedTasks = async () => {
        try {
            setApproving(true);
            setApprovalMessage("");

            const baseUrl = getApiBaseUrl();
            const numericTenderId = Number(tenderId);

            const response = await fetch(`${baseUrl}/tenders/approve-suggested-tasks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ tender_id: numericTenderId }),
            });

            if (!response.ok) {
                throw new Error("Failed to approve tasks");
            }

            const data = await response.json();

            setApprovalMessage(
                `تم اعتماد ${data.created_count} مهمة وإضافتها إلى النظام`
            );

            await loadTenderData();
        } catch {
            setApprovalMessage("تعذر اعتماد المهام المقترحة");
        } finally {
            setApproving(false);
        }
    };

    const extractDocument = async (documentId: number) => {
        try {
            setExtractingDocumentId(documentId);
            setDocumentMessage("");

            const baseUrl = getApiBaseUrl();

            const response = await fetch(
                `${baseUrl}/tenders/${tenderId}/documents/${documentId}/extract`,
                {
                    method: "POST",
                }
            );

            if (!response.ok) {
                throw new Error("Failed to extract document text");
            }

            setDocumentMessage("تم تشغيل الوكيل واستخراج النص الفعلي من المستند");

            await loadTenderData();
        } catch {
            setDocumentMessage("تعذر استخراج النص من المستند");
        } finally {
            setExtractingDocumentId(null);
        }
    };

    const analyzeDocumentCoverage = async (documentId: number) => {
        try {
            setAnalyzingCoverageDocumentId(documentId);
            setCoverageMessage("");

            const baseUrl = getApiBaseUrl();

            const response = await fetch(
                `${baseUrl}/tenders/${tenderId}/documents/${documentId}/analyze-coverage`,
                {
                    method: "POST",
                }
            );

            if (!response.ok) {
                throw new Error("Failed to analyze document coverage");
            }

            const data = await response.json();
            const coverageAnalysis: DocumentCoverageAnalysis = data.analysis;

            setCoverageAnalyses((current) => ({
                ...current,
                [documentId]: coverageAnalysis,
            }));

            setCoverageMessage("تم تحليل تغطية المتطلبات بناءً على محتوى المستند");

            await loadTenderData();
        } catch {
            setCoverageMessage("تعذر تحليل تغطية المتطلبات من المستند");
        } finally {
            setAnalyzingCoverageDocumentId(null);
        }
    };

    const createGapTasksFromDocument = async (documentId: number) => {
        try {
            setCreatingGapTasksDocumentId(documentId);
            setGapTaskMessage("");

            const baseUrl = getApiBaseUrl();

            const response = await fetch(
                `${baseUrl}/tenders/${tenderId}/documents/${documentId}/create-gap-tasks`,
                {
                    method: "POST",
                }
            );

            if (!response.ok) {
                throw new Error("Failed to create gap tasks");
            }

            const data: CreateGapTasksResponse = await response.json();

            setGapTaskResults((current) => ({
                ...current,
                [documentId]: data,
            }));

            setGapTaskMessage(
                `تم إنشاء ${data.created_count} مهمة من فجوات المستند، وتم تجاوز ${data.skipped_count} مهمة مكررة`
            );

            await loadTenderData();
        } catch {
            setGapTaskMessage("تعذر إنشاء مهام من فجوات المستند");
        } finally {
            setCreatingGapTasksDocumentId(null);
        }
    };

    const toggleExtractedText = (documentId: number) => {
        setExpandedTextDocuments((current) => ({
            ...current,
            [documentId]: !current[documentId],
        }));
    };

    if (loading) {
        return (
            <main
                dir="rtl"
                style={{
                    minHeight: "65vh",
                    display: "grid",
                    placeItems: "center",
                    color: COLORS.muted,
                }}
            >
                جارٍ تحميل مركز قرار المنافسة...
            </main>
        );
    }

    if (error) {
        return (
            <main dir="rtl">
                <div
                    style={{
                        background: "#fef2f2",
                        color: "#991b1b",
                        padding: "18px",
                        borderRadius: "16px",
                        border: "1px solid #fecaca",
                        fontWeight: 800,
                    }}
                >
                    {error}
                </div>
            </main>
        );
    }

    if (!tender) {
        return <p dir="rtl">المنافسة غير موجودة.</p>;
    }

    return (
        <main dir="rtl" style={{ color: COLORS.navy }}>

            {/* ── Agent Command Center Header ──────────────────────────── */}
            <div
                style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "22px",
                    padding: "20px 24px",
                    marginBottom: "14px",
                    boxShadow: "0 10px 28px rgba(15,23,42,0.045)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "18px",
                    flexWrap: "wrap",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Left green accent stripe */}
                <div
                    style={{
                        position: "absolute",
                        insetInlineEnd: 0,
                        top: 0,
                        bottom: 0,
                        width: "5px",
                        background: "#59BA47",
                        borderRadius: "0 22px 22px 0",
                    }}
                />

                <div style={{ display: "grid", gap: "8px", flex: 1, minWidth: 0 }}>
                    {/* Eyebrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "5px 11px",
                                borderRadius: "999px",
                                background: "rgba(89,186,71,0.10)",
                                color: "#2d7a1e",
                                border: "1px solid rgba(89,186,71,0.28)",
                                fontSize: "11px",
                                fontWeight: 900,
                                letterSpacing: "0.02em",
                            }}
                        >
                            <span
                                style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "999px",
                                    background: "#59BA47",
                                    display: "inline-block",
                                }}
                            />
                            وكيل تحليل المنافسات · نشط
                        </span>

                        <Badge
                            style={{
                                background: translateStatus(tender.status) === "قيد المراجعة" ? "#f8fafc" :
                                    translateStatus(tender.status) === "التجهيز للتقديم" ? "#eff6ff" :
                                        translateStatus(tender.status) === "جاهز للتقديم" ? "#ecfdf5" :
                                            "#fff7ed",
                                color: translateStatus(tender.status) === "قيد المراجعة" ? "#475569" :
                                    translateStatus(tender.status) === "التجهيز للتقديم" ? "#1d4ed8" :
                                        translateStatus(tender.status) === "جاهز للتقديم" ? "#065f46" :
                                            "#9a3412",
                                border: "1px solid #e2e8f0",
                            }}
                        >
                            {translateStatus(tender.status)}
                        </Badge>
                    </div>

                    {/* Title */}
                    <h1
                        style={{
                            margin: 0,
                            fontSize: "26px",
                            lineHeight: 1.35,
                            letterSpacing: "-0.03em",
                            color: "#232122",
                            fontWeight: 900,
                        }}
                    >
                        {tender.title}
                    </h1>

                    {/* Agency + Deadline row */}
                    <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "center" }}>
                        {tender.client && (
                            <span style={{ color: COLORS.muted, fontWeight: 800, fontSize: "14px" }}>
                                الجهة: {tender.client}
                            </span>
                        )}
                        {tender.submission_deadline && (
                            <span style={{ color: COLORS.muted, fontWeight: 800, fontSize: "14px" }}>
                                آخر موعد: {tender.submission_deadline.slice(0, 10)}
                            </span>
                        )}
                        <span style={{ color: COLORS.muted, fontWeight: 800, fontSize: "14px" }}>
                            الجاهزية: <strong style={{ color: decisionInternalReadinessScore >= 80 ? "#059669" : decisionInternalReadinessScore >= 50 ? "#b45309" : "#dc2626" }}>
                                {decisionInternalReadinessScore}%
                            </strong>
                        </span>
                    </div>
                </div>

                <PrimaryButton onClick={loadTenderData} tone="light">
                    تحديث المركز
                </PrimaryButton>
            </div>

            {/* ── Agent Workflow Stepper ───────────────────────────────── */}
            <AgentWorkflowStepper
                documentsCount={displayDocumentsCount}
                requirementsCount={requirements.length}
                resourceGate={resourceGate}
                documentsCoverageSummary={documentsCoverageSummary}
                suggestedTasksCount={suggestedTasks.length}
                submissionGate={submissionGate}
            />

            {/* ── Workspace Tab Navigation ─────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    gap: "4px",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "18px",
                    padding: "6px",
                    marginBottom: "14px",
                    boxShadow: "0 8px 22px rgba(15,23,42,0.035)",
                    overflowX: "auto",
                }}
            >
                {([
                    { id: "overview", label: "نظرة عامة", icon: "◎" },
                    { id: "gate", label: "بوابة التقديم", icon: "⊛" },
                    { id: "documents", label: "المستندات", icon: "◈" },
                    { id: "evidence", label: "مصفوفة الأدلة", icon: "◇" },
                    { id: "tasks", label: "مهام الفجوات", icon: "◉" },
                    { id: "resources", label: "موارد الشركة", icon: "◆" },
                ] as { id: WorkspaceTab; label: string; icon: string }[]).map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "9px 16px",
                                borderRadius: "13px",
                                border: "none",
                                cursor: "pointer",
                                fontWeight: 900,
                                fontSize: "13px",
                                whiteSpace: "nowrap",
                                transition: "background 0.15s, color 0.15s",
                                background: isActive ? "#232122" : "transparent",
                                color: isActive ? "#ffffff" : "#6B7280",
                                boxShadow: isActive
                                    ? "0 4px 14px rgba(35,33,34,0.18)"
                                    : "none",
                            }}
                        >
                            <span style={{ fontSize: "11px", opacity: isActive ? 1 : 0.6 }}>
                                {tab.icon}
                            </span>
                            {tab.label}
                            {tab.id === "gate" && submissionGate && (
                                <span
                                    style={{
                                        width: "7px",
                                        height: "7px",
                                        borderRadius: "999px",
                                        background: submissionGate.can_submit ? "#59BA47" : "#ef4444",
                                        display: "inline-block",
                                        marginRight: "2px",
                                    }}
                                />
                            )}
                            {tab.id === "tasks" && suggestedTasks.length > 0 && (
                                <span
                                    style={{
                                        background: isActive ? "rgba(255,255,255,0.22)" : "#F4F6F6",
                                        color: isActive ? "white" : "#6B7280",
                                        borderRadius: "999px",
                                        padding: "1px 7px",
                                        fontSize: "11px",
                                        fontWeight: 900,
                                        minWidth: "20px",
                                        textAlign: "center",
                                    }}
                                >
                                    {suggestedTasks.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Agent Decision Section (always visible) ──────────────── */}
            <SectionCard
                style={{
                    background: decisionVisual.gradient,
                    color: "white",
                    border: "none",
                    overflow: "hidden",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        insetInlineStart: "-90px",
                        insetBlockStart: "-90px",
                        width: "230px",
                        height: "230px",
                        background: "rgba(255,255,255,0.12)",
                        borderRadius: "999px",
                    }}
                />

                {/* Subtle dot-grid texture */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0.06,
                        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "22px 22px",
                        pointerEvents: "none",
                    }}
                />

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1.25fr 0.75fr",
                        gap: "22px",
                        position: "relative",
                    }}
                >
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                            <Badge
                                style={{
                                    background: "rgba(255,255,255,0.16)",
                                    color: "white",
                                    border: "1px solid rgba(255,255,255,0.24)",
                                }}
                            >
                                مركز قرار المنافسة
                            </Badge>
                            <Badge
                                style={{
                                    background: "rgba(255,255,255,0.12)",
                                    color: "rgba(255,255,255,0.85)",
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    fontSize: "11px",
                                }}
                            >
                                {decisionVisual.label}
                            </Badge>
                        </div>

                        <h2
                            style={{
                                margin: "16px 0 8px",
                                fontSize: "38px",
                                lineHeight: 1.25,
                                letterSpacing: "-0.04em",
                            }}
                        >
                            {decisionGate.decision}
                        </h2>

                        <p
                            style={{
                                margin: 0,
                                color: "rgba(255,255,255,0.88)",
                                lineHeight: 1.9,
                                fontSize: "15px",
                                maxWidth: "900px",
                            }}
                        >
                            {decisionGate.mainReason}
                        </p>

                        <div
                            style={{
                                marginTop: "18px",
                                background: "rgba(255,255,255,0.14)",
                                border: "1px solid rgba(255,255,255,0.22)",
                                borderRadius: "16px",
                                padding: "15px",
                            }}
                        >
                            <p
                                style={{
                                    margin: "0 0 6px",
                                    color: "rgba(255,255,255,0.72)",
                                    fontWeight: 800,
                                    fontSize: "13px",
                                }}
                            >
                                الإجراء التالي المقترح
                            </p>
                            <p style={{ margin: 0, lineHeight: 1.9, fontWeight: 800 }}>
                                {decisionGate.nextAction}
                            </p>
                        </div>

                        {/* Quick stats row */}
                        <div
                            style={{
                                marginTop: "14px",
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >
                            <MiniStatPill label="متطلبات مغطاة" value={String(displayCoveredCount)} />
                            <MiniStatPill label="فجوات مكتشفة" value={String(displayUncoveredCount)} />
                            <MiniStatPill label="مستندات" value={String(displayDocumentsCount)} />
                        </div>
                    </div>

                    <div
                        style={{
                            background: "rgba(255,255,255,0.14)",
                            border: "1px solid rgba(255,255,255,0.22)",
                            borderRadius: "20px",
                            padding: "18px",
                            backdropFilter: "blur(10px)",
                        }}
                    >
                        <div style={{ marginBottom: "16px" }}>
                            <p
                                style={{
                                    margin: "0 0 8px",
                                    color: "rgba(255,255,255,0.72)",
                                    fontWeight: 800,
                                    fontSize: "13px",
                                }}
                            >
                                ثقة الوكيل في القرار
                            </p>
                            <h3 style={{ margin: 0, fontSize: "28px" }}>
                                {decisionGate.confidence}
                            </h3>
                        </div>

                        <div style={{ display: "grid", gap: "14px" }}>
                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        marginBottom: "8px",
                                        fontWeight: 900,
                                    }}
                                >
                                    <span>الجاهزية الداخلية</span>
                                    <span>
                                        {decisionInternalReadinessScore}%
                                    </span>
                                </div>
                                <ProgressBar
                                    value={decisionInternalReadinessScore}
                                    color="#ffffff"
                                />
                            </div>

                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        marginBottom: "8px",
                                        fontWeight: 900,
                                    }}
                                >
                                    <span>تغطية الأدلة الشاملة</span>
                                    <span>
                                        {combinedEvidenceCoverageScore}%
                                    </span>
                                </div>
                                <ProgressBar
                                    value={combinedEvidenceCoverageScore}
                                    color="#fde68a"
                                />
                            </div>

                            {resourceGate && (
                                <div>
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            marginBottom: "8px",
                                            fontWeight: 900,
                                        }}
                                    >
                                        <span>مطابقة موارد الشركة</span>
                                        <span>{resourceReadinessScore}%</span>
                                    </div>
                                    <ProgressBar
                                        value={resourceReadinessScore}
                                        color="rgba(255,255,255,0.55)"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* ══ TAB: بوابة التقديم ══════════════════════════════════ */}
            {activeTab === "gate" && submissionGate && (
                <SectionCard
                    style={{
                        border: submissionGate.can_submit
                            ? "1px solid #a7f3d0"
                            : "1px solid #fecaca",
                        background: submissionGate.can_submit
                            ? "linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%)"
                            : "linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)",
                    }}
                >
                    <SectionHeader
                        title="بوابة التقديم"
                        subtitle="بوابة تشغيلية تمنع اعتماد التقديم إذا كانت الجاهزية لا تملك أدلة كافية أو توجد مهام حرجة مفتوحة."
                        action={
                            <Badge
                                style={
                                    submissionGate.can_submit
                                        ? getCoverageBadgeStyle("مغطى")
                                        : getCoverageBadgeStyle("غير مغطى")
                                }
                            >
                                {submissionGate.can_submit ? "مسموح بالتقديم" : "التقديم محجوب"}
                            </Badge>
                        }
                    />

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1.2fr",
                            gap: "16px",
                            alignItems: "stretch",
                            marginBottom: "16px",
                        }}
                    >
                        <div
                            style={{
                                background: submissionGate.can_submit ? "#ecfdf5" : "#fef2f2",
                                border: submissionGate.can_submit
                                    ? "1px solid #a7f3d0"
                                    : "1px solid #fecaca",
                                borderRadius: "18px",
                                padding: "18px",
                            }}
                        >
                            <p
                                style={{
                                    margin: "0 0 8px",
                                    color: submissionGate.can_submit ? "#065f46" : "#991b1b",
                                    fontWeight: 900,
                                }}
                            >
                                قرار بوابة التقديم
                            </p>
                            <h2
                                style={{
                                    margin: "0 0 10px",
                                    fontSize: "28px",
                                    lineHeight: 1.35,
                                    color: submissionGate.can_submit ? "#064e3b" : "#7f1d1d",
                                }}
                            >
                                {submissionGate.decision}
                            </h2>
                            <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.9 }}>
                                <strong>الحالة:</strong> {translateGateStatus(submissionGate.gate_status)}
                            </p>
                            <p style={{ margin: "8px 0 0", color: COLORS.muted, lineHeight: 1.9 }}>
                                <strong>الإجراء التالي:</strong> {submissionGate.next_action}
                            </p>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                gap: "10px",
                            }}
                        >
                            <KpiCard
                                label="الجاهزية الداخلية"
                                value={`${submissionGate.internal_readiness_score}%`}
                                helper="جاهزية الفريق داخليًا"
                                accent={COLORS.blue}
                            />
                            <KpiCard
                                label="تغطية الأدلة"
                                value={`${submissionGate.documents_coverage_score}%`}
                                helper="مطلوب 90% فأعلى"
                                accent={COLORS.purple}
                            />
                            <KpiCard
                                label="المهام المفتوحة"
                                value={submissionGate.open_tasks_count}
                                helper="يجب إغلاق الحرجة"
                                accent={COLORS.orange}
                            />
                            <KpiCard
                                label="حواجز حرجة"
                                value={submissionGate.critical_blockers_count}
                                helper="تمنع التقديم"
                                accent={COLORS.red}
                            />
                            {resourceGate && (
                                <KpiCard
                                    label="مطابقة الموارد"
                                    value={`${resourceReadinessScore}%`}
                                    helper="قوة ربط الموارد بالمتطلبات"
                                    accent={COLORS.teal}
                                />
                            )}
                            {resourceGate && (
                                <KpiCard
                                    label="أدلة الموارد"
                                    value={`${resourceEvidenceCoverageScore}%`}
                                    helper="موارد عليها مستندات داعمة"
                                    accent={COLORS.green}
                                />
                            )}
                        </div>
                    </div>

                    {resourceGate && (
                        <div
                            style={{
                                background: "#ecfeff",
                                border: "1px solid #99f6e4",
                                borderRadius: "18px",
                                padding: "16px",
                                marginBottom: "16px",
                            }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.2fr 1fr",
                                    gap: "14px",
                                    alignItems: "stretch",
                                }}
                            >
                                <div>
                                    <h3 style={{ margin: "0 0 8px", color: "#134e4a" }}>
                                        طبقة موارد الشركة داخل بوابة التقديم
                                    </h3>
                                    <p style={{ margin: 0, color: "#0f766e", lineHeight: 1.9, fontWeight: 800 }}>
                                        {resourceGate.agent_decision}
                                    </p>
                                    <p style={{ margin: "8px 0 0", color: COLORS.muted, lineHeight: 1.9 }}>
                                        {resourceGate.recommended_next_action}
                                    </p>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: "10px",
                                    }}
                                >
                                    <KpiCard
                                        label="متطلبات مدعومة بدليل"
                                        value={`${resourceGate.requirements_with_usable_evidence}/${resourceGate.requirements_count}`}
                                        helper="من قاعدة موارد الشركة"
                                        accent={COLORS.blue}
                                    />
                                    <KpiCard
                                        label="موارد فحصها الوكيل"
                                        value={resourceGate.resources_checked}
                                        helper="داخل ذاكرة الشركة"
                                        accent={COLORS.purple}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                            gap: "14px",
                            marginBottom: "16px",
                        }}
                    >
                        <div
                            style={{
                                background: "white",
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: "18px",
                                padding: "16px",
                            }}
                        >
                            <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>
                                فحوصات الاعتماد
                            </h3>
                            <div style={{ display: "grid", gap: "9px" }}>
                                {[
                                    ...normalizeSubmissionGateChecks(submissionGate.failed_checks),
                                    ...normalizeSubmissionGateChecks(submissionGate.passed_checks),
                                ].map((check) => (
                                    <div
                                        key={check.key}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: "10px",
                                            background: check.passed ? "#f0fdf4" : "#fff7ed",
                                            border: check.passed
                                                ? "1px solid #bbf7d0"
                                                : "1px solid #fed7aa",
                                            borderRadius: "12px",
                                            padding: "10px",
                                        }}
                                    >
                                        <span style={{ color: COLORS.navy, fontWeight: 800 }}>
                                            {check.label}
                                        </span>
                                        <Badge
                                            style={
                                                check.passed
                                                    ? getCoverageBadgeStyle("مغطى")
                                                    : getCoverageBadgeStyle("غير مغطى")
                                            }
                                        >
                                            {check.passed ? "ناجح" : "فشل"}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            style={{
                                background: "white",
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: "18px",
                                padding: "16px",
                            }}
                        >
                            <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>
                                أسباب الحجب
                            </h3>
                            {submissionGate.blocking_reasons.length === 0 ? (
                                <p style={{ margin: 0, color: COLORS.muted }}>
                                    لا توجد أسباب حجب حاليًا.
                                </p>
                            ) : (
                                <div style={{ display: "grid", gap: "9px" }}>
                                    {submissionGate.blocking_reasons.map((reason, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                background: "#fef2f2",
                                                border: "1px solid #fecaca",
                                                borderRadius: "12px",
                                                padding: "10px",
                                                color: "#7f1d1d",
                                                lineHeight: 1.8,
                                                fontWeight: 800,
                                            }}
                                        >
                                            {reason}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        style={{
                            background: "#f8fafc",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: "18px",
                            padding: "16px",
                            marginBottom: "16px",
                        }}
                    >
                        <h3 style={{ margin: "0 0 12px", fontSize: "17px" }}>
                            الإجراءات المطلوبة قبل السماح بالتقديم
                        </h3>
                        {submissionGate.required_actions.length === 0 ? (
                            <p style={{ margin: 0, color: COLORS.muted }}>
                                لا توجد إجراءات مطلوبة حاليًا.
                            </p>
                        ) : (
                            <div style={{ display: "grid", gap: "10px" }}>
                                {submissionGate.required_actions.map((action, index) => (
                                    <div
                                        key={`${action.title}-${index}`}
                                        style={{
                                            background: "white",
                                            border: `1px solid ${COLORS.softBorder}`,
                                            borderRadius: "14px",
                                            padding: "13px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: "12px",
                                                flexWrap: "wrap",
                                                marginBottom: "8px",
                                            }}
                                        >
                                            <strong style={{ lineHeight: 1.7 }}>{action.title}</strong>
                                            <Badge style={getPriorityStyle(action.priority)}>
                                                {action.priority}
                                            </Badge>
                                        </div>
                                        <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.9 }}>
                                            {action.description}
                                        </p>
                                        <p
                                            style={{
                                                margin: "8px 0 0",
                                                color: COLORS.lightMuted,
                                                fontSize: "12px",
                                            }}
                                        >
                                            المالك: {action.owner}
                                            {action.requirement_id ? ` · المتطلب: ${action.requirement_id}` : ""}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {submissionGate.critical_blockers.length > 0 && (
                        <div
                            style={{
                                background: "white",
                                border: "1px solid #fecaca",
                                borderRadius: "18px",
                                padding: "16px",
                            }}
                        >
                            <h3 style={{ margin: "0 0 12px", color: "#7f1d1d" }}>
                                المتطلبات الحرجة التي تمنع التقديم
                            </h3>
                            <div style={{ display: "grid", gap: "10px" }}>
                                {submissionGate.critical_blockers.map((blocker) => (
                                    <div
                                        key={blocker.requirement_id}
                                        style={{
                                            background: "#fff7ed",
                                            border: "1px solid #fed7aa",
                                            borderRadius: "14px",
                                            padding: "13px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: "10px",
                                                flexWrap: "wrap",
                                                marginBottom: "8px",
                                            }}
                                        >
                                            <strong>{blocker.requirement_title}</strong>
                                            <Badge style={getPriorityStyle(blocker.priority)}>
                                                {blocker.priority}
                                            </Badge>
                                        </div>
                                        <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.9 }}>
                                            {blocker.reason}
                                        </p>
                                        <p style={{ margin: "8px 0 0", color: "#7c2d12", lineHeight: 1.9 }}>
                                            <strong>المطلوب:</strong> {blocker.required_action}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* ══ TAB: موارد الشركة ══════════════════════════════════════ */}
            {activeTab === "resources" && <CompanyResourceIntelligence />}

            {/* ══ TAB: نظرة عامة ═══════════════════════════════════════ */}
            {activeTab === "overview" && <section
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "14px",
                    marginBottom: "22px",
                }}
            >
                <KpiCard
                    label="الجاهزية الداخلية"
                    value={`${decisionInternalReadinessScore}%`}
                    helper="حالة المتطلبات داخل النظام"
                    accent={COLORS.blue}
                />
                <KpiCard
                    label="تغطية الأدلة الشاملة"
                    value={`${combinedEvidenceCoverageScore}%`}
                    helper="مستندات المنافسة + أدلة الموارد"
                    accent={COLORS.purple}
                />
                <KpiCard
                    label="متطلبات مثبتة"
                    value={displayCoveredCount}
                    helper="مدعومة بأدلة كافية"
                    accent={COLORS.green}
                />
                <KpiCard
                    label="فجوات أدلة"
                    value={displayUncoveredCount}
                    helper="تحتاج معالجة قبل التقديم"
                    accent={COLORS.red}
                />
                <KpiCard
                    label="مستندات مرفوعة"
                    value={displayDocumentsCount}
                    helper="ضمن مساحة المنافسة"
                    accent={COLORS.orange}
                />
            </section>}

            {activeTab === "overview" && <SectionCard>
                <SectionHeader title="معلومات المنافسة" subtitle="البيانات الأساسية التي يبني عليها الوكيل قرار الدخول." />

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                    }}
                >
                    {[
                        ["الجهة", tender.client],
                        ["الحالة", translateStatus(tender.status)],
                        ["آخر موعد للتقديم", tender.submission_deadline],
                        ["الوصف", tender.description],
                    ].map(([label, value]) => (
                        <div
                            key={label}
                            style={{
                                background: "#f8fafc",
                                border: `1px solid ${COLORS.softBorder}`,
                                borderRadius: "16px",
                                padding: "14px",
                            }}
                        >
                            <p
                                style={{
                                    margin: "0 0 8px",
                                    color: COLORS.lightMuted,
                                    fontSize: "12px",
                                    fontWeight: 800,
                                }}
                            >
                                {label}
                            </p>
                            <strong style={{ lineHeight: 1.8 }}>{value}</strong>
                        </div>
                    ))}
                </div>
            </SectionCard>}

            {/* ══ TAB: نظرة عامة — internal readiness (shown below docs matrix) ══ */}
            {/* ══ TAB: مصفوفة الأدلة ════════════════════════════════════ */}
            {activeTab === "evidence" && (
                <div style={{ display: "grid", gap: "16px" }}>
                    {documentsCoverageSummary ? (
                        (() => {
                            const evidenceItems = documentsCoverageSummary.requirements_document_coverage || [];

                            const confidenceToScore = (confidence: string) => {
                                const value = String(confidence || "").trim().toLowerCase();

                                if (
                                    value.includes("مرتفعة") ||
                                    value.includes("عالية") ||
                                    value.includes("high")
                                ) {
                                    return 90;
                                }

                                if (value.includes("متوسطة") || value.includes("medium")) {
                                    return 65;
                                }

                                if (value.includes("منخفضة") || value.includes("low")) {
                                    return 35;
                                }

                                return 0;
                            };

                            const averageConfidence = evidenceItems.length
                                ? Math.round(
                                    evidenceItems.reduce(
                                        (total, item) => total + confidenceToScore(item.confidence),
                                        0
                                    ) / evidenceItems.length
                                )
                                : 0;

                            const getStatusTone = (status: string) => {
                                const normalized = String(status || "").trim();

                                if (normalized === "مغطى") {
                                    return {
                                        label: "مغطى",
                                        accent: COLORS.green,
                                        softBackground: "#ecfdf5",
                                        border: "#a7f3d0",
                                        text: "#065f46",
                                        action: "لا يوجد إجراء عاجل. الدليل الحالي قابل للاستخدام ضمن ملف التقديم.",
                                    };
                                }

                                if (normalized === "مغطى جزئيًا" || normalized === "مغطى جزئياً") {
                                    return {
                                        label: "مغطى جزئيًا",
                                        accent: COLORS.amber,
                                        softBackground: "#fffbeb",
                                        border: "#fde68a",
                                        text: "#92400e",
                                        action: "استكمال الدليل الداعم أو رفع مستند أكثر تحديدًا قبل اعتماد التقديم.",
                                    };
                                }

                                return {
                                    label: normalized || "غير مغطى",
                                    accent: COLORS.red,
                                    softBackground: "#fef2f2",
                                    border: "#fecaca",
                                    text: "#991b1b",
                                    action: "رفع دليل مباشر يثبت المتطلب أو إنشاء مهمة فجوة لمعالجته.",
                                };
                            };

                            const getConfidenceTone = (confidence: string): CSSProperties => {
                                const score = confidenceToScore(confidence);

                                if (score >= 80) {
                                    return {
                                        background: "#ecfdf5",
                                        color: "#065f46",
                                        border: "1px solid #a7f3d0",
                                    };
                                }

                                if (score >= 50) {
                                    return {
                                        background: "#fffbeb",
                                        color: "#92400e",
                                        border: "1px solid #fde68a",
                                    };
                                }

                                return {
                                    background: "#fef2f2",
                                    color: "#991b1b",
                                    border: "1px solid #fecaca",
                                };
                            };

                            return (
                                <>
                                    <SectionCard
                                        style={{
                                            border: "1px solid #DFE7E4",
                                            background: "linear-gradient(135deg, #ffffff 0%, #F4F6F6 100%)",
                                        }}
                                    >
                                        <SectionHeader
                                            title="مصفوفة تتبع الأدلة"
                                            subtitle="ربط كل متطلب بالمستند الداعم وسبب حكم الوكيل ونقاط الفجوة، بحيث يمكن تتبع قرار التقديم من المتطلب إلى الدليل إلى الإجراء التالي."
                                            action={
                                                <Badge
                                                    style={{
                                                        background: "rgba(89,186,71,0.10)",
                                                        color: "#2d7a1e",
                                                        border: "1px solid rgba(89,186,71,0.30)",
                                                    }}
                                                >
                                                    Evidence Traceability
                                                </Badge>
                                            }
                                        />

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                                                gap: "12px",
                                                marginBottom: "18px",
                                            }}
                                        >
                                            <KpiCard
                                                label="إجمالي المتطلبات"
                                                value={documentsCoverageSummary.total_requirements}
                                                helper="كل المتطلبات المرتبطة بالمنافسة"
                                                accent={COLORS.navy}
                                            />
                                            <KpiCard
                                                label="متطلبات مغطاة"
                                                value={documentsCoverageSummary.covered_count}
                                                helper="مدعومة بدليل مقبول"
                                                accent={COLORS.green}
                                            />
                                            <KpiCard
                                                label="مغطاة جزئيًا"
                                                value={documentsCoverageSummary.partial_count}
                                                helper="تحتاج تدعيم قبل القرار"
                                                accent={COLORS.amber}
                                            />
                                            <KpiCard
                                                label="غير مغطاة"
                                                value={documentsCoverageSummary.uncovered_count}
                                                helper="تمثل فجوات يجب إغلاقها"
                                                accent={COLORS.red}
                                            />
                                            <KpiCard
                                                label="متوسط ثقة الوكيل"
                                                value={`${averageConfidence}%`}
                                                helper="تقدير مبني على ثقة كل متطلب"
                                                accent={COLORS.purple}
                                            />
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                                gap: "14px",
                                                marginBottom: "18px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    background: "#ffffff",
                                                    border: "1px solid #dbeafe",
                                                    borderRadius: "18px",
                                                    padding: "16px",
                                                    boxShadow: "0 10px 24px rgba(15,23,42,0.035)",
                                                }}
                                            >
                                                <p
                                                    style={{
                                                        margin: "0 0 8px",
                                                        color: COLORS.blue,
                                                        fontSize: "12px",
                                                        fontWeight: 900,
                                                    }}
                                                >
                                                    تفسير الوكيل
                                                </p>
                                                <p
                                                    style={{
                                                        margin: 0,
                                                        color: COLORS.navy,
                                                        lineHeight: 1.9,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {documentsCoverageSummary.decision_note ||
                                                        "لم يتم تسجيل تفسير تفصيلي من الوكيل حتى الآن."}
                                                </p>
                                            </div>

                                            <div
                                                style={{
                                                    background: "#fff7ed",
                                                    border: "1px solid #fed7aa",
                                                    borderRadius: "18px",
                                                    padding: "16px",
                                                    boxShadow: "0 10px 24px rgba(15,23,42,0.035)",
                                                }}
                                            >
                                                <p
                                                    style={{
                                                        margin: "0 0 8px",
                                                        color: "#9a3412",
                                                        fontSize: "12px",
                                                        fontWeight: 900,
                                                    }}
                                                >
                                                    توصية الوكيل
                                                </p>
                                                <p
                                                    style={{
                                                        margin: 0,
                                                        color: "#7c2d12",
                                                        lineHeight: 1.9,
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    {documentsCoverageSummary.recommendation ||
                                                        "يوصى باستكمال الأدلة الناقصة ثم إعادة تشغيل تحليل التغطية."}
                                                </p>
                                            </div>
                                        </div>

                                        {evidenceItems.length === 0 ? (
                                            <div
                                                style={{
                                                    background: "#f8fafc",
                                                    border: "1px dashed #cbd5e1",
                                                    borderRadius: "18px",
                                                    padding: "22px",
                                                    textAlign: "center",
                                                    color: COLORS.muted,
                                                    fontWeight: 800,
                                                    lineHeight: 1.9,
                                                }}
                                            >
                                                لا توجد عناصر تغطية أدلة حتى الآن. شغّل تحليل التغطية من تبويب المستندات.
                                            </div>
                                        ) : (
                                            <div
                                                style={{
                                                    background: "#ffffff",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: "18px",
                                                    overflowX: "auto",
                                                    overflowY: "hidden",
                                                }}
                                            >
                                                <div style={{ minWidth: "1120px" }}>
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1.25fr 0.9fr 0.9fr 1.15fr 0.9fr",
                                                            gap: 0,
                                                            background: "#232122",
                                                            color: "white",
                                                            fontSize: "12px",
                                                            fontWeight: 900,
                                                            position: "sticky",
                                                            top: 0,
                                                            zIndex: 1,
                                                        }}
                                                    >
                                                        {[
                                                            "المتطلب",
                                                            "حالة التغطية",
                                                            "أفضل دليل",
                                                            "سبب حكم الوكيل",
                                                            "الإجراء التالي",
                                                        ].map((header) => (
                                                            <div
                                                                key={header}
                                                                style={{
                                                                    padding: "12px",
                                                                    borderInlineStart: "1px solid rgba(255,255,255,0.10)",
                                                                }}
                                                            >
                                                                {header}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div style={{ display: "grid" }}>
                                                        {evidenceItems.map((item, index) => {
                                                            const statusTone = getStatusTone(item.best_document_coverage_status);
                                                            const matchedKeywords = Array.isArray(item.matched_keywords)
                                                                ? item.matched_keywords
                                                                : [];
                                                            const evidenceName =
                                                                item.best_evidence_document?.document_name ||
                                                                "لا يوجد مستند داعم محدد";

                                                            return (
                                                                <div
                                                                    key={item.requirement_id}
                                                                    style={{
                                                                        display: "grid",
                                                                        gridTemplateColumns: "1.25fr 0.9fr 0.9fr 1.15fr 0.9fr",
                                                                        gap: 0,
                                                                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                                                                        borderTop: index === 0 ? "none" : "1px solid #e5e7eb",
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            padding: "14px",
                                                                            borderInlineEnd: `5px solid ${statusTone.accent}`,
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                display: "flex",
                                                                                gap: "8px",
                                                                                flexWrap: "wrap",
                                                                                marginBottom: "8px",
                                                                            }}
                                                                        >
                                                                            <Badge style={getPriorityStyle(item.priority)}>
                                                                                أولوية: {item.priority || "غير محددة"}
                                                                            </Badge>
                                                                            <Badge
                                                                                style={{
                                                                                    background: "#f8fafc",
                                                                                    color: "#475569",
                                                                                    border: "1px solid #cbd5e1",
                                                                                }}
                                                                            >
                                                                                متطلب {item.requirement_id}
                                                                            </Badge>
                                                                        </div>

                                                                        <h3
                                                                            style={{
                                                                                margin: 0,
                                                                                color: COLORS.navy,
                                                                                fontSize: "15px",
                                                                                lineHeight: 1.8,
                                                                            }}
                                                                        >
                                                                            {item.requirement_title || "متطلب غير مسمى"}
                                                                        </h3>

                                                                        <p
                                                                            style={{
                                                                                margin: "8px 0 0",
                                                                                color: COLORS.muted,
                                                                                fontSize: "12px",
                                                                                lineHeight: 1.7,
                                                                            }}
                                                                        >
                                                                            {item.category || "تصنيف غير محدد"} · حالة المتطلب داخليًا:{" "}
                                                                            <strong style={{ color: COLORS.navy }}>
                                                                                {item.current_system_status || "غير محددة"}
                                                                            </strong>
                                                                        </p>
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding: "14px",
                                                                            borderInlineStart: "1px solid #eef2f7",
                                                                        }}
                                                                    >
                                                                        <Badge
                                                                            style={{
                                                                                background: statusTone.softBackground,
                                                                                color: statusTone.text,
                                                                                border: `1px solid ${statusTone.border}`,
                                                                            }}
                                                                        >
                                                                            {statusTone.label}
                                                                        </Badge>

                                                                        <div style={{ marginTop: "12px" }}>
                                                                            <p
                                                                                style={{
                                                                                    margin: "0 0 6px",
                                                                                    color: COLORS.lightMuted,
                                                                                    fontSize: "12px",
                                                                                    fontWeight: 800,
                                                                                }}
                                                                            >
                                                                                ثقة الوكيل
                                                                            </p>
                                                                            <Badge style={getConfidenceTone(item.confidence)}>
                                                                                {item.confidence || "غير محددة"}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding: "14px",
                                                                            borderInlineStart: "1px solid #eef2f7",
                                                                        }}
                                                                    >
                                                                        <p
                                                                            style={{
                                                                                margin: "0 0 8px",
                                                                                color: COLORS.lightMuted,
                                                                                fontSize: "12px",
                                                                                fontWeight: 800,
                                                                            }}
                                                                        >
                                                                            المستند الداعم
                                                                        </p>
                                                                        <strong
                                                                            style={{
                                                                                display: "block",
                                                                                color: item.best_evidence_document
                                                                                    ? COLORS.navy
                                                                                    : COLORS.lightMuted,
                                                                                lineHeight: 1.7,
                                                                                fontSize: "13px",
                                                                                wordBreak: "break-word",
                                                                            }}
                                                                        >
                                                                            {evidenceName}
                                                                        </strong>

                                                                        {item.best_evidence_document && (
                                                                            <p
                                                                                style={{
                                                                                    margin: "8px 0 0",
                                                                                    color: COLORS.lightMuted,
                                                                                    fontSize: "11px",
                                                                                }}
                                                                            >
                                                                                رقم المستند: {item.best_evidence_document.document_id}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding: "14px",
                                                                            borderInlineStart: "1px solid #eef2f7",
                                                                        }}
                                                                    >
                                                                        <p
                                                                            style={{
                                                                                margin: 0,
                                                                                color: COLORS.muted,
                                                                                lineHeight: 1.9,
                                                                                fontSize: "13px",
                                                                            }}
                                                                        >
                                                                            {item.reason || "لم يسجل الوكيل سببًا تفصيليًا لهذا الحكم."}
                                                                        </p>

                                                                        <div
                                                                            style={{
                                                                                display: "flex",
                                                                                gap: "6px",
                                                                                flexWrap: "wrap",
                                                                                marginTop: "10px",
                                                                            }}
                                                                        >
                                                                            {matchedKeywords.length > 0 ? (
                                                                                matchedKeywords.slice(0, 6).map((keyword) => (
                                                                                    <span
                                                                                        key={`${item.requirement_id}-${keyword}`}
                                                                                        style={{
                                                                                            display: "inline-flex",
                                                                                            padding: "5px 8px",
                                                                                            borderRadius: "999px",
                                                                                            background: "#F4F6F6",
                                                                                            color: "#475569",
                                                                                            border: "1px solid #DFE7E4",
                                                                                            fontSize: "11px",
                                                                                            fontWeight: 800,
                                                                                        }}
                                                                                    >
                                                                                        {keyword}
                                                                                    </span>
                                                                                ))
                                                                            ) : (
                                                                                <span
                                                                                    style={{
                                                                                        color: COLORS.lightMuted,
                                                                                        fontSize: "12px",
                                                                                        fontWeight: 800,
                                                                                    }}
                                                                                >
                                                                                    لا توجد كلمات مطابقة كافية
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div
                                                                        style={{
                                                                            padding: "14px",
                                                                            borderInlineStart: "1px solid #eef2f7",
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                background: statusTone.softBackground,
                                                                                color: statusTone.text,
                                                                                border: `1px solid ${statusTone.border}`,
                                                                                borderRadius: "14px",
                                                                                padding: "12px",
                                                                                lineHeight: 1.8,
                                                                                fontSize: "13px",
                                                                                fontWeight: 800,
                                                                            }}
                                                                        >
                                                                            {statusTone.action}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </SectionCard>

                                    <SectionCard>
                                        <SectionHeader
                                            title="سجل المتطلبات المختصر"
                                            subtitle="عرض سريع للمتطلبات الأساسية وحالتها الداخلية للمراجعة التشغيلية."
                                            action={
                                                <Badge
                                                    style={{
                                                        background: "#F4F6F6",
                                                        color: "#232122",
                                                        border: "1px solid #DFE7E4",
                                                    }}
                                                >
                                                    {requirements.length} متطلبات
                                                </Badge>
                                            }
                                        />

                                        {requirements.length === 0 ? (
                                            <div
                                                style={{
                                                    background: "#f8fafc",
                                                    border: "1px dashed #cbd5e1",
                                                    borderRadius: "16px",
                                                    padding: "18px",
                                                    color: COLORS.muted,
                                                    fontWeight: 800,
                                                    textAlign: "center",
                                                }}
                                            >
                                                لا توجد متطلبات مسجلة حتى الآن.
                                            </div>
                                        ) : (
                                            <div style={{ display: "grid", gap: "9px" }}>
                                                {requirements.map((requirement) => {
                                                    const coverageItem = evidenceItems.find(
                                                        (item) => item.requirement_id === requirement.id
                                                    );
                                                    const statusTone = getStatusTone(
                                                        coverageItem?.best_document_coverage_status || requirement.status
                                                    );

                                                    return (
                                                        <div
                                                            key={requirement.id}
                                                            style={{
                                                                display: "grid",
                                                                gridTemplateColumns: "minmax(240px, 1fr) auto auto",
                                                                gap: "12px",
                                                                alignItems: "center",
                                                                background: "#f8fafc",
                                                                border: "1px solid #e5e7eb",
                                                                borderRadius: "16px",
                                                                padding: "12px 14px",
                                                            }}
                                                        >
                                                            <div>
                                                                <strong
                                                                    style={{
                                                                        color: COLORS.navy,
                                                                        lineHeight: 1.8,
                                                                    }}
                                                                >
                                                                    {requirement.title}
                                                                </strong>
                                                                <p
                                                                    style={{
                                                                        margin: "4px 0 0",
                                                                        color: COLORS.lightMuted,
                                                                        fontSize: "12px",
                                                                    }}
                                                                >
                                                                    {requirement.category} · متطلب رقم {requirement.id}
                                                                </p>
                                                            </div>

                                                            <Badge style={getPriorityStyle(requirement.priority)}>
                                                                {requirement.priority}
                                                            </Badge>

                                                            <Badge
                                                                style={{
                                                                    background: statusTone.softBackground,
                                                                    color: statusTone.text,
                                                                    border: `1px solid ${statusTone.border}`,
                                                                }}
                                                            >
                                                                {statusTone.label}
                                                            </Badge>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </SectionCard>
                                </>
                            );
                        })()
                    ) : (
                        <SectionCard>
                            <SectionHeader
                                title="مصفوفة تتبع الأدلة"
                                subtitle="لم يتم تشغيل تحليل تغطية الأدلة بعد. ارفع مستندات المنافسة وشغّل استخراج النص ثم تحليل التغطية."
                                action={
                                    <Badge
                                        style={{
                                            background: "#fff7ed",
                                            color: "#9a3412",
                                            border: "1px solid #fed7aa",
                                        }}
                                    >
                                        بانتظار التحليل
                                    </Badge>
                                }
                            />

                            <div
                                style={{
                                    background: "#f8fafc",
                                    border: "1px dashed #cbd5e1",
                                    borderRadius: "18px",
                                    padding: "22px",
                                    textAlign: "center",
                                    color: COLORS.muted,
                                    fontWeight: 800,
                                    lineHeight: 1.9,
                                    marginBottom: "16px",
                                }}
                            >
                                لا توجد مصفوفة أدلة حتى الآن. انتقل إلى تبويب المستندات، ثم شغّل:
                                <br />
                                استخراج النص ← تحليل التغطية ← إنشاء مهام الفجوات.
                            </div>

                            <SectionHeader
                                title="المتطلبات المسجلة"
                                subtitle="هذه القائمة تظهر المتطلبات الموجودة حتى قبل تشغيل تحليل الأدلة."
                                action={
                                    <Badge
                                        style={{
                                            background: "#F4F6F6",
                                            color: "#232122",
                                            border: "1px solid #DFE7E4",
                                        }}
                                    >
                                        {requirements.length} متطلبات
                                    </Badge>
                                }
                            />

                            {requirements.length === 0 ? (
                                <div
                                    style={{
                                        background: "#ffffff",
                                        border: "1px dashed #cbd5e1",
                                        borderRadius: "16px",
                                        padding: "18px",
                                        color: COLORS.muted,
                                        fontWeight: 800,
                                        textAlign: "center",
                                    }}
                                >
                                    لا توجد متطلبات مسجلة حتى الآن.
                                </div>
                            ) : (
                                <div style={{ display: "grid", gap: "9px" }}>
                                    {requirements.map((requirement) => (
                                        <div
                                            key={requirement.id}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "minmax(240px, 1fr) auto auto",
                                                gap: "12px",
                                                alignItems: "center",
                                                background: "#ffffff",
                                                border: "1px solid #e5e7eb",
                                                borderRadius: "16px",
                                                padding: "12px 14px",
                                            }}
                                        >
                                            <div>
                                                <strong
                                                    style={{
                                                        color: COLORS.navy,
                                                        lineHeight: 1.8,
                                                    }}
                                                >
                                                    {requirement.title}
                                                </strong>
                                                <p
                                                    style={{
                                                        margin: "4px 0 0",
                                                        color: COLORS.lightMuted,
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    {requirement.category} · متطلب رقم {requirement.id}
                                                </p>
                                            </div>

                                            <Badge style={getPriorityStyle(requirement.priority)}>
                                                {requirement.priority}
                                            </Badge>
                                            <Badge style={getCoverageBadgeStyle(requirement.status)}>
                                                {requirement.status}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>
                    )}
                </div>
            )}

            {/* ══ TAB: المستندات ═══════════════════════════════════════ */}
            {activeTab === "documents" && <SectionCard>
                <SectionHeader
                    title="مستندات المنافسة"
                    subtitle="رفع المستندات، استخراج النص، تحليل التغطية، ثم إنشاء مهام تنفيذية من الفجوات."
                    action={
                        <PrimaryButton onClick={loadTenderData} tone="light">
                            تحديث المستندات
                        </PrimaryButton>
                    }
                />

                {[documentMessage, coverageMessage, gapTaskMessage]
                    .filter(Boolean)
                    .map((message, index) => (
                        <div
                            key={index}
                            style={{
                                background: message.includes("تعذر") ? "#fef2f2" : "#ecfdf5",
                                color: message.includes("تعذر") ? "#991b1b" : "#065f46",
                                border: message.includes("تعذر")
                                    ? "1px solid #fecaca"
                                    : "1px solid #a7f3d0",
                                borderRadius: "14px",
                                padding: "13px",
                                marginBottom: "12px",
                                fontWeight: 800,
                            }}
                        >
                            {message}
                        </div>
                    ))}

                {documents.length === 0 ? (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                        لا توجد مستندات مرفوعة لهذه المنافسة حتى الآن.
                    </p>
                ) : (
                    <div style={{ display: "grid", gap: "14px" }}>
                        {documents.map((document) => {
                            const documentCoverage = coverageAnalyses[document.id];
                            const gapTaskResult = gapTaskResults[document.id];
                            const isTextExpanded = Boolean(expandedTextDocuments[document.id]);

                            const extractedText = document.extracted_text || "";
                            const extractedTextPreview =
                                extractedText.length > 900
                                    ? `${extractedText.slice(0, 900)}...`
                                    : extractedText;

                            return (
                                <div
                                    key={document.id}
                                    style={{
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: "18px",
                                        padding: "17px",
                                        background: "#f8fafc",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: "16px",
                                            alignItems: "flex-start",
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <div>
                                            <h3
                                                style={{
                                                    margin: "0 0 10px",
                                                    fontSize: "18px",
                                                    lineHeight: 1.6,
                                                }}
                                            >
                                                {document.original_filename}
                                            </h3>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "8px",
                                                    flexWrap: "wrap",
                                                    marginBottom: "10px",
                                                }}
                                            >
                                                <Badge
                                                    style={{
                                                        background: "#eff6ff",
                                                        color: "#1d4ed8",
                                                        border: "1px solid #bfdbfe",
                                                    }}
                                                >
                                                    رقم المستند: {document.id}
                                                </Badge>
                                                <Badge
                                                    style={{
                                                        background: "#f8fafc",
                                                        color: "#334155",
                                                        border: "1px solid #cbd5e1",
                                                    }}
                                                >
                                                    {document.mime_type || "نوع غير محدد"}
                                                </Badge>
                                                <Badge
                                                    style={
                                                        document.extraction_status === "completed"
                                                            ? getCoverageBadgeStyle("مغطى")
                                                            : document.extraction_status === "failed"
                                                                ? getCoverageBadgeStyle("غير مغطى")
                                                                : getCoverageBadgeStyle("مغطى جزئيًا")
                                                    }
                                                >
                                                    {translateExtractionStatus(document.extraction_status)}
                                                </Badge>
                                            </div>

                                            <p style={{ margin: 0, color: COLORS.muted }}>
                                                تاريخ الرفع: {formatDate(document.uploaded_at)}
                                            </p>
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "8px",
                                                flexWrap: "wrap",
                                                justifyContent: "flex-end",
                                            }}
                                        >
                                            <PrimaryButton
                                                onClick={() => extractDocument(document.id)}
                                                disabled={extractingDocumentId === document.id}
                                            >
                                                {extractingDocumentId === document.id
                                                    ? "جارٍ الاستخراج..."
                                                    : "استخراج النص"}
                                            </PrimaryButton>

                                            <PrimaryButton
                                                onClick={() => analyzeDocumentCoverage(document.id)}
                                                disabled={analyzingCoverageDocumentId === document.id}
                                                tone="teal"
                                            >
                                                {analyzingCoverageDocumentId === document.id
                                                    ? "جارٍ التحليل..."
                                                    : "تحليل التغطية"}
                                            </PrimaryButton>

                                            <PrimaryButton
                                                onClick={() => createGapTasksFromDocument(document.id)}
                                                disabled={creatingGapTasksDocumentId === document.id}
                                                tone="brown"
                                            >
                                                {creatingGapTasksDocumentId === document.id
                                                    ? "جارٍ إنشاء المهام..."
                                                    : "إنشاء مهام الفجوات"}
                                            </PrimaryButton>
                                        </div>
                                    </div>

                                    {documentCoverage && (
                                        <div
                                            style={{
                                                marginTop: "16px",
                                                background: "white",
                                                border: `1px solid ${COLORS.border}`,
                                                borderRadius: "16px",
                                                padding: "16px",
                                            }}
                                        >
                                            <SectionHeader
                                                title="تحليل تغطية المتطلبات من المستند"
                                                subtitle={documentCoverage.coverage_summary.recommendation}
                                            />

                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns:
                                                        "repeat(auto-fit, minmax(150px, 1fr))",
                                                    gap: "10px",
                                                }}
                                            >
                                                <KpiCard
                                                    label="المغطى"
                                                    value={documentCoverage.coverage_summary.covered_count}
                                                    accent={COLORS.green}
                                                />
                                                <KpiCard
                                                    label="مغطى جزئيًا"
                                                    value={documentCoverage.coverage_summary.partial_count}
                                                    accent={COLORS.orange}
                                                />
                                                <KpiCard
                                                    label="غير مغطى"
                                                    value={documentCoverage.coverage_summary.uncovered_count}
                                                    accent={COLORS.red}
                                                />
                                                <KpiCard
                                                    label="المخاطرة"
                                                    value={documentCoverage.coverage_summary.risk_level}
                                                    accent={COLORS.purple}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {gapTaskResult && (
                                        <div
                                            style={{
                                                marginTop: "16px",
                                                background: "#fff7ed",
                                                border: "1px solid #fed7aa",
                                                borderRadius: "16px",
                                                padding: "15px",
                                            }}
                                        >
                                            <h3 style={{ marginTop: 0 }}>
                                                المهام المنشأة من فجوات المستند
                                            </h3>
                                            <p style={{ color: "#7c2d12", marginBottom: 0 }}>
                                                تم إنشاء {gapTaskResult.created_count} مهمة، وتم تجاوز{" "}
                                                {gapTaskResult.skipped_count} مهمة مكررة.
                                            </p>
                                        </div>
                                    )}

                                    {document.extracted_text && (
                                        <div
                                            style={{
                                                marginTop: "16px",
                                                background: "white",
                                                border: `1px solid ${COLORS.border}`,
                                                borderRadius: "16px",
                                                padding: "14px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    gap: "12px",
                                                    marginBottom: "10px",
                                                }}
                                            >
                                                <p
                                                    style={{
                                                        margin: 0,
                                                        color: COLORS.navy,
                                                        fontWeight: 900,
                                                    }}
                                                >
                                                    النص المستخرج
                                                </p>

                                                <PrimaryButton
                                                    onClick={() => toggleExtractedText(document.id)}
                                                    tone="light"
                                                >
                                                    {isTextExpanded ? "إخفاء النص" : "عرض النص"}
                                                </PrimaryButton>
                                            </div>

                                            <pre
                                                style={{
                                                    margin: 0,
                                                    color: "#475569",
                                                    whiteSpace: "pre-wrap",
                                                    fontFamily: "inherit",
                                                    lineHeight: 1.8,
                                                    maxHeight: isTextExpanded ? "460px" : "120px",
                                                    overflow: "auto",
                                                    background: "#f8fafc",
                                                    border: `1px solid ${COLORS.softBorder}`,
                                                    borderRadius: "12px",
                                                    padding: "12px",
                                                }}
                                            >
                                                {isTextExpanded ? extractedText : extractedTextPreview}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionCard>}

            {/* ══ TAB: نظرة عامة — internal readiness analysis ══════════ */}
            {activeTab === "overview" && analysis && (
                <SectionCard>
                    <SectionHeader
                        title="تحليل الوكيل للجاهزية الداخلية"
                        subtitle="تحليل المتطلبات حسب التغطية الداخلية داخل النظام."
                    />

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                            gap: "12px",
                            marginBottom: "16px",
                        }}
                    >
                        <KpiCard label="المغطى" value={analysis.covered_count} accent={COLORS.green} />
                        <KpiCard label="مغطى جزئيًا" value={analysis.partial_count} accent={COLORS.orange} />
                        <KpiCard label="غير مغطى" value={analysis.uncovered_count} accent={COLORS.red} />
                        <KpiCard label="مستوى المخاطرة" value={analysis.risk_level} accent={COLORS.purple} />
                    </div>

                    <div
                        style={{
                            background: "#eef6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "16px",
                            padding: "15px",
                        }}
                    >
                        <p style={{ margin: 0, lineHeight: 1.9 }}>
                            <strong>توصية الوكيل:</strong> {analysis.recommendation}
                        </p>
                    </div>
                </SectionCard>
            )}

            {/* ══ TAB: مهام الفجوات ══════════════════════════════════════ */}
            {activeTab === "tasks" && <SectionCard>
                <SectionHeader
                    title="المهام المقترحة من الوكيل"
                    subtitle="مهام يتم توليدها من المتطلبات غير المغطاة أو المغطاة جزئيًا."
                    action={
                        <PrimaryButton
                            onClick={approveSuggestedTasks}
                            disabled={approving || suggestedTasks.length === 0}
                        >
                            {approving ? "جارٍ الاعتماد..." : "اعتماد المهام المقترحة"}
                        </PrimaryButton>
                    }
                />

                {approvalMessage && (
                    <div
                        style={{
                            background: approvalMessage.includes("تعذر") ? "#fef2f2" : "#ecfdf5",
                            color: approvalMessage.includes("تعذر") ? "#991b1b" : "#065f46",
                            border: approvalMessage.includes("تعذر")
                                ? "1px solid #fecaca"
                                : "1px solid #a7f3d0",
                            borderRadius: "14px",
                            padding: "13px",
                            marginBottom: "12px",
                            fontWeight: 800,
                        }}
                    >
                        {approvalMessage}
                    </div>
                )}

                {suggestedTasks.length === 0 ? (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                        لا توجد مهام مقترحة حاليًا.
                    </p>
                ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                        {suggestedTasks.map((task) => (
                            <div
                                key={task.id}
                                style={{
                                    background: "#f8fafc",
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: "16px",
                                    padding: "14px",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        flexWrap: "wrap",
                                        marginBottom: "8px",
                                    }}
                                >
                                    <h3 style={{ margin: 0, fontSize: "16px", lineHeight: 1.7 }}>
                                        {task.title}
                                    </h3>

                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                        <Badge style={getPriorityStyle(task.priority)}>
                                            {task.priority}
                                        </Badge>
                                        <Badge
                                            style={{
                                                background: "#eff6ff",
                                                color: "#1d4ed8",
                                                border: "1px solid #bfdbfe",
                                            }}
                                        >
                                            {task.status}
                                        </Badge>
                                    </div>
                                </div>

                                <p style={{ margin: "0 0 6px", color: COLORS.muted }}>
                                    <strong>المالك:</strong> {task.owner} ·{" "}
                                    <strong>التصنيف:</strong> {task.category}
                                </p>
                                <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.9 }}>
                                    {task.reason}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>}

        </main>
    );
}   