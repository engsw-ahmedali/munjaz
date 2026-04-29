"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type TeamMember = {
    id: number;
    name: string;
    role: string;
    title: string;
    department: string;
    email?: string;
};

type GapTask = {
    id: number;
    tender_id: number;
    requirement_id?: number;
    requirement_title: string;
    title: string;
    description: string;
    owner_role: string;
    owner_name: string;
    owner_department: string;
    priority: string;
    status: string;
    evidence_type: string;
    evidence_instruction: string;
    impact_score: number;
    due_date?: string;
    verification_status: string;
    verification_notes?: string;
    evidence_note?: string;
    created_at: string;
    updated_at: string;
    closed_at?: string;
};

type TaskEvidence = {
    id: number;
    task_id: number;
    tender_id: number;
    original_filename: string;
    stored_filename: string;
    file_path: string;
    mime_type?: string;
    file_size: number;
    evidence_note?: string;
    extracted_text?: string;
    extraction_status: string;
    verification_status: string;
    verification_score: number;
    verification_reason?: string;
    uploaded_by_role?: string;
    uploaded_by_name?: string;
    uploaded_at: string;
    verified_at?: string;
};

type TimelineItem = {
    id: number;
    source_type: "event" | "evidence";
    type: string;
    title: string;
    filename?: string | null;
    evidence_id?: number | null;
    verification_status?: string | null;
    verification_score?: number | null;
    timestamp: string;
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

type VerificationDetail = {
    decision: string;
    confidence: number;
    matched_indicators: string[];
    missing_items: string[];
    reasoning: string[];
    recommended_action: string;
    manager_approval_required: boolean;
};

type WorkbenchResponse = {
    member: TeamMember;
    tasks: GapTask[];
    summary: Summary;
};

type DashboardResponse = {
    tender?: {
        id: number;
        title?: string;
        client?: string;
        status?: string;
        readiness_score?: number;
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
    recent_evidence: TaskEvidence[];
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

const statusOptions = [
    { value: "OPEN", label: "مفتوحة" },
    { value: "IN_PROGRESS", label: "قيد التنفيذ" },
    { value: "WAITING_REVIEW", label: "بانتظار مراجعة" },
    { value: "WAITING_MANAGER_APPROVAL", label: "بانتظار اعتماد مدير المنافسة" },
    { value: "CLOSED", label: "مغلقة" },

    { value: "BLOCKED", label: "محجوبة" },
];

const allowedEvidenceExtensions = ".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg";

export default function EmployeeWorkbenchPage() {
    const searchParams = useSearchParams();

    const [team, setTeam] = useState<TeamMember[]>([]);
    const [selectedRole, setSelectedRole] = useState("technical_engineer");
    // TODO: Replace fallback "4" with a proper tender-selector UI once the workbench
    // supports multi-tender navigation. The ?tenderId= query param takes precedence.
    const [tenderId, setTenderId] = useState(searchParams.get("tenderId") || "4");

    const [workbench, setWorkbench] = useState<WorkbenchResponse | null>(null);
    const [allTenderTasks, setAllTenderTasks] = useState<GapTask[]>([]);
    const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
    const [managerReviewTasks, setManagerReviewTasks] = useState<GapTask[]>([]);

    const [evidenceByTask, setEvidenceByTask] = useState<Record<number, TaskEvidence[]>>({});
    const [timelineByTask, setTimelineByTask] = useState<Record<number, TimelineItem[]>>({});

    const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
    const [selectedFileNames, setSelectedFileNames] = useState<Record<number, string>>({});
    const [evidenceNotes, setEvidenceNotes] = useState<Record<number, string>>({});
    const [taskMessages, setTaskMessages] = useState<Record<number, string>>({});
    const [rejectionNotes, setRejectionNotes] = useState<Record<number, string>>({});
    const [verificationDetails, setVerificationDetails] = useState<Record<number, VerificationDetail>>({});
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [uploadingTaskId, setUploadingTaskId] = useState<number | null>(null);
    const [verifyingTaskId, setVerifyingTaskId] = useState<number | null>(null);
    const [message, setMessage] = useState("");
    const [completedTaskNotice, setCompletedTaskNotice] = useState<{
        taskId: number;
        title: string;
        status: string;
    } | null>(null);

    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
        const response = await fetch(url, {
            cache: "no-store",
            ...options,
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(body || response.statusText);
        }

        return response.json();
    }

    async function loadTeam() {
        const data = await fetchJson<{ team: TeamMember[] }>(`${API_BASE_URL}/gap-closure/team`);
        setTeam(data.team || []);
    }

    async function loadWorkbench(role = selectedRole) {
        const data = await fetchJson<WorkbenchResponse>(
            `${API_BASE_URL}/gap-closure/workbench/${role}`
        );
        setWorkbench(data);
        await loadEvidenceAndTimeline(data.tasks || []);
    }

    async function loadTenderTasks() {
        if (!tenderId.trim()) return;

        const data = await fetchJson<{ tasks: GapTask[] }>(
            `${API_BASE_URL}/gap-closure/tasks?tender_id=${encodeURIComponent(tenderId)}`
        );

        setAllTenderTasks(data.tasks || []);
    }

    async function loadDashboard() {
        if (!tenderId.trim()) return;

        const data = await fetchJson<DashboardResponse>(
            `${API_BASE_URL}/gap-closure/tenders/${encodeURIComponent(tenderId)}/dashboard`
        );

        setDashboard(data);
    }

    async function loadTaskEvidence(taskId: number) {
        const data = await fetchJson<{ evidence: TaskEvidence[] }>(
            `${API_BASE_URL}/gap-closure/tasks/${taskId}/evidence`
        );

        setEvidenceByTask((current) => ({
            ...current,
            [taskId]: data.evidence || [],
        }));

        return data.evidence || [];
    }

    async function loadTaskTimeline(taskId: number) {
        const data = await fetchJson<{ timeline: TimelineItem[] }>(
            `${API_BASE_URL}/gap-closure/tasks/${taskId}/timeline`
        );

        setTimelineByTask((current) => ({
            ...current,
            [taskId]: data.timeline || [],
        }));

        return data.timeline || [];
    }

    async function loadEvidenceAndTimeline(tasks: GapTask[]) {
        const visibleTasks = tasks.slice(0, 12);

        await Promise.allSettled(
            visibleTasks.flatMap((task) => [
                loadTaskEvidence(task.id),
                loadTaskTimeline(task.id),
            ])
        );
    }

    async function loadManagerReviewTasks(role: string) {
        if (!tenderId.trim() || role !== "tender_manager") {
            setManagerReviewTasks([]);
            return;
        }
        try {
            const data = await fetchJson<{ tasks: GapTask[] }>(
                `${API_BASE_URL}/gap-closure/tenders/${encodeURIComponent(tenderId)}/manager-review`
            );
            setManagerReviewTasks(data.tasks || []);
        } catch (error) {
            console.error(error);
        }
    }

    async function refreshAll(role = selectedRole) {
        setLoading(true);

        try {
            await Promise.all([loadWorkbench(role), loadTenderTasks(), loadDashboard(), loadManagerReviewTasks(role)]);
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحديث بيانات مساحة العمل. تأكد من تشغيل الخادم الخلفي.");
        } finally {
            setLoading(false);
        }
    }

    async function generateTasks() {
        if (!tenderId.trim()) {
            setMessage("اكتب رقم المنافسة أولًا.");
            return;
        }

        setLoading(true);
        setMessage("");

        try {
            const data = await fetchJson<{
                created_count: number;
                skipped_count: number;
            }>(`${API_BASE_URL}/gap-closure/tenders/${tenderId}/generate`, {
                method: "POST",
            });

            setMessage(
                `تم تحديث خطة إغلاق الفجوات: ${data.created_count} مهمة جديدة، و${data.skipped_count} مهمة قائمة أو مغطاة.`
            );

            await refreshAll(selectedRole);
        } catch (error) {
            console.error(error);
            setMessage("تعذر إنشاء مهام الفجوات. تأكد أن المنافسة تحتوي على متطلبات مستخرجة.");
        } finally {
            setLoading(false);
        }
    }

    async function resetScenario() {
        if (tenderId !== "4") {
            setMessage("عذراً، تهيئة سيناريو العرض متاحة فقط للمنافسة رقم 4.");
            return;
        }

        setLoading(true);
        setMessage("");

        try {
            const data = await fetchJson<{ message: string; reset_count: number }>(
                `${API_BASE_URL}/gap-closure/tenders/${tenderId}/reset-scenario`,
                { method: "POST" }
            );

            setMessage(data.message || "تمت إعادة تهيئة سيناريو العرض بنجاح");
            
            setActiveTaskId(null);
            setCompletedTaskNotice(null);
            
            await refreshAll(selectedRole);
        } catch (error) {
            console.error(error);
            setMessage("تعذر تهيئة سيناريو العرض.");
        } finally {
            setLoading(false);
        }
    }

    async function updateTaskStatus(taskId: number, status: string) {
        setTaskMessages((current) => ({
            ...current,
            [taskId]: "جاري تحديث حالة المهمة...",
        }));

        try {
            await fetchJson(`${API_BASE_URL}/gap-closure/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            setActiveTaskId(taskId);

            setTaskMessages((current) => ({
                ...current,
                [taskId]: "تم تحديث حالة المهمة.",
            }));

            await Promise.all([
                loadTaskTimeline(taskId),
                refreshAll(selectedRole),
            ]);
        } catch (error) {
            console.error(error);
            setTaskMessages((current) => ({
                ...current,
                [taskId]: "تعذر تحديث حالة المهمة.",
            }));
        }
    }

    function handleEvidenceFileChange(taskId: number, event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] || null;

        setSelectedFiles((current) => ({
            ...current,
            [taskId]: file,
        }));

        setSelectedFileNames((current) => ({
            ...current,
            [taskId]: file?.name || "",
        }));

        setTaskMessages((current) => ({
            ...current,
            [taskId]: file
                ? `تم اختيار الملف: ${file.name}. اضغط "رفع الدليل" لإرساله إلى سجل المهمة.`
                : "لم يتم اختيار ملف.",
        }));
    }

    function handleEvidenceNoteChange(taskId: number, value: string) {
        setEvidenceNotes((current) => ({
            ...current,
            [taskId]: value,
        }));
    }

    async function uploadEvidence(task: GapTask) {
        const selectedFile = selectedFiles[task.id];

        if (!selectedFile) {
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "اختر ملفًا أولًا قبل رفع الدليل.",
            }));
            return;
        }

        setUploadingTaskId(task.id);
        setTaskMessages((current) => ({
            ...current,
            [task.id]: "جاري رفع الدليل وربطه بسجل المهمة...",
        }));

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);
            formData.append("evidence_note", evidenceNotes[task.id] || "");
            formData.append("uploaded_by_role", selectedRole);

            const data = await fetchJson<{ message: string; evidence: TaskEvidence }>(
                `${API_BASE_URL}/gap-closure/tasks/${task.id}/evidence/upload`,
                {
                    method: "POST",
                    body: formData,
                }
            );

            setActiveTaskId(task.id);

            setTaskMessages((current) => ({
                ...current,
                [task.id]: data.message || "تم استلام الدليل وربطه بالمهمة.",
            }));

            setSelectedFiles((current) => ({
                ...current,
                [task.id]: null,
            }));

            setSelectedFileNames((current) => ({
                ...current,
                [task.id]: "",
            }));

            setEvidenceNotes((current) => ({
                ...current,
                [task.id]: "",
            }));

            const input = fileInputRefs.current[task.id];
            if (input) input.value = "";

            await Promise.all([
                loadTaskEvidence(task.id),
                loadTaskTimeline(task.id),
                refreshAll(selectedRole),
            ]);
        } catch (error) {
            console.error(error);
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "فشل رفع الدليل. راجع الخادم الخلفي أو صيغة الملف.",
            }));
        } finally {
            setUploadingTaskId(null);
        }
    }

    async function verifyTask(task: GapTask) {
        const evidence = evidenceByTask[task.id] || [];

        if (!evidence.length) {
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "لا يوجد دليل محفوظ لهذه المهمة. ارفع ملفًا أولًا.",
            }));
            return;
        }

        setVerifyingTaskId(task.id);
        setTaskMessages((current) => ({
            ...current,
            [task.id]: "جاري التحقق من آخر دليل محفوظ...",
        }));

        try {
            const data = await fetchJson<{ 
                message: string; 
                task?: GapTask;
                verification_detail?: VerificationDetail 
            }>(
                `${API_BASE_URL}/gap-closure/tasks/${task.id}/verify`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }
            );

            setTaskMessages((current) => ({
                ...current,
                [task.id]: data.message || "تم تشغيل التحقق.",
            }));

            if (data.task?.status === "CLOSED" || data.task?.status === "WAITING_MANAGER_APPROVAL") {
                setCompletedTaskNotice({
                    taskId: task.id,
                    title: task.title,
                    status: data.task.status,
                });
                setActiveTaskId(null);
            } else {
                setActiveTaskId(task.id);
            }

            if (data.verification_detail) {
                setVerificationDetails((current) => ({
                    ...current,
                    [task.id]: data.verification_detail!,
                }));
            }

            await Promise.all([
                loadTaskEvidence(task.id),
                loadTaskTimeline(task.id),
                refreshAll(selectedRole),
            ]);
        } catch (error) {
            console.error(error);
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "تعذر تشغيل التحقق. تأكد من وجود دليل محفوظ.",
            }));
        } finally {
            setVerifyingTaskId(null);
        }
    }

    async function approveTask(task: GapTask) {
        setTaskMessages((current) => ({
            ...current,
            [task.id]: "جاري اعتماد الدليل وإغلاق الفجوة...",
        }));

        try {
            const data = await fetchJson<{ message: string; task?: GapTask }>(`${API_BASE_URL}/gap-closure/tasks/${task.id}/manager-approve`, {
                method: "POST",
            });
            if (data.task?.status === "CLOSED") {
                setCompletedTaskNotice({
                    taskId: task.id,
                    title: task.title,
                    status: "CLOSED",
                });
                setActiveTaskId(null);
            } else {
                setActiveTaskId(task.id);
            }
            await refreshAll(selectedRole);
        } catch (error) {
            console.error(error);
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "تعذر الاعتماد.",
            }));
        }
    }

    async function rejectTask(task: GapTask) {
        const note = rejectionNotes[task.id] || "";
        if (!note.trim()) {
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "الرجاء إدخال ملاحظة الإرجاع أولًا.",
            }));
            return;
        }

        setTaskMessages((current) => ({
            ...current,
            [task.id]: "جاري إرجاع المهمة...",
        }));

        try {
            await fetchJson(`${API_BASE_URL}/gap-closure/tasks/${task.id}/manager-reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rejection_note: note }),
            });
            setActiveTaskId(task.id);
            await refreshAll(selectedRole);
        } catch (error) {
            console.error(error);
            setTaskMessages((current) => ({
                ...current,
                [task.id]: "تعذر الإرجاع.",
            }));
        }
    }

    useEffect(() => {
        loadTeam()
            .then(() => refreshAll(selectedRole))
            .catch((error) => {
                console.error(error);
                setMessage("تعذر تحميل بيانات فريق العمل.");
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        refreshAll(selectedRole);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRole]);

    const selectedMember = useMemo(() => {
        return team.find((member) => member.role === selectedRole) || null;
    }, [team, selectedRole]);

    // Derive per-role task metrics client-side from allTenderTasks — no extra API call needed.
    const roleMetrics = useMemo(() => {
        return team.map((member) => {
            const tasks = allTenderTasks.filter((t) => t.owner_role === member.role);
            const open = tasks.filter(
                (t) => t.status === "OPEN" || t.status === "IN_PROGRESS"
            ).length;
            const waiting_review = tasks.filter(
                (t) => t.status === "WAITING_REVIEW"
            ).length;
            const waiting_manager = tasks.filter(
                (t) => t.status === "WAITING_MANAGER_APPROVAL"
            ).length;
            const closed = tasks.filter((t) => t.status === "CLOSED").length;
            const high_priority_open = tasks.filter(
                (t) => t.priority === "\u0639\u0627\u0644\u064a\u0629" && t.status !== "CLOSED"
            ).length;
            return {
                member,
                total: tasks.length,
                open,
                waiting_review,
                waiting_manager,
                closed,
                high_priority_open,
            };
        });
    }, [team, allTenderTasks]);

    const sortedTasks = useMemo(() => {
        if (!workbench?.tasks) return [];
        let list = [...workbench.tasks].sort(sortTasksOperationally);
        if (activeTaskId) {
            const activeIdx = list.findIndex((t) => t.id === activeTaskId);
            if (activeIdx > -1) {
                const [activeTask] = list.splice(activeIdx, 1);
                list.unshift(activeTask);
            }
        }
        return list;
    }, [workbench?.tasks, activeTaskId]);

    const summary = dashboard?.summary || workbench?.summary;

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div>
                    <span style={pillStyle}>مركز قيادة إغلاق الفجوات</span>
                    <h1 style={titleStyle}>مساحة عمل إغلاق الفجوات</h1>
                    <p style={subtitleStyle}>
                        مركز تشغيلي لإسناد فجوات المنافسة إلى الفريق المختص، واستلام الأدلة،
                        والتحقق منها، وتحديث جاهزية التقديم بناءً على سجل موثق قابل للمراجعة.
                    </p>
                </div>

                <div style={heroActionsStyle}>
                    <Link href="/tenders" style={secondaryButtonStyle}>
                        العودة للمناقصات
                    </Link>
                    <Link href={`/tenders/${tenderId}/executive`} style={primaryButtonStyle}>
                        لوحة القرار التنفيذية
                    </Link>
                </div>
            </section>

            {message ? <div style={messageStyle}>{message}</div> : null}

            <section style={controlPanelStyle}>
                <div style={fieldStyle}>
                    <label style={labelStyle}>رقم المنافسة</label>
                    <input
                        value={tenderId}
                        onChange={(event) => setTenderId(event.target.value)}
                        style={inputStyle}
                        placeholder="مثال: 4"
                    />
                </div>

                <div style={fieldStyle}>
                    <label style={labelStyle}>الموظف / الدور</label>
                    <select
                        value={selectedRole}
                        onChange={(event) => setSelectedRole(event.target.value)}
                        style={inputStyle}
                    >
                        {team.map((member) => (
                            <option key={member.role} value={member.role}>
                                {member.title} — {member.name}
                            </option>
                        ))}
                    </select>
                </div>

                <button onClick={generateTasks} disabled={loading} style={primaryButtonStyle}>
                    {loading ? "جاري المعالجة..." : "توليد مهام الفجوات"}
                </button>

                <button onClick={() => refreshAll(selectedRole)} disabled={loading} style={secondaryButtonStyle}>
                    تحديث البيانات
                </button>

                {tenderId === "4" && searchParams.get("internalTools") === "1" && (
                    <button onClick={resetScenario} disabled={loading} style={{ ...secondaryButtonStyle, borderColor: "#6366f1", color: "#4f46e5", background: "#e0e7ff" }}>
                        تهيئة سيناريو العرض
                    </button>
                )}
            </section>

            {/* ===== ROLE COMMAND CENTER ===== */}
            {roleMetrics.length > 0 && (
                <section style={commandCenterWrapperStyle}>
                    <div style={commandCenterHeaderStyle}>
                        <div>
                            <span style={pillStyle}>مركز قيادة الأدوار</span>
                            <h2 style={commandCenterTitleStyle}>مركز قيادة الأدوار</h2>
                            <p style={sectionSubtitleStyle}>
                                انقر على بطاقة الدور لعرض مهامه ومتابعة الأدلة والاعتمادات.
                            </p>
                        </div>
                    </div>

                    <div style={roleCardsScrollStyle}>
                        {roleMetrics.map(({ member, total, open, waiting_review, waiting_manager, closed, high_priority_open }) => {
                            const isSelected = member.role === selectedRole;
                            const isTenderManager = member.role === "tender_manager";
                            const hasManagerQueue = isTenderManager && waiting_manager > 0;

                            return (
                                <article
                                    key={member.role}
                                    onClick={() => setSelectedRole(member.role)}
                                    style={roleCardStyle(isSelected, hasManagerQueue)}
                                    title={`اختر دور: ${member.title}`}
                                >
                                    <div style={roleCardTopStyle}>
                                        <div style={{ ...roleTitleStyle, color: isSelected ? "rgba(255,255,255,0.7)" : "#94a3b8" }}>{member.title}</div>
                                        {isSelected && (
                                            <span style={selectedBadgeStyle}>محدد</span>
                                        )}
                                    </div>

                                    <div style={roleCardNameStyle}>{member.name}</div>
                                    <div style={{ ...roleCardDeptStyle, color: isSelected ? "rgba(255,255,255,0.6)" : "#64748b" }}>{member.department}</div>

                                    <div style={{ ...roleCardDividerStyle, borderColor: isSelected ? "rgba(255,255,255,0.1)" : "#e2e8f0" }} />

                                    <div style={roleCardMetricsStyle}>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>الإجمالي</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : "#0f172a" }}>{total}</strong>
                                        </div>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>مهام مفتوحة</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : (open > 0 ? "#2563eb" : "#94a3b8") }}>{open}</strong>
                                        </div>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>بانتظار مراجعة</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : (waiting_review > 0 ? "#d97706" : "#94a3b8") }}>{waiting_review}</strong>
                                        </div>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>بانتظار اعتماد مدير المنافسة</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : (waiting_manager > 0 ? "#dc2626" : "#94a3b8") }}>{waiting_manager}</strong>
                                        </div>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>مغلقة</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : (closed > 0 ? "#16a34a" : "#94a3b8") }}>{closed}</strong>
                                        </div>
                                        <div style={roleMetricItemStyle}>
                                            <span style={{ ...roleMetricLabelStyle, color: isSelected ? "rgba(255,255,255,0.5)" : "#64748b" }}>فجوات عالية مفتوحة</span>
                                            <strong style={{ ...roleMetricValueStyle, color: isSelected ? "white" : (high_priority_open > 0 ? "#dc2626" : "#94a3b8") }}>{high_priority_open}</strong>
                                        </div>
                                    </div>

                                    {hasManagerQueue && (
                                        <div style={managerQueueBadgeStyle}>
                                            ⚑ طابور اعتماد: {waiting_manager} مهمة بانتظار القرار
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}
            {/* ===== END ROLE COMMAND CENTER ===== */}

            <section style={dashboardStyle}>
                <div>
                    <span style={pillStyle}>لوحة تحكم الإغلاق</span>
                    <h2 style={sectionTitleStyle}>
                        {dashboard?.tender?.title || "مؤشرات إغلاق الفجوات"}
                    </h2>
                    <p style={sectionSubtitleStyle}>
                        {dashboard?.tender?.client
                            ? `الجهة: ${dashboard.tender.client}`
                            : "تعرض هذه اللوحة حالة الأدلة، توزيع المهام، ونسبة الإغلاق الحالية."}
                    </p>
                </div>

                {summary ? (
                    <div style={decisionBoxStyle(summary.decision)}>
                        <span>قرار الجاهزية</span>
                        <strong>{summary.decision}</strong>
                        <small>{summary.recommendation}</small>
                    </div>
                ) : null}
            </section>

            {summary ? (
                <section style={metricsGridStyle}>
                    <MetricCard title="إجمالي المهام" value={`${summary.total}`} />
                    <MetricCard title="مفتوحة" value={`${summary.open}`} />
                    <MetricCard title="بانتظار مراجعة" value={`${summary.waiting_review}`} />
                    <MetricCard title="مغلقة" value={`${summary.closed}`} />
                    <MetricCard title="فجوات عالية مفتوحة" value={`${summary.high_priority_open}`} />
                    <MetricCard title="درجة الإغلاق" value={`${summary.closure_score}%`} />
                </section>
            ) : null}

            <section style={insightsGridStyle}>
                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>الفجوات الحرجة</span>
                        <h2 style={sectionTitleStyle}>الفجوات الحرجة</h2>
                        <p style={sectionSubtitleStyle}>أعلى الفجوات المفتوحة تأثيرًا على قرار التقديم.</p>
                    </div>
                    {allTenderTasks.filter((task) => task.status !== "CLOSED" && task.priority === "عالية").length ? (
                        <div style={taskListStyle}>
                            {allTenderTasks
                                .filter((task) => task.status !== "CLOSED" && task.priority === "عالية")
                                .sort(sortTasksOperationally)
                                .slice(0, 5)
                                .map((task) => (
                                    <article key={task.id} style={criticalTaskStyle}>
                                        <strong>{task.title}</strong>
                                        <span>{task.owner_name}</span>
                                        <small>{translateStatus(task.status)} — أثر {task.impact_score}%</small>
                                    </article>
                                ))}
                        </div>
                    ) : (
                        <div style={emptyStyle}>لا توجد فجوات عالية مفتوحة حاليًا.</div>
                    )}
                </section>

                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>الإجراءات التالية المقترحة</span>
                        <h2 style={sectionTitleStyle}>الإجراءات ذات الأولوية</h2>
                        <p style={sectionSubtitleStyle}>توصيات تشغيلية بناءً على حالة المهام والأدلة.</p>
                    </div>
                    <div style={taskListStyle}>
                        <div style={actionItemStyle}>
                            <span>1</span>
                            <strong>{summary?.high_priority_open ? `إغلاق ${summary.high_priority_open} فجوة عالية التأثير قبل اعتماد قرار التقديم.` : "استكمال المراجعة النهائية للأدلة المقبولة."}</strong>
                        </div>
                        <div style={actionItemStyle}>
                            <span>2</span>
                            <strong>{summary?.waiting_review ? `مراجعة ${summary.waiting_review} دليل بانتظار التحقق.` : "تجهيز مذكرة القرار التنفيذية للعرض."}</strong>
                        </div>
                    </div>
                </section>

                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>خزنة الأدلة</span>
                        <h2 style={sectionTitleStyle}>آخر الأدلة المحفوظة</h2>
                    </div>
                    {dashboard?.recent_evidence?.length ? (
                        <div style={taskListStyle}>
                            {dashboard.recent_evidence.slice(0, 5).map((evidence) => (
                                <article key={evidence.id} style={miniTaskStyle}>
                                    <strong>{evidence.original_filename}</strong>
                                    <span>{translateVerification(evidence.verification_status)}</span>
                                    <small>{formatBytes(evidence.file_size)} — {formatDate(evidence.uploaded_at)}</small>
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
                        <div style={emptyStyle}>لا توجد أدلة محفوظة حتى الآن.</div>
                    )}
                </section>
            </section>

            <section style={memberPanelStyle}>
                <div>
                    <span style={pillStyle}>مساحة عمل الموظف</span>
                    <h2 style={sectionTitleStyle}>
                        {selectedMember?.title || workbench?.member?.title || "مساحة الموظف"}
                    </h2>
                    <p style={sectionSubtitleStyle}>
                        {selectedMember?.department || workbench?.member?.department || "قسم غير محدد"}
                    </p>
                </div>
            </section>

            {selectedRole === "tender_manager" && managerReviewTasks.length > 0 ? (
                <section style={{ ...cardStyle, marginBottom: "18px" }}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>طابور اعتماد المدير</span>
                        <h2 style={sectionTitleStyle}>طابور اعتماد مدير المنافسة</h2>
                        <p style={sectionSubtitleStyle}>
                            الفجوات الحرجة التي تم إرفاق أدلة مقبولة لها وبانتظار الاعتماد النهائي للإغلاق.
                        </p>
                    </div>
                    <div style={taskListStyle}>
                        {managerReviewTasks.map((task) => (
                            <article key={task.id} style={taskCardStyle(false)}>
                                <div style={taskHeaderStyle}>
                                    <div>
                                        <span style={taskIdStyle}>مهمة رقم {task.id}</span>
                                        <h3 style={taskTitleStyle}>{task.title}</h3>
                                    </div>
                                    <div style={priorityStyle(task.priority)}>{task.priority}</div>
                                </div>
                                <p style={taskDescriptionStyle}>{task.description}</p>
                                <div style={taskMetaGridStyle}>
                                    <Info label="المسؤول" value={task.owner_name} />
                                    <Info label="القسم" value={task.owner_department} />
                                    <Info label="الحالة" value={translateStatus(task.status)} />
                                </div>
                                <div style={uploadBoxStyle}>
                                    <textarea
                                        value={rejectionNotes[task.id] || ""}
                                        onChange={(e) => setRejectionNotes(curr => ({ ...curr, [task.id]: e.target.value }))}
                                        placeholder="ملاحظة الإرجاع (مطلوبة للرفض)..."
                                        style={textareaStyle}
                                    />
                                    {taskMessages[task.id] ? <div style={taskMessageStyle}>{taskMessages[task.id]}</div> : null}
                                    <div style={taskActionsStyle}>
                                        <button onClick={() => approveTask(task)} style={primaryButtonStyle}>
                                            اعتماد الدليل وإغلاق الفجوة
                                        </button>
                                        <button onClick={() => rejectTask(task)} style={secondaryButtonStyle}>
                                            إرجاع الدليل للمالك المسؤول
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            <section style={twoColumnsStyle}>
                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>لوحة مهام المنافسة</span>
                        <h2 style={sectionTitleStyle}>لوحة مهام المنافسة</h2>
                        <p style={sectionSubtitleStyle}>
                            عرض تشغيلي لكل المهام المرتبطة بالمنافسة حسب الحالة والمالك.
                        </p>
                    </div>

                    {allTenderTasks.length ? (
                        <div style={boardStyle}>
                            {statusOptions.map((column) => {
                                const columnTasks = allTenderTasks.filter((task) => task.status === column.value).sort(sortTasksOperationally);

                                return (
                                    <div key={column.value} style={boardColumnStyle}>
                                        <div style={boardColumnHeaderStyle}>
                                            <strong>{column.label}</strong>
                                            <span>{columnTasks.length}</span>
                                        </div>

                                        {columnTasks.map((task) => (
                                            <article key={task.id} style={miniTaskStyle}>
                                                <strong>{task.title}</strong>
                                                <span>{task.owner_name}</span>
                                                <small>
                                                    {task.priority} — أثر {task.impact_score}%
                                                </small>
                                            </article>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={emptyStyle}>لا توجد مهام منافسة حتى الآن.</div>
                    )}
                </section>

                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>مهامي</span>
                        <h2 style={sectionTitleStyle}>مهامي</h2>
                        <p style={sectionSubtitleStyle}>
                            المهام المسندة للدور المختار، مع سجل الأدلة والتحقق لكل مهمة.
                        </p>
                    </div>

                    {completedTaskNotice && (
                        <div style={completionNoticeStyle}>
                            <div style={completionNoticeTitleStyle}>
                                <span style={{ fontSize: "24px" }}>✅</span>
                                {completedTaskNotice.status === "CLOSED" 
                                    ? "تم إغلاق الفجوة بنجاح" 
                                    : "تم إرسال الدليل لاعتماد الإدارة"}
                            </div>
                            <p style={{ margin: 0, color: "#166534", fontWeight: 800 }}>
                                المهمة: {completedTaskNotice.title} (ID: #{completedTaskNotice.taskId})
                            </p>
                            <p style={{ margin: 0, color: "#475569", fontSize: "14px" }}>
                                {completedTaskNotice.status === "CLOSED"
                                    ? "يمكنك الآن الانتقال إلى المهمة التالية أو مراجعة لوحة القرار التنفيذية."
                                    : "تم قبول الدليل وإرساله إلى اعتماد مدير المنافسة للمراجعة النهائية."}
                            </p>
                            <div style={completionNoticeActionsStyle}>
                                <button 
                                    onClick={() => setCompletedTaskNotice(null)}
                                    style={secondaryButtonStyle}
                                >
                                    اختيار المهمة التالية
                                </button>
                                
                                {completedTaskNotice.status === "CLOSED" ? (
                                    <Link 
                                        href={`/tenders/${tenderId}/executive`}
                                        style={{ ...primaryButtonStyle, textDecoration: "none", textAlign: "center" }}
                                    >
                                        فتح لوحة القرار التنفيذية
                                    </Link>
                                ) : (
                                    <button 
                                        onClick={() => {
                                            setSelectedRole("tender_manager");
                                            setCompletedTaskNotice(null);
                                        }}
                                        style={primaryButtonStyle}
                                    >
                                        اختيار مدير المنافسة
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {loading ? <div style={emptyStyle}>جاري تحميل المهام...</div> : null}

                    {!loading && workbench?.tasks?.length ? (
                        <div style={taskListStyle}>
                            {sortedTasks.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    isActive={task.id === activeTaskId}
                                    selectedFileName={selectedFileNames[task.id] || ""}
                                    selectedFile={selectedFiles[task.id] || null}
                                    evidenceNote={evidenceNotes[task.id] || ""}
                                    taskMessage={taskMessages[task.id] || ""}
                                    verificationDetail={verificationDetails[task.id]}
                                    evidence={evidenceByTask[task.id] || []}
                                    timeline={timelineByTask[task.id] || []}
                                    uploading={uploadingTaskId === task.id}
                                    verifying={verifyingTaskId === task.id}
                                    fileInputRef={(element) => {
                                        fileInputRefs.current[task.id] = element;
                                    }}
                                    onFileChange={handleEvidenceFileChange}
                                    onNoteChange={handleEvidenceNoteChange}
                                    onStatusChange={updateTaskStatus}
                                    onUploadEvidence={uploadEvidence}
                                    onVerify={verifyTask}
                                />
                            ))}
                        </div>
                    ) : null}

                    {!loading && !workbench?.tasks?.length ? (
                        <div style={emptyStyle}>
                            لا توجد مهام لهذا الدور. شغّل توليد مهام الفجوات للمنافسة الحالية.
                        </div>
                    ) : null}
                </section>
            </section>

            <section style={twoColumnsStyle}>
                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>توزيع العمل</span>
                        <h2 style={sectionTitleStyle}>توزيع المسؤوليات</h2>
                    </div>

                    {dashboard?.owners?.length ? (
                        <div style={taskListStyle}>
                            {dashboard.owners.map((owner) => (
                                <article key={owner.owner_role} style={miniTaskStyle}>
                                    <strong>{owner.owner_name}</strong>
                                    <span>{owner.owner_department}</span>
                                    <small>
                                        إجمالي: {owner.total} — مغلقة: {owner.closed || 0} — مفتوحة: {owner.open_count || 0}
                                    </small>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div style={emptyStyle}>لا توجد بيانات توزيع بعد.</div>
                    )}
                </section>

                <section style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                        <span style={pillStyle}>سجل النشاط</span>
                        <h2 style={sectionTitleStyle}>آخر نشاط تشغيلي</h2>
                    </div>

                    {dashboard?.recent_events?.length ? (
                        <div style={timelineListStyle}>
                            {dashboard.recent_events.slice(0, 8).map((event) => (
                                <div key={event.id} style={timelineItemStyle}>
                                    <strong>{event.message}</strong>
                                    <small>
                                        {event.owner_name} — {formatDate(event.created_at)}
                                    </small>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={emptyStyle}>لا يوجد نشاط مسجل بعد.</div>
                    )}
                </section>
            </section>
        </main>
    );
}

function MetricCard({ title, value }: { title: string; value: string }) {
    return (
        <div style={metricCardStyle}>
            <span style={smallLabelStyle}>{title}</span>
            <strong>{value}</strong>
        </div>
    );
}

function TaskCard({
    task,
    selectedFileName,
    selectedFile,
    evidenceNote,
    taskMessage,
    verificationDetail,
    evidence,
    timeline,
    uploading,
    verifying,
    fileInputRef,
    onFileChange,
    onNoteChange,
    onStatusChange,
    onUploadEvidence,
    onVerify,
    isActive,
}: {
    task: GapTask;
    selectedFileName: string;
    selectedFile: File | null;
    evidenceNote: string;
    taskMessage: string;
    verificationDetail?: VerificationDetail;
    evidence: TaskEvidence[];
    timeline: TimelineItem[];
    uploading: boolean;
    verifying: boolean;
    fileInputRef: (element: HTMLInputElement | null) => void;
    onFileChange: (taskId: number, event: ChangeEvent<HTMLInputElement>) => void;
    onNoteChange: (taskId: number, value: string) => void;
    onStatusChange: (taskId: number, status: string) => void;
    onUploadEvidence: (task: GapTask) => void;
    onVerify: (task: GapTask) => void;
    isActive?: boolean;
}) {
    const latestEvidence = evidence[0];
    const isClosed = task.status === "CLOSED";
    const canUpload = Boolean(selectedFile) && !uploading && !isClosed;
    const canVerify = Boolean(latestEvidence) && !verifying && !isClosed;

    return (
        <article style={taskCardStyle(isClosed, isActive)}>
            {isActive && (
                <div style={activeTaskBadgeStyle}>المهمة النشطة</div>
            )}
            <div style={taskHeaderStyle}>
                <div>
                    <span style={taskIdStyle}>مهمة رقم {task.id}</span>
                    <h3 style={taskTitleStyle}>{task.title}</h3>
                </div>

                <div style={priorityStyle(task.priority)}>{task.priority}</div>
            </div>

            <p style={taskDescriptionStyle}>{task.description}</p>

            <div style={taskMetaGridStyle}>
                <Info label="المسؤول" value={task.owner_name} />
                <Info label="القسم" value={task.owner_department} />
                <Info label="نوع الدليل" value={task.evidence_type} />
                <Info label="الأثر" value={`${task.impact_score}%`} />
                <Info label="الحالة" value={translateStatus(task.status)} />
                <Info label="التحقق" value={translateVerification(task.verification_status)} />
            </div>

            <div style={instructionStyle}>
                <strong>الدليل المطلوب:</strong>
                <span>{task.evidence_instruction}</span>
            </div>

            {isClosed ? (
                <div style={closedNoticeStyle}>
                    تم إغلاق هذه الفجوة بدليل مقبول ومربوط بسجل المهمة.
                </div>
            ) : (
                <div style={uploadBoxStyle}>
                    <label style={uploadLabelStyle}>رفع دليل فعلي</label>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={allowedEvidenceExtensions}
                        onChange={(event) => onFileChange(task.id, event)}
                        style={fileInputStyle}
                    />

                    <textarea
                        value={evidenceNote}
                        onChange={(event) => onNoteChange(task.id, event.target.value)}
                        placeholder="ملاحظة اختيارية عن الدليل المرفوع..."
                        style={textareaStyle}
                    />

                    <div style={selectedFileStyle}>
                        {selectedFileName
                            ? `ملف جاهز للرفع: ${selectedFileName}`
                            : latestEvidence
                                ? `آخر دليل محفوظ: ${latestEvidence.original_filename}`
                                : "لا يوجد ملف محدد للرفع حاليًا"}
                    </div>

                    {latestEvidence ? (
                        <div style={savedEvidenceStyle}>
                            <strong>آخر دليل محفوظ في السجل</strong>
                            <span>{latestEvidence.original_filename}</span>
                            <small>
                                الحالة: {translateVerification(latestEvidence.verification_status)} — الحجم:{" "}
                                {formatBytes(latestEvidence.file_size)}
                            </small>
                            <a
                                href={`${API_BASE_URL}/gap-closure/evidence/${latestEvidence.id}/download`}
                                target="_blank"
                                rel="noreferrer"
                                style={downloadLinkStyle}
                            >
                                فتح / تحميل الدليل
                            </a>
                        </div>
                    ) : (
                        <div style={uploadHintStyle}>
                            اختر ملفًا ثم اضغط رفع الدليل ليتم حفظه وربطه بسجل المهمة.
                        </div>
                    )}
                </div>
            )}

            {task.verification_notes ? (
                <div style={verificationNotesStyle}>{task.verification_notes}</div>
            ) : null}

            {taskMessage ? <div style={taskMessageStyle}>{taskMessage}</div> : null}

            {verificationDetail ? (
                <div style={verificationDetailStyle}>
                    <div style={{ marginBottom: "10px" }}>
                        <span style={pillStyle}>تفاصيل التحقق من الدليل</span>
                        <strong style={{ display: "block", fontSize: "16px", marginBottom: "4px" }}>
                            قرار التحقق: {verificationDetail.decision}
                        </strong>
                        <span style={{ fontSize: "14px", color: "#475569" }}>
                            درجة الثقة: {verificationDetail.confidence}%
                        </span>
                    </div>

                    {verificationDetail.matched_indicators.length > 0 && (
                        <div style={detailBlockStyle}>
                            <small style={detailLabelStyle}>المؤشرات المطابقة:</small>
                            <ul style={detailListStyle}>
                                {verificationDetail.matched_indicators.map((t) => (
                                    <li key={t}>{t}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {verificationDetail.missing_items.length > 0 && (
                        <div style={detailBlockStyle}>
                            <small style={detailLabelStyle}>النواقص:</small>
                            <ul style={detailListStyle}>
                                {verificationDetail.missing_items.map((t) => (
                                    <li key={t}>{t}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div style={detailBlockStyle}>
                        <small style={detailLabelStyle}>سبب القرار:</small>
                        <ul style={detailListStyle}>
                            {verificationDetail.reasoning.map((t) => (
                                <li key={t}>{t}</li>
                            ))}
                        </ul>
                    </div>

                    <div style={detailBlockStyle}>
                        <small style={detailLabelStyle}>الإجراء التصحيحي المقترح:</small>
                        <p style={detailParagraphStyle}>{verificationDetail.recommended_action}</p>
                    </div>

                    <div style={detailBlockStyle}>
                        <small style={detailLabelStyle}>هل يتطلب اعتماد مدير المنافسة؟</small>
                        {verificationDetail.manager_approval_required ? (
                            <div style={managerRequiredBadgeStyle}>نعم - تم التحويل لطابور الاعتماد</div>
                        ) : (
                            <div style={noManagerBadgeStyle}>لا</div>
                        )}
                    </div>
                </div>
            ) : null}

            <div style={taskActionsStyle}>
                {!isClosed ? (
                    <>
                        <button
                            onClick={() => onStatusChange(task.id, "IN_PROGRESS")}
                            style={secondaryButtonStyle}
                            type="button"
                        >
                            بدء التنفيذ
                        </button>

                        <button
                            onClick={() => onUploadEvidence(task)}
                            style={canUpload ? primaryButtonStyle : disabledButtonStyle}
                            disabled={!canUpload}
                            type="button"
                        >
                            {uploading ? "جاري الرفع..." : "رفع الدليل"}
                        </button>

                        <button
                            onClick={() => onVerify(task)}
                            style={canVerify ? primaryButtonStyle : disabledButtonStyle}
                            disabled={!canVerify}
                            type="button"
                        >
                            {verifying ? "جاري التحقق..." : "تشغيل التحقق"}
                        </button>
                    </>
                ) : null}
            </div>

            <Timeline timeline={timeline} />
        </article>
    );
}

function Timeline({ timeline }: { timeline: TimelineItem[] }) {
    if (!timeline.length) {
        return null;
    }

    return (
        <div style={timelineBoxStyle}>
            <strong style={timelineTitleStyle}>سجل المهمة</strong>

            <div style={timelineListStyle}>
                {timeline.map((item) => (
                    <div key={`${item.source_type}-${item.id}`} style={timelineItemStyle}>
                        <strong>{item.filename || translateEvent(item.type)}</strong>
                        <span>{item.title}</span>
                        {item.verification_score ? <small>درجة التحقق: {item.verification_score}%</small> : null}
                        <small>{formatDate(item.timestamp)}</small>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div style={infoStyle}>
            <span>{label}</span>
            <strong>{value || "غير محدد"}</strong>
        </div>
    );
}

function sortTasksOperationally(a: GapTask, b: GapTask) {
    const statusOrder: Record<string, number> = {
        OPEN: 1,
        IN_PROGRESS: 2,
        WAITING_REVIEW: 3,
        BLOCKED: 4,
        CLOSED: 5,
    };

    const priorityOrder: Record<string, number> = {
        عالية: 1,
        متوسطة: 2,
        منخفضة: 3,
    };

    const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    if (priorityDiff !== 0) return priorityDiff;

    return Number(b.impact_score || 0) - Number(a.impact_score || 0);
}

function translateStatus(status: string) {
    const map: Record<string, string> = {
        OPEN: "مفتوحة",
        IN_PROGRESS: "قيد التنفيذ",
        WAITING_REVIEW: "بانتظار مراجعة",
        WAITING_MANAGER_APPROVAL: "بانتظار اعتماد مدير المنافسة",
        CLOSED: "مغلقة",
        BLOCKED: "محجوبة",
    };

    return map[status] || status;
}

function translateVerification(status: string) {
    const map: Record<string, string> = {
        NOT_SUBMITTED: "لم يرفع دليل",
        SUBMITTED: "دليل محفوظ",
        MANAGER_REVIEW: "تحت مراجعة المدير",
        ACCEPTED: "مقبول",
        REJECTED: "مرفوض",
        NEEDS_REVIEW: "يحتاج مراجعة",
        NOT_VERIFIED: "لم يتحقق بعد",
    };

    return map[status] || status;
}

function translateEvent(type: string) {
    const map: Record<string, string> = {
        TASK_CREATED: "إنشاء مهمة",
        TASK_UPDATED: "تحديث مهمة",
        EVIDENCE_UPLOADED: "رفع دليل",
        TASK_VERIFIED: "تحقق",
        EVIDENCE_RECORD: "سجل دليل",
        MANAGER_APPROVED: "اعتماد المدير",
        MANAGER_REJECTED: "إرجاع المدير",
    };

    return map[type] || type;
}

function formatBytes(bytes: number) {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string) {
    if (!value) return "غير محدد";
    return value.replace("T", " ").replace("Z", "");
}

function priorityStyle(priority: string): CSSProperties {
    const color =
        priority === "عالية" ? "#dc2626" : priority === "متوسطة" ? "#f59e0b" : "#16a34a";

    return {
        padding: "7px 11px",
        borderRadius: "999px",
        border: `1px solid ${color}44`,
        background: `${color}14`,
        color,
        fontSize: "12px",
        fontWeight: 950,
    };
}

function decisionBoxStyle(decision: string): CSSProperties {
    const color =
        decision === "جاهز للتقديم"
            ? "#16a34a"
            : decision === "دخول مشروط"
                ? "#f59e0b"
                : "#2563eb";

    return {
        minWidth: "280px",
        padding: "16px",
        borderRadius: "20px",
        border: `1px solid ${color}44`,
        background: `${color}12`,
        color,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
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
    maxWidth: "880px",
};

const controlPanelStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "180px 1fr auto auto",
    gap: "12px",
    alignItems: "end",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "22px",
    padding: "18px",
    marginBottom: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const fieldStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
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
    border: "1px solid #cbd5e1",
    borderRadius: "15px",
    padding: "13px 14px",
    outline: "none",
    minHeight: "70px",
    resize: "vertical",
    fontWeight: 800,
    background: "white",
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

const disabledButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    padding: "13px 18px",
    background: "#f1f5f9",
    color: "#94a3b8",
    fontWeight: 900,
    cursor: "not-allowed",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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
    background: "#fffbeb",
    color: "#92400e",
    border: "1px solid #fde68a",
    fontWeight: 850,
    marginBottom: "18px",
};

const dashboardStyle: CSSProperties = {
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

const memberPanelStyle: CSSProperties = {
    padding: "22px",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    marginBottom: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
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

const smallLabelStyle: CSSProperties = {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 900,
};

const insightsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "18px",
    marginBottom: "18px",
};

const twoColumnsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "0.8fr 1.2fr",
    gap: "18px",
    marginBottom: "18px",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "22px",
    boxShadow: "0 16px 38px rgba(15,23,42,0.055)",
};

const sectionHeaderStyle: CSSProperties = {
    marginBottom: "16px",
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

const taskListStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};

function taskCardStyle(isClosed: boolean, isActive?: boolean): CSSProperties {
    return {
        border: isActive ? "2px solid #2563eb" : (isClosed ? "1px solid #bbf7d0" : "1px solid #e2e8f0"),
        background: isClosed ? "#f0fdf4" : "#f8fafc",
        borderRadius: "20px",
        padding: "18px",
        opacity: isClosed ? 0.9 : 1,
        boxShadow: isActive ? "0 12px 28px rgba(37,99,235,0.12)" : "none",
        position: "relative",
    };
}

const taskHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    marginBottom: "10px",
};

const taskIdStyle: CSSProperties = {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#e0f2fe",
    color: "#075985",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "8px",
};

const taskTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "18px",
    lineHeight: 1.6,
};

const taskDescriptionStyle: CSSProperties = {
    color: "#475569",
    lineHeight: 1.8,
    margin: "0 0 14px",
};

const taskMetaGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
};

const infoStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "11px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
};

const instructionStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#78350f",
    borderRadius: "15px",
    padding: "13px",
    lineHeight: 1.7,
    marginBottom: "12px",
};

const uploadBoxStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "13px",
    borderRadius: "16px",
    border: "1px dashed #cbd5e1",
    background: "white",
    marginBottom: "12px",
};

const uploadLabelStyle: CSSProperties = {
    fontWeight: 950,
    color: "#0f172a",
};

const fileInputStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
    padding: "12px",
    background: "#f8fafc",
    fontWeight: 900,
};

const selectedFileStyle: CSSProperties = {
    borderRadius: "12px",
    background: "#f8fafc",
    padding: "10px",
    color: "#475569",
    fontWeight: 900,
};

const uploadHintStyle: CSSProperties = {
    borderRadius: "12px",
    background: "#ecfdf5",
    color: "#166534",
    padding: "10px",
    border: "1px solid #bbf7d0",
    fontWeight: 900,
    lineHeight: 1.7,
};

const savedEvidenceStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    borderRadius: "14px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "12px",
    lineHeight: 1.7,
};

const downloadLinkStyle: CSSProperties = {
    color: "#075985",
    fontWeight: 950,
    textDecoration: "none",
};

const closedNoticeStyle: CSSProperties = {
    borderRadius: "15px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "13px",
    fontWeight: 950,
    lineHeight: 1.7,
    marginBottom: "12px",
};

const verificationNotesStyle: CSSProperties = {
    padding: "12px",
    borderRadius: "14px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    fontWeight: 800,
    lineHeight: 1.7,
    marginBottom: "12px",
};

const taskMessageStyle: CSSProperties = {
    padding: "12px",
    borderRadius: "14px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    fontWeight: 850,
    lineHeight: 1.7,
    marginBottom: "12px",
};

const taskActionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "12px",
};

const boardStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
};

const boardColumnStyle: CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "13px",
};

const boardColumnHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
};

const criticalTaskStyle: CSSProperties = {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "14px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "8px",
    lineHeight: 1.7,
};

const actionItemStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "32px 1fr",
    gap: "10px",
    alignItems: "start",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
    lineHeight: 1.7,
};

const miniTaskStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "11px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "8px",
};

const timelineBoxStyle: CSSProperties = {
    borderTop: "1px solid #e2e8f0",
    paddingTop: "12px",
    marginTop: "12px",
};

const timelineTitleStyle: CSSProperties = {
    display: "block",
    marginBottom: "10px",
};

const timelineListStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
};

const timelineItemStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "11px",
    borderRadius: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    lineHeight: 1.7,
};

// ============================================================
// Role Command Center styles
// ============================================================

const commandCenterWrapperStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "24px",
    padding: "22px",
    marginBottom: "18px",
    boxShadow: "0 14px 35px rgba(15,23,42,0.045)",
};

const commandCenterHeaderStyle: CSSProperties = {
    marginBottom: "18px",
};

const commandCenterTitleStyle: CSSProperties = {
    margin: "0 0 4px",
    fontSize: "22px",
};

const roleCardsScrollStyle: CSSProperties = {
    display: "flex",
    gap: "14px",
    overflowX: "auto",
    paddingBottom: "6px",
};

function roleCardStyle(isSelected: boolean, hasManagerQueue: boolean): CSSProperties {
    let borderColor = "#e2e8f0";
    let background = "#f8fafc";
    let boxShadow = "0 4px 14px rgba(15,23,42,0.04)";

    if (isSelected) {
        borderColor = "#0f172a";
        background = "#0f172a";
        boxShadow = "0 12px 32px rgba(15,23,42,0.22)";
    } else if (hasManagerQueue) {
        borderColor = "#fca5a5";
        background = "#fff7f7";
        boxShadow = "0 8px 24px rgba(220,38,38,0.12)";
    }

    return {
        minWidth: "210px",
        maxWidth: "210px",
        border: `2px solid ${borderColor}`,
        borderRadius: "20px",
        padding: "16px",
        background,
        boxShadow,
        color: isSelected ? "white" : "#0f172a",
        cursor: "pointer",
        flexShrink: 0,
        transition: "box-shadow 0.18s, border-color 0.18s",
    };
}

const roleCardTopStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
    marginBottom: "4px",
};

// Static fallback for role title — color for selected state handled via card background contrast
const roleTitleStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: 1.4,
};

const roleCardNameStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: "16px",
    color: "inherit",
    marginBottom: "2px",
};

const roleCardDeptStyle: CSSProperties = {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "2px",
};

const roleCardDividerStyle: CSSProperties = {
    borderTop: "1px solid #e2e8f0",
    margin: "12px 0",
};

const roleCardMetricsStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
};

const roleMetricItemStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
};

const roleMetricLabelStyle: CSSProperties = {
    fontSize: "11px",
    color: "#64748b",
    fontWeight: 800,
    lineHeight: 1.4,
};

const roleMetricValueStyle: CSSProperties = {
    fontSize: "14px",
    fontWeight: 900,
    color: "#0f172a",
};

const selectedBadgeStyle: CSSProperties = {
    display: "inline-flex",
    padding: "3px 9px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.35)",
    color: "white",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
};

const managerQueueBadgeStyle: CSSProperties = {
    marginTop: "12px",
    padding: "9px 11px",
    borderRadius: "12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    fontSize: "12px",
    fontWeight: 900,
    lineHeight: 1.5,
};

const verificationDetailStyle: CSSProperties = {
    padding: "16px",
    borderRadius: "16px",
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    marginBottom: "12px",
};

const detailBlockStyle: CSSProperties = {
    marginBottom: "10px",
};

const detailLabelStyle: CSSProperties = {
    display: "block",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "4px",
};

const detailListStyle: CSSProperties = {
    margin: 0,
    paddingInlineStart: "20px",
    color: "#0f172a",
    lineHeight: 1.6,
};

const detailParagraphStyle: CSSProperties = {
    margin: 0,
    color: "#0f172a",
    lineHeight: 1.6,
};

const managerRequiredBadgeStyle: CSSProperties = {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: "12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: "13px",
    fontWeight: 900,
    marginTop: "4px",
};

const noManagerBadgeStyle: CSSProperties = {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: "12px",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    color: "#475569",
    fontSize: "13px",
    fontWeight: 900,
    marginTop: "4px",
};

const activeTaskBadgeStyle: CSSProperties = {
    position: "absolute",
    top: "-12px",
    right: "24px",
    background: "#2563eb",
    color: "white",
    padding: "4px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
    boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
    zIndex: 10,
};

const completionNoticeStyle: CSSProperties = {
    padding: "20px",
    borderRadius: "20px",
    background: "#f0fdf4",
    border: "2px solid #22c55e",
    marginBottom: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    boxShadow: "0 10px 25px rgba(34,197,94,0.12)",
};

const completionNoticeTitleStyle: CSSProperties = {
    fontSize: "18px",
    fontWeight: 900,
    color: "#166534",
    display: "flex",
    alignItems: "center",
    gap: "10px",
};

const completionNoticeActionsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    marginTop: "4px",
};
