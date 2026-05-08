"use client";

import Link from "next/link";
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

function formatFileSize(file: File | null) {
    if (!file) return "لم يتم اختيار ملف";
    const size = file.size;
    if (size < 1024) return `${size} بايت`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} كيلوبايت`;
    return `${(size / (1024 * 1024)).toFixed(1)} ميجابايت`;
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

    const reviewDocsCount = useMemo(() => {
        return textToList(reviewRequiredDocsText).length;
    }, [reviewRequiredDocsText]);

    const reviewRisksCount = useMemo(() => {
        return textToList(reviewRiskNotesText).length;
    }, [reviewRiskNotesText]);

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
                <div style={heroPatternStyle} />
                <div style={heroContentStyle}>
                    <span style={pillStyle}>استيعاب كراسة المنافسة</span>
                    <h1 style={titleStyle}>إنشاء منافسة جديدة</h1>
                    <p style={subtitleStyle}>
                        ابدأ رحلة الوكيل من كراسة المنافسة. يقرأ الملف، يستخرج البيانات الأساسية،
                        يلتقط المتطلبات والمستندات والمخاطر، ثم ينشئ مركز قرار قابلًا للمراجعة.
                    </p>

                    <div style={heroChecklistStyle}>
                        <HeroPoint>استخراج بيانات المنافسة</HeroPoint>
                        <HeroPoint>تحويل المتطلبات إلى سجل تشغيلي</HeroPoint>
                        <HeroPoint>مراجعة بشرية قبل الاعتماد</HeroPoint>
                    </div>
                </div>

                <Link href="/tenders" style={secondaryButtonStyle}>
                    العودة للمنافسات
                </Link>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            <section style={modeSwitchStyle}>
                <button
                    type="button"
                    onClick={() => changeMode("file")}
                    style={mode === "file" ? activeModeButtonStyle : modeButtonStyle}
                >
                    <span style={modeButtonTitleStyle}>إنشاء من ملف</span>
                    <span style={modeButtonHintStyle}>المسار الأسرع لبدء عمل الوكيل</span>
                </button>

                <button
                    type="button"
                    onClick={() => changeMode("manual")}
                    style={mode === "manual" ? activeModeButtonStyle : modeButtonStyle}
                >
                    <span style={modeButtonTitleStyle}>إدخال يدوي</span>
                    <span style={modeButtonHintStyle}>للفرص التي بياناتها جاهزة</span>
                </button>
            </section>

            {mode === "file" ? (
                <section style={fileGridStyle}>
                    <section style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <span style={pillStyle}>إنشاء من ملف</span>
                            <h2 style={sectionTitleStyle}>ارفع كراسة المنافسة</h2>
                            <p style={sectionSubtitleStyle}>
                                يدعم المسار ملفات PDF و Word و TXT. بعد التحليل ستظهر البيانات المستخرجة
                                في نموذج مراجعة قبل إنشاء المنافسة داخل النظام.
                            </p>
                        </div>

                        <div style={uploadBoxStyle}>
                            <div style={uploadIconStyle}>↥</div>

                            <div style={uploadCopyStyle}>
                                <strong style={uploadTitleStyle}>اختر ملف الكراسة</strong>
                                <span style={uploadHintStyle}>
                                    استخدم ملف كراسة أو شروط أو نطاق عمل. سيقوم الوكيل بتحليل النص وتحويله إلى بيانات قابلة للتشغيل.
                                </span>
                            </div>

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

                            <div style={supportedFormatsStyle}>
                                <FormatChip>PDF</FormatChip>
                                <FormatChip>DOCX</FormatChip>
                                <FormatChip>TXT</FormatChip>
                            </div>
                        </div>

                        <div style={fileSummaryStyle}>
                            <div style={fileMetaStyle}>
                                <span>الملف المختار</span>
                                <strong>{selectedFile?.name || "لم يتم اختيار ملف بعد"}</strong>
                            </div>
                            <div style={fileMetaStyle}>
                                <span>الحجم</span>
                                <strong>{formatFileSize(selectedFile)}</strong>
                            </div>
                            <button
                                type="button"
                                onClick={analyzeFile}
                                disabled={loading || !selectedFile}
                                style={{
                                    ...primaryButtonStyle,
                                    opacity: loading || !selectedFile ? 0.62 : 1,
                                    cursor: loading || !selectedFile ? "not-allowed" : "pointer",
                                }}
                            >
                                {loading ? "الوكيل يحلل الملف..." : "تشغيل تحليل الوكيل"}
                            </button>
                        </div>

                        {analyzeResponse ? (
                            <div style={successStyle}>
                                تم تحليل الملف. راجع البيانات المستخرجة قبل إنشاء مركز القرار.
                            </div>
                        ) : null}
                    </section>

                    <aside style={agentPlanStyle}>
                        <span style={pillStyle}>ما الذي سيفعله الوكيل؟</span>
                        <h3 style={sideTitleStyle}>مسار تحليل الوكيل</h3>

                        <div style={stepsListStyle}>
                            <IntakeStep index="1" title="قراءة الملف" text="استخراج النص من كراسة المنافسة أو مستند النطاق." />
                            <IntakeStep index="2" title="تحديد البيانات" text="اسم المنافسة، الجهة، الوصف، وآخر موعد للتقديم." />
                            <IntakeStep index="3" title="استخراج المتطلبات" text="تحويل الشروط والمتطلبات إلى عناصر قابلة للفحص." />
                            <IntakeStep index="4" title="تجهيز مركز القرار" text="إنشاء المنافسة ثم بدء رحلة الجاهزية والأدلة والفجوات." />
                        </div>

                        <div style={reviewNoticeStyle}>
                            <strong>مهم:</strong>
                            <span>
                                لا يتم اعتماد أي نتيجة تلقائيًا. البيانات المستخرجة تعرض للمراجعة والتعديل قبل الحفظ.
                            </span>
                        </div>
                    </aside>
                </section>
            ) : null}

            {mode === "file" && analyzeResponse ? (
                <section style={reviewBoxStyle}>
                    <div style={reviewHeaderStyle}>
                        <div>
                            <span style={pillStyle}>مراجعة قبل الإنشاء</span>
                            <h3 style={sectionTitleStyle}>مراجعة البيانات المستخرجة</h3>
                            <p style={sectionSubtitleStyle}>
                                المصدر: {analyzeResponse.provider} — الملف: {analyzeResponse.source_filename}
                            </p>
                        </div>

                        <div style={reviewStatsStyle}>
                            <InfoMetric title="المتطلبات" value={`${reviewRequirementsCount}`} />
                            <InfoMetric title="المستندات" value={`${reviewDocsCount}`} />
                            <InfoMetric title="المخاطر" value={`${reviewRisksCount}`} />
                            <InfoMetric title="استخراج النص" value={analyzeResponse.text_extracted ? "تم" : "محدود"} />
                        </div>
                    </div>

                    {analyzeResponse.intake_result?.confidence_notes ? (
                        <div style={confidenceStyle}>
                            <strong>ملاحظة ثقة الوكيل:</strong>
                            <span>
                                {analyzeResponse.intake_result.confidence_notes.reason ||
                                    analyzeResponse.intake_result.confidence_notes.overall ||
                                    "بعض الحقول قد تحتاج مراجعة بشرية قبل الاعتماد."}
                            </span>
                        </div>
                    ) : null}

                    <AgentExtractionReport
                        response={analyzeResponse}
                        requirementsCount={reviewRequirementsCount}
                        docsCount={reviewDocsCount}
                        risksCount={reviewRisksCount}
                    />

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
                    </div>

                    <Field label="الوصف">
                        <textarea
                            value={reviewDescription}
                            onChange={(event) => setReviewDescription(event.target.value)}
                            style={textareaStyle}
                        />
                    </Field>

                    <Field label="المتطلبات المستخرجة — كل متطلب في سطر مستقل">
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
                        <button
                            type="button"
                            onClick={confirmFileTender}
                            disabled={loading}
                            style={{
                                ...primaryButtonStyle,
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? "جاري إنشاء مركز القرار..." : "اعتماد وإنشاء مركز القرار"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAnalyzeResponse(null)}
                            disabled={loading}
                            style={secondaryButtonStyle}
                        >
                            إعادة اختيار ملف
                        </button>
                    </div>
                </section>
            ) : null}

            {mode === "manual" ? (
                <section style={manualGridStyle}>
                    <section style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <span style={pillStyle}>إدخال يدوي</span>
                            <h2 style={sectionTitleStyle}>إضافة منافسة يدويًا</h2>
                            <p style={sectionSubtitleStyle}>
                                هذا المسار مناسب عندما تكون بيانات المنافسة واضحة لديك وتريد إنشاء فرصة داخل النظام مباشرة.
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
                            <button
                                type="button"
                                onClick={createManualTender}
                                disabled={loading}
                                style={{
                                    ...primaryButtonStyle,
                                    opacity: loading ? 0.7 : 1,
                                }}
                            >
                                {loading ? "جاري الإنشاء..." : "إنشاء المنافسة"}
                            </button>
                        </div>
                    </section>

                    <aside style={agentPlanStyle}>
                        <span style={pillStyle}>جاهزية الإدخال</span>
                        <h3 style={sideTitleStyle}>ملخص قبل الإنشاء</h3>
                        <div style={manualMetricsStyle}>
                            <InfoMetric title="المتطلبات" value={`${manualRequirementsCount}`} />
                            <InfoMetric title="الحالة الأولية" value="قيد المراجعة" />
                            <InfoMetric title="جاهزية أولية" value="25%" />
                        </div>
                        <div style={reviewNoticeStyle}>
                            <strong>بعد الإنشاء:</strong>
                            <span>
                                ستنتقل إلى مركز القرار لبدء تحليل الموارد والأدلة وتوليد مهام الفجوات.
                            </span>
                        </div>
                    </aside>
                </section>
            ) : null}
        </main>
    );
}


function AgentExtractionReport({
    response,
    requirementsCount,
    docsCount,
    risksCount,
}: {
    response: AnalyzeResponse;
    requirementsCount: number;
    docsCount: number;
    risksCount: number;
}) {
    const isOpenAI = String(response.provider || "").toLowerCase().includes("openai");
    const providerLabel = isOpenAI ? "OpenAI Structured Extraction" : "محلل داخلي منظم";
    const confidence = response.intake_result?.confidence_notes?.overall || (isOpenAI ? "عالية" : "متوسطة");

    return (
        <section style={agentReportStyle}>
            <div style={agentReportTopStyle}>
                <div>
                    <span style={agentProviderBadgeStyle}>
                        <span style={liveDotStyle} />
                        تحليل الوكيل اكتمل
                    </span>
                    <h4 style={agentReportTitleStyle}>تقرير الاستخراج الذكي</h4>
                    <p style={agentReportTextStyle}>
                        قام الوكيل بقراءة الكراسة وتقسيمها إلى أقسام تشغيلية، ثم فصل بيانات المنافسة عن
                        المتطلبات والمستندات والمخاطر قبل عرضها للمراجعة.
                    </p>
                </div>

                <div style={agentProviderBoxStyle}>
                    <span>المحرك المستخدم</span>
                    <strong>{providerLabel}</strong>
                    <small>الثقة: {confidence}</small>
                </div>
            </div>

            <div style={agentReportGridStyle}>
                <div style={agentReportMetricStyle}>
                    <span>حقول رئيسية</span>
                    <strong>3/3</strong>
                    <small>العنوان، الجهة، الموعد</small>
                </div>
                <div style={agentReportMetricStyle}>
                    <span>متطلبات مفصولة</span>
                    <strong>{requirementsCount}</strong>
                    <small>من قسم المتطلبات الفنية</small>
                </div>
                <div style={agentReportMetricStyle}>
                    <span>مستندات مطلوبة</span>
                    <strong>{docsCount}</strong>
                    <small>جاهزة للتحقق لاحقًا</small>
                </div>
                <div style={agentReportMetricStyle}>
                    <span>مخاطر مرصودة</span>
                    <strong>{risksCount}</strong>
                    <small>تدخل في قرار التقديم</small>
                </div>
            </div>

            <div style={agentTraceListStyle}>
                <span style={agentTraceItemStyle}>✓ قراءة النص الخام</span>
                <span style={agentTraceItemStyle}>✓ تحديد أقسام الكراسة</span>
                <span style={agentTraceItemStyle}>✓ استخراج المتطلبات فقط</span>
                <span style={agentTraceItemStyle}>✓ تجهيز مراجعة بشرية قبل الاعتماد</span>
            </div>
        </section>
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

function HeroPoint({ children }: { children: ReactNode }) {
    return (
        <span style={heroPointStyle}>
            <span style={checkDotStyle}>✓</span>
            {children}
        </span>
    );
}

function FormatChip({ children }: { children: ReactNode }) {
    return <span style={formatChipStyle}>{children}</span>;
}

function IntakeStep({ index, title, text }: { index: string; title: string; text: string }) {
    return (
        <div style={stepStyle}>
            <div style={stepNumberStyle}>{index}</div>
            <div>
                <strong style={stepTitleStyle}>{title}</strong>
                <p style={stepTextStyle}>{text}</p>
            </div>
        </div>
    );
}

function InfoMetric({ title, value }: { title: string; value: string }) {
    return (
        <div style={infoBoxStyle}>
            <span style={smallLabelStyle}>{title}</span>
            <strong>{value}</strong>
        </div>
    );
}

const brand = {
    green: "#59BA47",
    greenDark: "#3f9633",
    dark: "#232122",
    background: "#F4F6F6",
    border: "#DFE7E4",
    muted: "#66736f",
    card: "#ffffff",
};

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: brand.background,
    color: brand.dark,
    fontFamily: '"Thmanyah Sans", "IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
    display: "grid",
    gap: "14px",
};

const heroStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    display: "flex",
    justifyContent: "space-between",
    gap: "22px",
    alignItems: "center",
    padding: "28px",
    borderRadius: "24px",
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

const heroContentStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    maxWidth: "900px",
};

const pillStyle: CSSProperties = {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
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
    fontSize: "28px",
    letterSpacing: "-0.04em",
    color: "#ffffff",
    fontWeight: 950,
};

const subtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "rgba(255,255,255,0.52)",
    lineHeight: 1.8,
    maxWidth: "860px",
    fontSize: "13px",
};

const heroChecklistStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "16px",
};

const heroPointStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "8px 11px",
    borderRadius: "999px",
    background: "white",
    border: `1px solid ${brand.border}`,
    color: "#485651",
    fontWeight: 900,
    fontSize: "12px",
};

const checkDotStyle: CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: 18,
    height: 18,
    borderRadius: "999px",
    background: "rgba(89,186,71,0.14)",
    color: brand.greenDark,
    fontSize: "12px",
};

const modeSwitchStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    background: "rgba(255,255,255,0.88)",
    border: `1px solid ${brand.border}`,
    borderRadius: "22px",
    padding: "10px",
    boxShadow: "0 10px 26px rgba(35,33,34,0.035)",
};

const modeButtonStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "16px",
    padding: "13px 16px",
    background: "white",
    color: brand.dark,
    fontWeight: 900,
    cursor: "pointer",
    display: "grid",
    gap: "4px",
    textAlign: "center",
};

const activeModeButtonStyle: CSSProperties = {
    ...modeButtonStyle,
    background: brand.green,
    color: "white",
    borderColor: brand.green,
    boxShadow: `0 8px 20px ${brand.green}44`,
};

const modeButtonTitleStyle: CSSProperties = {
    fontWeight: 950,
};

const modeButtonHintStyle: CSSProperties = {
    fontSize: "12px",
    opacity: 0.74,
};

const fileGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.25fr) minmax(310px, 0.75fr)",
    gap: "16px",
    alignItems: "stretch",
};

const manualGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(300px, 0.7fr)",
    gap: "16px",
    alignItems: "start",
};

const cardStyle: CSSProperties = {
    background: brand.card,
    border: `1px solid ${brand.border}`,
    borderRadius: "26px",
    padding: "24px",
    boxShadow: "0 16px 38px rgba(35,33,34,0.055)",
};

const sectionHeaderStyle: CSSProperties = {
    marginBottom: "18px",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "25px",
    color: brand.dark,
    letterSpacing: "-0.03em",
};

const sectionSubtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: brand.muted,
    lineHeight: 1.8,
    fontWeight: 650,
};

const uploadBoxStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "56px 1fr",
    gap: "14px",
    alignItems: "center",
    border: `1px dashed ${brand.border}`,
    borderRadius: "24px",
    padding: "18px",
    background:
        "linear-gradient(135deg, rgba(244,246,246,0.96) 0%, rgba(255,255,255,1) 100%)",
    marginBottom: "16px",
};

const uploadIconStyle: CSSProperties = {
    width: 56,
    height: 56,
    borderRadius: "18px",
    display: "grid",
    placeItems: "center",
    background: "rgba(89,186,71,0.12)",
    color: brand.greenDark,
    fontSize: "30px",
    fontWeight: 900,
};

const uploadCopyStyle: CSSProperties = {
    display: "grid",
    gap: "5px",
};

const uploadTitleStyle: CSSProperties = {
    fontSize: "17px",
    color: brand.dark,
};

const uploadHintStyle: CSSProperties = {
    color: brand.muted,
    lineHeight: 1.7,
    fontSize: "13px",
    fontWeight: 650,
};

const fileInputStyle: CSSProperties = {
    gridColumn: "1 / -1",
    border: `1px solid ${brand.border}`,
    borderRadius: "16px",
    padding: "13px",
    background: "white",
    fontWeight: 800,
    color: brand.dark,
};

const supportedFormatsStyle: CSSProperties = {
    gridColumn: "1 / -1",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
};

const formatChipStyle: CSSProperties = {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#f8fafc",
    border: `1px solid ${brand.border}`,
    color: "#51615c",
    fontSize: "12px",
    fontWeight: 900,
};

const fileSummaryStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 170px auto",
    gap: "10px",
    alignItems: "stretch",
};

const fileMetaStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    background: "#fbfdfc",
    borderRadius: "16px",
    padding: "12px 13px",
    display: "grid",
    gap: "5px",
    color: brand.muted,
    fontSize: "12px",
    fontWeight: 900,
};

const agentPlanStyle: CSSProperties = {
    background: brand.card,
    border: `1px solid ${brand.border}`,
    borderRadius: "26px",
    padding: "24px",
    boxShadow: "0 16px 38px rgba(35,33,34,0.045)",
    display: "grid",
    gap: "16px",
};

const sideTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "22px",
    color: brand.dark,
};

const stepsListStyle: CSSProperties = {
    display: "grid",
    gap: "12px",
};

const stepStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "36px 1fr",
    gap: "11px",
    alignItems: "start",
    padding: "13px",
    borderRadius: "18px",
    background: "#fbfdfc",
    border: `1px solid ${brand.border}`,
};

const stepNumberStyle: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: "13px",
    display: "grid",
    placeItems: "center",
    background: brand.dark,
    color: "white",
    fontWeight: 950,
};

const stepTitleStyle: CSSProperties = {
    color: brand.dark,
    fontSize: "14px",
};

const stepTextStyle: CSSProperties = {
    margin: "5px 0 0",
    color: brand.muted,
    lineHeight: 1.65,
    fontSize: "12px",
    fontWeight: 650,
};

const reviewNoticeStyle: CSSProperties = {
    display: "grid",
    gap: "5px",
    padding: "14px",
    borderRadius: "18px",
    background: "rgba(89,186,71,0.08)",
    border: "1px solid rgba(89,186,71,0.26)",
    color: "#315c2d",
    lineHeight: 1.7,
    fontWeight: 800,
};

const successStyle: CSSProperties = {
    marginTop: "14px",
    padding: "14px",
    borderRadius: "18px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    fontWeight: 900,
};

const reviewBoxStyle: CSSProperties = {
    border: "1px solid rgba(89,186,71,0.28)",
    borderRadius: "26px",
    padding: "24px",
    background:
        "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(240,253,244,0.55) 100%)",
    boxShadow: "0 16px 38px rgba(35,33,34,0.052)",
};

const reviewHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "18px",
};

const reviewStatsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(96px, 1fr))",
    gap: "10px",
    minWidth: "460px",
};

const confidenceStyle: CSSProperties = {
    display: "grid",
    gap: "4px",
    padding: "13px 15px",
    borderRadius: "18px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontWeight: 800,
    marginBottom: "16px",
    lineHeight: 1.75,
};

const formGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "14px",
    marginBottom: "16px",
};

const twoColumnsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
};

const fieldStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
};

const labelStyle: CSSProperties = {
    color: "#485651",
    fontWeight: 900,
    fontSize: "13px",
};

const inputStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "15px",
    padding: "13px 14px",
    outline: "none",
    fontWeight: 800,
    background: "white",
    color: brand.dark,
};

const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: "135px",
    resize: "vertical",
    lineHeight: 1.8,
};

const infoBoxStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    background: "#fbfdfc",
    borderRadius: "16px",
    padding: "13px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "5px",
};

const smallLabelStyle: CSSProperties = {
    color: "#8a9591",
    fontSize: "12px",
    fontWeight: 900,
};

const actionsRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-start",
    gap: "10px",
    marginTop: "8px",
    flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "16px",
    padding: "13px 18px",
    background: brand.dark,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 14px 30px rgba(35,33,34,0.16)",
};

const secondaryButtonStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "16px",
    padding: "12px 17px",
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
    padding: "16px",
    borderRadius: "18px",
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 850,
};

const emptyStyle: CSSProperties = {
    padding: "34px",
    borderRadius: "20px",
    background: "white",
    border: `1px dashed ${brand.border}`,
    color: brand.muted,
    fontWeight: 900,
    textAlign: "center",
};


const agentReportStyle: CSSProperties = {
    border: "1px solid rgba(89,186,71,0.28)",
    borderRadius: "22px",
    padding: "18px",
    marginBottom: "18px",
    background:
        "linear-gradient(135deg, rgba(240,253,244,0.88) 0%, rgba(255,255,255,0.98) 58%, rgba(239,246,255,0.72) 100%)",
    boxShadow: "0 14px 34px rgba(35,33,34,0.045)",
};

const agentReportTopStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    marginBottom: "14px",
};

const agentProviderBadgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "7px 12px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.12)",
    color: brand.greenDark,
    border: "1px solid rgba(89,186,71,0.28)",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "8px",
};

const liveDotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: "999px",
    background: brand.green,
    boxShadow: "0 0 0 5px rgba(89,186,71,0.12)",
};

const agentReportTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "20px",
    color: brand.dark,
};

const agentReportTextStyle: CSSProperties = {
    margin: "7px 0 0",
    color: brand.muted,
    lineHeight: 1.9,
    fontWeight: 650,
};

const agentProviderBoxStyle: CSSProperties = {
    minWidth: "210px",
    border: `1px solid ${brand.border}`,
    borderRadius: "18px",
    padding: "13px",
    background: "white",
    display: "grid",
    gap: "5px",
    color: brand.muted,
    fontSize: "12px",
    fontWeight: 900,
};

const agentReportGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
    marginBottom: "12px",
};

const agentReportMetricStyle: CSSProperties = {
    border: `1px solid ${brand.border}`,
    borderRadius: "16px",
    padding: "12px",
    background: "rgba(255,255,255,0.86)",
    display: "grid",
    gap: "4px",
    color: brand.muted,
    fontSize: "12px",
    fontWeight: 900,
};

const agentTraceListStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
};

const agentTraceItemStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 11px",
    borderRadius: "999px",
    background: "white",
    border: `1px solid ${brand.border}`,
    color: "#485651",
    fontSize: "12px",
    fontWeight: 900,
};


const manualMetricsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
};
