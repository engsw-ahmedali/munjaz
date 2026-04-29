"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { API_BASE_URL } from "@/lib/api";

type IntakeMode = "manual" | "file";

type RequirementInput = {
    title: string;
    category: string;
    priority: string;
    status: string;
};

type IntakeResult = {
    title: string;
    client: string;
    description: string;
    submission_deadline: string;
    status: string;
    readiness_score: number;
    requirements: RequirementInput[];
    required_documents: string[];
    risk_notes: string[];
    confidence_notes?: {
        overall?: string;
        fields_need_review?: string[];
        reason?: string;
    };
};

type AnalyzeResponse = {
    message: string;
    provider: string;
    source_filename: string;
    source_mime_type: string;
    temp_file_token: string;
    text_extracted: boolean;
    extracted_text_preview: string;
    notes?: string | null;
    intake_result: IntakeResult;
};

function parseRequirementsText(value: string): RequirementInput[] {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length >= 2)
        .map((line) => ({
            title: line,
            category: "عام",
            priority: "متوسطة",
            status: "غير مغطى",
        }));
}

function requirementsToText(requirements: RequirementInput[]) {
    return requirements.map((item) => item.title).join("\n");
}

function listToText(items: string[]) {
    return items.join("\n");
}

function textToList(value: string) {
    return value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
}

export default function NewTenderPage() {
    return (
        <Suspense fallback={<LoadingPage />}>
            <NewTenderPageContent />
        </Suspense>
    );
}

function LoadingPage() {
    return (
        <main dir="rtl" style={pageStyle}>
            <section style={emptyStyle}>جاري تحميل صفحة إنشاء المنافسة...</section>
        </main>
    );
}

function NewTenderPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [mode, setMode] = useState<IntakeMode>("manual");

    const [manualTitle, setManualTitle] = useState("");
    const [manualClient, setManualClient] = useState("");
    const [manualDescription, setManualDescription] = useState("");
    const [manualDeadline, setManualDeadline] = useState("");
    const [manualRequirementsText, setManualRequirementsText] = useState("");

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [analyzeResponse, setAnalyzeResponse] = useState<AnalyzeResponse | null>(null);
    const [reviewTitle, setReviewTitle] = useState("");
    const [reviewClient, setReviewClient] = useState("");
    const [reviewDescription, setReviewDescription] = useState("");
    const [reviewDeadline, setReviewDeadline] = useState("");
    const [reviewRequirementsText, setReviewRequirementsText] = useState("");
    const [reviewRequiredDocsText, setReviewRequiredDocsText] = useState("");
    const [reviewRiskNotesText, setReviewRiskNotesText] = useState("");

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const modeFromUrl: IntakeMode = searchParams.get("mode") === "file" ? "file" : "manual";
        setMode(modeFromUrl);
    }, [searchParams]);

    function changeMode(nextMode: IntakeMode) {
        setMode(nextMode);
        setMessage("");
        router.replace(`/tenders/new?mode=${nextMode}`, { scroll: false });
    }

    const manualRequirementsCount = useMemo(() => {
        return parseRequirementsText(manualRequirementsText).length;
    }, [manualRequirementsText]);

    const reviewRequirementsCount = useMemo(() => {
        return parseRequirementsText(reviewRequirementsText).length;
    }, [reviewRequirementsText]);

    async function createManualTender() {
        try {
            setLoading(true);
            setMessage("");

            const payload = {
                title: manualTitle,
                client: manualClient,
                description: manualDescription,
                submission_deadline: manualDeadline,
                status: "UNDER_REVIEW",
                readiness_score: 25,
                requirements: parseRequirementsText(manualRequirementsText),
            };

            const response = await fetch(`${API_BASE_URL}/intake/tenders/manual`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result = await response.json();
            router.push(`/tenders/${result.tender.id}`);
        } catch (error) {
            console.error(error);
            setMessage("تعذر إنشاء المنافسة يدويًا. راجع الحقول المطلوبة وتأكد أن الباك إند يعمل.");
        } finally {
            setLoading(false);
        }
    }

    async function analyzeFile() {
        if (!selectedFile) {
            setMessage("اختر ملف كراسة المنافسة أولًا.");
            return;
        }

        try {
            setLoading(true);
            setMessage("");

            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch(`${API_BASE_URL}/intake/tenders/from-file/analyze`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result: AnalyzeResponse = await response.json();
            const intake = result.intake_result;

            setAnalyzeResponse(result);
            setReviewTitle(intake.title || "");
            setReviewClient(intake.client || "");
            setReviewDescription(intake.description || "");
            setReviewDeadline(intake.submission_deadline || "");
            setReviewRequirementsText(requirementsToText(intake.requirements || []));
            setReviewRequiredDocsText(listToText(intake.required_documents || []));
            setReviewRiskNotesText(listToText(intake.risk_notes || []));
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحليل الملف. تأكد من صيغة الملف وأن OpenAI API Key يعمل في الباك إند.");
        } finally {
            setLoading(false);
        }
    }

    async function confirmFileTender() {
        if (!analyzeResponse) {
            setMessage("حلل الملف أولًا ثم اعتمد إنشاء المنافسة.");
            return;
        }

        try {
            setLoading(true);
            setMessage("");

            const payload = {
                title: reviewTitle,
                client: reviewClient,
                description: reviewDescription,
                submission_deadline: reviewDeadline,
                status: "UNDER_REVIEW",
                readiness_score: 25,
                requirements: parseRequirementsText(reviewRequirementsText),
                required_documents: textToList(reviewRequiredDocsText),
                risk_notes: textToList(reviewRiskNotesText),
                source_filename: analyzeResponse.source_filename,
                source_mime_type: analyzeResponse.source_mime_type,
                temp_file_token: analyzeResponse.temp_file_token,
                extracted_text: analyzeResponse.extracted_text_preview,
            };

            const response = await fetch(`${API_BASE_URL}/intake/tenders/from-file/confirm`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const result = await response.json();
            router.push(`/tenders/${result.tender.id}`);
        } catch (error) {
            console.error(error);
            setMessage("تعذر اعتماد المنافسة من الملف. راجع البيانات المستخرجة ثم حاول مرة أخرى.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div>
                    <span style={pillStyle}>إدخال المنافسة</span>
                    <h1 style={titleStyle}>إنشاء منافسة جديدة</h1>
                    <p style={subtitleStyle}>
                        اختر طريقة إنشاء المنافسة: إدخال يدوي كامل، أو رفع كراسة المنافسة ليقوم الوكيل
                        باستخراج البيانات الأولية ثم تعرضها للمراجعة قبل الحفظ.
                    </p>
                </div>

                <a href="/tenders" style={secondaryButtonStyle}>
                    العودة للمناقصات
                </a>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            <section style={modeSwitchStyle}>
                <button
                    onClick={() => changeMode("file")}
                    style={mode === "file" ? activeModeButtonStyle : modeButtonStyle}
                >
                    إنشاء من ملف
                </button>

                <button
                    onClick={() => changeMode("manual")}
                    style={mode === "manual" ? activeModeButtonStyle : modeButtonStyle}
                >
                    إدخال يدوي
                </button>
            </section>

            {mode === "file" ? (
                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>إنشاء من ملف</span>
                        <h2 style={sectionTitleStyle}>إنشاء منافسة من ملف</h2>
                        <p style={sectionSubtitleStyle}>
                            ارفع كراسة PDF أو Word أو TXT، ثم راجع البيانات التي يستخرجها الوكيل قبل اعتماد إنشاء المنافسة.
                        </p>
                    </div>

                    <div style={uploadBoxStyle}>
                        <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            onChange={(event) => {
                                setSelectedFile(event.target.files?.[0] || null);
                                setAnalyzeResponse(null);
                                setMessage("");
                            }}
                            style={fileInputStyle}
                        />

                        <button onClick={analyzeFile} disabled={loading || !selectedFile} style={primaryButtonStyle}>
                            {loading ? "جاري التحليل..." : "تحليل الملف"}
                        </button>
                    </div>

                    {selectedFile ? (
                        <div style={selectedFileStyle}>
                            <strong>الملف المختار:</strong>
                            <span>{selectedFile.name}</span>
                        </div>
                    ) : null}

                    {analyzeResponse ? (
                        <section style={reviewBoxStyle}>
                            <div style={reviewHeaderStyle}>
                                <div>
                                    <span style={pillStyle}>مراجعة قبل الإنشاء</span>
                                    <h3 style={sectionTitleStyle}>مراجعة البيانات المستخرجة</h3>
                                    <p style={sectionSubtitleStyle}>
                                        المصدر: {analyzeResponse.provider} — الملف: {analyzeResponse.source_filename}
                                    </p>
                                </div>

                                <div style={infoBoxStyle}>
                                    <div style={smallLabelStyle}>المتطلبات</div>
                                    <strong>{reviewRequirementsCount}</strong>
                                </div>
                            </div>

                            <div style={formGridStyle}>
                                <Field label="عنوان المنافسة">
                                    <input
                                        value={reviewTitle}
                                        onChange={(event) => setReviewTitle(event.target.value)}
                                        style={inputStyle}
                                    />
                                </Field>

                                <Field label="الجهة">
                                    <input
                                        value={reviewClient}
                                        onChange={(event) => setReviewClient(event.target.value)}
                                        style={inputStyle}
                                    />
                                </Field>

                                <Field label="آخر موعد للتقديم">
                                    <input
                                        value={reviewDeadline}
                                        onChange={(event) => setReviewDeadline(event.target.value)}
                                        style={inputStyle}
                                    />
                                </Field>

                                <div style={infoBoxStyle}>
                                    <div style={smallLabelStyle}>استخراج النص</div>
                                    <strong>{analyzeResponse.text_extracted ? "تم" : "محدود"}</strong>
                                </div>
                            </div>

                            <Field label="الوصف">
                                <textarea
                                    value={reviewDescription}
                                    onChange={(event) => setReviewDescription(event.target.value)}
                                    style={textareaStyle}
                                />
                            </Field>

                            <Field label="المتطلبات المستخرجة — راجع وعدّل">
                                <textarea
                                    value={reviewRequirementsText}
                                    onChange={(event) => setReviewRequirementsText(event.target.value)}
                                    style={textareaStyle}
                                />
                            </Field>

                            <div style={twoColumnsStyle}>
                                <Field label="المستندات المطلوبة">
                                    <textarea
                                        value={reviewRequiredDocsText}
                                        onChange={(event) => setReviewRequiredDocsText(event.target.value)}
                                        style={textareaStyle}
                                    />
                                </Field>

                                <Field label="المخاطر والملاحظات">
                                    <textarea
                                        value={reviewRiskNotesText}
                                        onChange={(event) => setReviewRiskNotesText(event.target.value)}
                                        style={textareaStyle}
                                    />
                                </Field>
                            </div>

                            <div style={actionsRowStyle}>
                                <button onClick={confirmFileTender} disabled={loading} style={primaryButtonStyle}>
                                    {loading ? "جاري الاعتماد..." : "اعتماد وإنشاء المنافسة"}
                                </button>
                            </div>
                        </section>
                    ) : null}
                </section>
            ) : null}

            {mode === "manual" ? (
                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>إدخال يدوي</span>
                        <h2 style={sectionTitleStyle}>إضافة منافسة يدويًا</h2>
                        <p style={sectionSubtitleStyle}>
                            هذا المسار مناسب عندما تكون بيانات المنافسة واضحة لديك وتريد إدخالها مباشرة.
                        </p>
                    </div>

                    <div style={formGridStyle}>
                        <Field label="عنوان المنافسة">
                            <input
                                value={manualTitle}
                                onChange={(event) => setManualTitle(event.target.value)}
                                placeholder="مثال: Smart Campus ELV Deployment"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="الجهة">
                            <input
                                value={manualClient}
                                onChange={(event) => setManualClient(event.target.value)}
                                placeholder="مثال: Future University"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="آخر موعد للتقديم">
                            <input
                                value={manualDeadline}
                                onChange={(event) => setManualDeadline(event.target.value)}
                                placeholder="2026-06-01"
                                style={inputStyle}
                            />
                        </Field>

                        <div style={infoBoxStyle}>
                            <div style={smallLabelStyle}>عدد المتطلبات</div>
                            <strong>{manualRequirementsCount}</strong>
                        </div>
                    </div>

                    <Field label="الوصف">
                        <textarea
                            value={manualDescription}
                            onChange={(event) => setManualDescription(event.target.value)}
                            placeholder="اكتب وصفًا واضحًا للمنافسة ونطاق العمل..."
                            style={textareaStyle}
                        />
                    </Field>

                    <Field label="المتطلبات — كل متطلب في سطر مستقل">
                        <textarea
                            value={manualRequirementsText}
                            onChange={(event) => setManualRequirementsText(event.target.value)}
                            placeholder={
                                "خبرة في أنظمة ELV للمجمعات التعليمية\nتقديم خطة تنفيذ متكاملة\nشهادة ISO 27001 سارية"
                            }
                            style={textareaStyle}
                        />
                    </Field>

                    <div style={actionsRowStyle}>
                        <button onClick={createManualTender} disabled={loading} style={primaryButtonStyle}>
                            {loading ? "جاري الإنشاء..." : "إنشاء المنافسة"}
                        </button>
                    </div>
                </section>
            ) : null}
        </main>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label style={fieldStyle}>
            <span style={labelStyle}>{label}</span>
            {children}
        </label>
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

const modeSwitchStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "20px",
    padding: "10px",
    marginBottom: "18px",
};

const modeButtonStyle: CSSProperties = {
    flex: 1,
    border: "1px solid #cbd5e1",
    borderRadius: "15px",
    padding: "14px 16px",
    background: "white",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
};

const activeModeButtonStyle: CSSProperties = {
    ...modeButtonStyle,
    background: "#0f172a",
    color: "white",
    borderColor: "#0f172a",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 16px 38px rgba(15,23,42,0.055)",
};

const sectionHeaderStyle: CSSProperties = {
    marginBottom: "18px",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "25px",
};

const sectionSubtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.8,
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
    padding: "34px",
    borderRadius: "20px",
    background: "white",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    fontWeight: 900,
    textAlign: "center",
};

const formGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 180px",
    gap: "14px",
    marginBottom: "16px",
};

const fieldStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
};

const labelStyle: CSSProperties = {
    color: "#334155",
    fontWeight: 900,
    fontSize: "13px",
};

const inputStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "15px",
    padding: "13px 14px",
    outline: "none",
    fontWeight: 800,
    background: "white",
};

const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: "135px",
    resize: "vertical",
    lineHeight: 1.8,
};

const infoBoxStyle: CSSProperties = {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: "16px",
    padding: "13px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
};

const smallLabelStyle: CSSProperties = {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "7px",
};

const actionsRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-start",
    gap: "10px",
    marginTop: "8px",
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

const uploadBoxStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "12px",
    border: "1px dashed #cbd5e1",
    borderRadius: "20px",
    padding: "18px",
    background: "#f8fafc",
    marginBottom: "18px",
};

const fileInputStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "15px",
    padding: "13px",
    background: "white",
    fontWeight: 800,
};

const selectedFileStyle: CSSProperties = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "13px 15px",
    borderRadius: "15px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    fontWeight: 800,
    marginBottom: "18px",
};

const reviewBoxStyle: CSSProperties = {
    border: "1px solid #bbf7d0",
    borderRadius: "22px",
    padding: "20px",
    background:
        "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(240,253,250,0.6) 100%)",
};

const reviewHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "16px",
};

const twoColumnsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
};