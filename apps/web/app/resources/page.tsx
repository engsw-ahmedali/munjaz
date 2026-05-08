"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { API_BASE_URL } from "@/lib/api";

type Capability = {
    id: number;
    resource_id: number;
    capability_key: string;
    capability_label: string;
    capability_description: string;
    confidence: string;
    keywords?: string | null;
};

type ResourceDocument = {
    id: number;
    resource_id: number;
    document_name: string;
    document_type: string;
    file_path: string;
    mime_type?: string | null;
    notes?: string | null;
    status: string;
    uploaded_at: string;
};

type CompanyResource = {
    id: number;
    name: string;
    resource_type: string;
    category: string;
    description: string;
    keywords: string;
    owner: string;
    status: string;
    valid_until?: string | null;
    evidence_note?: string | null;
    created_at: string;
    documents_count: number;
    capabilities: Capability[];
};

type ResourcesResponse = {
    count: number;
    resources: CompanyResource[];
};

type DocumentsResponse = {
    resource_id: number;
    count: number;
    documents: ResourceDocument[];
};

type NewResourceForm = {
    name: string;
    resource_type: string;
    category: string;
    description: string;
    keywords: string;
    owner: string;
    status: string;
    valid_until: string;
    evidence_note: string;
};



const RESOURCE_TYPE_OPTIONS = [
    { value: "employee", label: "موظف" },
    { value: "project_experience", label: "خبرة سابقة" },
    { value: "certification", label: "شهادة" },
    { value: "template", label: "قالب" },
    { value: "product", label: "منتج" },
    { value: "capability", label: "قدرة تشغيلية" },
    { value: "partner", label: "شريك / مورد" },
];

const CATEGORY_OPTIONS = [
    "فني",
    "خبرات",
    "شهادات",
    "إداري",
    "تقني",
    "تشغيل",
    "توريد",
    "جودة وامتثال",
    "تجاري",
];

const DOCUMENT_TYPE_OPTIONS = [
    { value: "supporting_document", label: "مستند داعم" },
    { value: "authorization_letter", label: "خطاب تفويض" },
    { value: "certificate", label: "شهادة" },
    { value: "cv", label: "سيرة ذاتية / CV" },
    { value: "completion_certificate", label: "شهادة إنجاز مشروع" },
    { value: "datasheet", label: "نشرة فنية / Datasheet" },
    { value: "template", label: "قالب" },
    { value: "other", label: "أخرى" },
];

const EMPTY_FORM: NewResourceForm = {
    name: "",
    resource_type: "project_experience",
    category: "خبرات",
    description: "",
    keywords: "",
    owner: "",
    status: "active",
    valid_until: "",
    evidence_note: "",
};

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

function translateDocumentType(type: string) {
    const found = DOCUMENT_TYPE_OPTIONS.find((item) => item.value === type);
    return found?.label || type;
}

function typeColor(type: string) {
    const map: Record<string, string> = {
        employee: "#2563eb",
        project_experience: "#16a34a",
        certification: "#9333ea",
        template: "#f97316",
        product: "#0891b2",
        capability: "#dc2626",
        partner: "#64748b",
    };

    return map[type] || "#0f172a";
}

function confidenceColor(confidence: string) {
    if (confidence === "عالية") return "#16a34a";
    if (confidence === "متوسطة") return "#f59e0b";
    return "#64748b";
}

export default function ResourcesPage() {
    const [resources, setResources] = useState<CompanyResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const [search, setSearch] = useState("");
    const [selectedType, setSelectedType] = useState("all");
    const [selectedCategory, setSelectedCategory] = useState("all");

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<NewResourceForm>(EMPTY_FORM);

    const [uploadResource, setUploadResource] = useState<CompanyResource | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadDocumentType, setUploadDocumentType] = useState("supporting_document");
    const [uploadNotes, setUploadNotes] = useState("");
    const [uploading, setUploading] = useState(false);

    const [documentsResource, setDocumentsResource] = useState<CompanyResource | null>(null);
    const [resourceDocuments, setResourceDocuments] = useState<ResourceDocument[]>([]);
    const [documentsLoading, setDocumentsLoading] = useState(false);

    async function loadResources() {
        try {
            setLoading(true);
            setMessage("");

            const response = await fetch(`${API_BASE_URL}/resources`, {
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error("Failed to load resources");
            }

            const data: ResourcesResponse = await response.json();
            setResources(data.resources || []);
        } catch (error) {
            console.error(error);
            setMessage("تعذر تحميل موارد الشركة. تأكد أن الباك إند يعمل على المنفذ 8000.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadResources();
    }, []);

    function updateFormField(field: keyof NewResourceForm, value: string) {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    }

    function openCreateModal() {
        setForm(EMPTY_FORM);
        setMessage("");
        setSuccessMessage("");
        setShowCreateModal(true);
    }

    function closeCreateModal() {
        if (saving) return;
        setShowCreateModal(false);
    }

    function openUploadModal(resource: CompanyResource) {
        setMessage("");
        setSuccessMessage("");
        setUploadResource(resource);
        setUploadFile(null);
        setUploadDocumentType("supporting_document");
        setUploadNotes("");
    }

    function closeUploadModal() {
        if (uploading) return;
        setUploadResource(null);
        setUploadFile(null);
        setUploadDocumentType("supporting_document");
        setUploadNotes("");
    }

    async function openDocumentsModal(resource: CompanyResource) {
        try {
            setMessage("");
            setSuccessMessage("");
            setDocumentsResource(resource);
            setResourceDocuments([]);
            setDocumentsLoading(true);

            const response = await fetch(`${API_BASE_URL}/resources/${resource.id}/documents`, {
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const data: DocumentsResponse = await response.json();
            setResourceDocuments(data.documents || []);
        } catch (error) {
            console.error(error);
            setMessage("تعذر عرض مستندات المورد.");
        } finally {
            setDocumentsLoading(false);
        }
    }

    function closeDocumentsModal() {
        setDocumentsResource(null);
        setResourceDocuments([]);
        setDocumentsLoading(false);
    }

    async function createResource() {
        const requiredFields = [
            form.name.trim(),
            form.resource_type.trim(),
            form.category.trim(),
            form.description.trim(),
            form.keywords.trim(),
            form.owner.trim(),
        ];

        if (requiredFields.some((value) => !value)) {
            setMessage("أكمل الحقول الأساسية قبل حفظ المورد.");
            return;
        }

        try {
            setSaving(true);
            setMessage("");
            setSuccessMessage("");

            const payload = {
                name: form.name.trim(),
                resource_type: form.resource_type.trim(),
                category: form.category.trim(),
                description: form.description.trim(),
                keywords: form.keywords.trim(),
                owner: form.owner.trim(),
                status: form.status || "active",
                valid_until: form.valid_until.trim() || null,
                evidence_note: form.evidence_note.trim() || null,
            };

            const response = await fetch(`${API_BASE_URL}/resources`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            await loadResources();

            setSuccessMessage("تم إضافة مورد الشركة بنجاح.");
            setShowCreateModal(false);
            setForm(EMPTY_FORM);
        } catch (error) {
            console.error(error);
            setMessage("تعذر حفظ المورد. تأكد من تشغيل الباك إند وأن البيانات مكتملة.");
        } finally {
            setSaving(false);
        }
    }

    async function uploadResourceDocument() {
        if (!uploadResource) {
            setMessage("لم يتم اختيار المورد.");
            return;
        }

        if (!uploadFile) {
            setMessage("اختر ملفًا قبل رفع المستند.");
            return;
        }

        try {
            setUploading(true);
            setMessage("");
            setSuccessMessage("");

            const formData = new FormData();
            formData.append("file", uploadFile);
            formData.append("document_type", uploadDocumentType);
            formData.append("notes", uploadNotes.trim() || "مستند داعم مرفوع من واجهة موارد الشركة");

            const response = await fetch(
                `${API_BASE_URL}/resources/${uploadResource.id}/documents/upload`,
                {
                    method: "POST",
                    body: formData,
                }
            );

            if (!response.ok) {
                throw new Error(await response.text());
            }

            await loadResources();

            setSuccessMessage(`تم رفع المستند وربطه بالمورد: ${uploadResource.name}`);
            closeUploadModal();
        } catch (error) {
            console.error(error);
            setMessage("تعذر رفع المستند. تأكد من أن الملف صالح وأن الباك إند يعمل.");
        } finally {
            setUploading(false);
        }
    }

    const resourceTypes = useMemo(() => {
        return Array.from(new Set(resources.map((resource) => resource.resource_type)));
    }, [resources]);

    const categories = useMemo(() => {
        return Array.from(new Set(resources.map((resource) => resource.category)));
    }, [resources]);

    const filteredResources = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return resources.filter((resource) => {
            const matchesSearch =
                !normalizedSearch ||
                `${resource.name} ${resource.description} ${resource.keywords} ${resource.owner} ${resource.category}`
                    .toLowerCase()
                    .includes(normalizedSearch);

            const matchesType =
                selectedType === "all" || resource.resource_type === selectedType;

            const matchesCategory =
                selectedCategory === "all" || resource.category === selectedCategory;

            return matchesSearch && matchesType && matchesCategory;
        });
    }, [resources, search, selectedType, selectedCategory]);

    const stats = useMemo(() => {
        const active = resources.filter((resource) => resource.status === "active").length;
        const documents = resources.reduce(
            (total, resource) => total + (resource.documents_count || 0),
            0
        );
        const capabilities = resources.reduce(
            (total, resource) => total + (resource.capabilities?.length || 0),
            0
        );

        return {
            total: resources.length,
            active,
            documents,
            capabilities,
        };
    }, [resources]);

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <div style={heroInnerStyle}>
                    <div>
                        <span style={pillStyle}>ذاكرة موارد الشركة</span>
                        <h1 style={pageTitleStyle}>موارد الشركة</h1>
                        <p style={heroTextStyle}>
                            قاعدة مركزية للخبرات، الموظفين، الشهادات، المنتجات، القوالب،
                            والقدرات التي سيستخدمها الوكيل لاحقًا لمطابقة متطلبات المنافسات
                            وإثبات الجاهزية. كل مورد يمكن ربطه الآن بأدلة ومستندات داعمة.
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button onClick={openCreateModal} style={primaryButtonStyle}>
                            + إضافة مورد جديد
                        </button>

                        <button onClick={loadResources} style={darkButtonStyle}>
                            تحديث الموارد
                        </button>
                    </div>
                </div>
            </section>

            {message ? <Alert type="error">{message}</Alert> : null}
            {successMessage ? <Alert type="success">{successMessage}</Alert> : null}

            <section style={statsGridStyle}>
                <StatCard title="إجمالي الموارد" value={stats.total} hint="كل موارد الشركة" color="#2563eb" />
                <StatCard title="موارد نشطة" value={stats.active} hint="جاهزة للاستخدام" color="#16a34a" />
                <StatCard title="مستندات داعمة" value={stats.documents} hint="أدلة مرتبطة بالموارد" color="#9333ea" />
                <StatCard title="قدرات معرفة" value={stats.capabilities} hint="قابلة للمطابقة" color="#f97316" />
            </section>

            <section style={filtersStyle}>
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث باسم المورد، المالك، التصنيف، الكلمات المفتاحية..."
                    style={inputStyle}
                />

                <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value)}
                    style={inputStyle}
                >
                    <option value="all">كل أنواع الموارد</option>
                    {resourceTypes.map((type) => (
                        <option key={type} value={type}>
                            {translateResourceType(type)}
                        </option>
                    ))}
                </select>

                <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    style={inputStyle}
                >
                    <option value="all">كل التصنيفات</option>
                    {categories.map((category) => (
                        <option key={category} value={category}>
                            {category}
                        </option>
                    ))}
                </select>
            </section>

            {loading ? (
                <section style={emptyStateStyle}>جاري تحميل موارد الشركة...</section>
            ) : filteredResources.length === 0 ? (
                <section style={emptyStateStyle}>لا توجد موارد مطابقة للفلاتر الحالية.</section>
            ) : (
                <section style={cardsGridStyle}>
                    {filteredResources.map((resource) => (
                        <article
                            key={resource.id}
                            style={{
                                ...cardStyle,
                                borderRight: `6px solid ${typeColor(resource.resource_type)}`,
                            }}
                        >
                            <div style={cardHeaderStyle}>
                                <div>
                                    <div style={badgesRowStyle}>
                                        <Badge text={translateResourceType(resource.resource_type)} color={typeColor(resource.resource_type)} />
                                        <Badge text={resource.category} color="#0f172a" />
                                        <Badge text={resource.status === "active" ? "نشط" : resource.status} color={resource.status === "active" ? "#16a34a" : "#64748b"} />
                                    </div>

                                    <h2 style={cardTitleStyle}>{resource.name}</h2>
                                </div>

                                <div style={resourceNumberStyle}>
                                    <div style={smallMutedTextStyle}>رقم المورد</div>
                                    <div style={{ fontSize: "20px", fontWeight: 900 }}>{resource.id}</div>
                                </div>
                            </div>

                            <p style={descriptionStyle}>{resource.description}</p>

                            <div style={miniInfoGridStyle}>
                                <MiniInfo title="المالك" value={resource.owner} />
                                <MiniInfo title="المستندات" value={`${resource.documents_count || 0}`} />
                                <MiniInfo title="الصلاحية" value={resource.valid_until || "غير محددة"} />
                            </div>

                            {resource.evidence_note ? (
                                <div style={evidenceNoteStyle}>
                                    <strong>ملاحظة الدليل: </strong>
                                    {resource.evidence_note}
                                </div>
                            ) : null}

                            <div style={sectionBlockStyle}>
                                <strong style={sectionTitleStyle}>القدرات المرتبطة</strong>

                                {resource.capabilities?.length ? (
                                    resource.capabilities.map((capability) => (
                                        <div key={capability.id} style={capabilityCardStyle}>
                                            <div style={capabilityHeaderStyle}>
                                                <strong>{capability.capability_label}</strong>
                                                <span
                                                    style={{
                                                        color: confidenceColor(capability.confidence),
                                                        fontWeight: 900,
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    {capability.confidence}
                                                </span>
                                            </div>
                                            <p style={capabilityTextStyle}>{capability.capability_description}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div style={dashedBoxStyle}>لا توجد قدرات معرفة لهذا المورد حتى الآن.</div>
                                )}
                            </div>

                            <div style={keywordsRowStyle}>
                                {resource.keywords
                                    .split(",")
                                    .map((keyword) => keyword.trim())
                                    .filter(Boolean)
                                    .slice(0, 10)
                                    .map((keyword) => (
                                        <span key={keyword} style={keywordStyle}>
                                            {keyword}
                                        </span>
                                    ))}
                            </div>

                            <div style={cardActionsStyle}>
                                <button onClick={() => openUploadModal(resource)} style={uploadButtonStyle}>
                                    رفع مستند داعم
                                </button>

                                <button onClick={() => openDocumentsModal(resource)} style={outlineButtonStyle}>
                                    عرض المستندات
                                </button>
                            </div>
                        </article>
                    ))}
                </section>
            )}

            {showCreateModal ? (
                <Modal>
                    <section style={modalCardStyle}>
                        <ModalHeader
                            badge="إضافة مورد الشركة"
                            title="إضافة مورد جديد"
                            description="أضف موردًا حقيقيًا من موارد الشركة ليستخدمه الوكيل لاحقًا في مطابقة متطلبات المنافسات وتحليل الجاهزية."
                            onClose={closeCreateModal}
                            disabled={saving}
                        />

                        <div style={formGridStyle}>
                            <FormField label="اسم المورد *">
                                <input
                                    value={form.name}
                                    onChange={(event) => updateFormField("name", event.target.value)}
                                    placeholder="مثال: شهادة ISO 27001 سارية / مهندس شبكات معتمد"
                                    style={inputStyle}
                                />
                            </FormField>

                            <FormField label="نوع المورد *">
                                <select
                                    value={form.resource_type}
                                    onChange={(event) => updateFormField("resource_type", event.target.value)}
                                    style={inputStyle}
                                >
                                    {RESOURCE_TYPE_OPTIONS.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </FormField>

                            <FormField label="التصنيف *">
                                <select
                                    value={form.category}
                                    onChange={(event) => updateFormField("category", event.target.value)}
                                    style={inputStyle}
                                >
                                    {CATEGORY_OPTIONS.map((category) => (
                                        <option key={category} value={category}>
                                            {category}
                                        </option>
                                    ))}
                                </select>
                            </FormField>

                            <FormField label="المالك / الفريق المسؤول *">
                                <input
                                    value={form.owner}
                                    onChange={(event) => updateFormField("owner", event.target.value)}
                                    placeholder="مثال: الفريق الفني / فريق الجودة والامتثال"
                                    style={inputStyle}
                                />
                            </FormField>

                            <FormField label="الحالة">
                                <select
                                    value={form.status}
                                    onChange={(event) => updateFormField("status", event.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="active">نشط</option>
                                    <option value="inactive">غير نشط</option>
                                    <option value="expired">منتهي</option>
                                    <option value="draft">مسودة</option>
                                </select>
                            </FormField>

                            <FormField label="تاريخ الصلاحية">
                                <input
                                    type="date"
                                    value={form.valid_until}
                                    onChange={(event) => updateFormField("valid_until", event.target.value)}
                                    style={inputStyle}
                                />
                            </FormField>

                            <FormField label="الوصف *" fullWidth>
                                <textarea
                                    value={form.description}
                                    onChange={(event) => updateFormField("description", event.target.value)}
                                    placeholder="اكتب وصفًا واضحًا للمورد وكيف يمكن أن يدعم المنافسات..."
                                    rows={5}
                                    style={textareaStyle}
                                />
                            </FormField>

                            <FormField label="الكلمات المفتاحية *" fullWidth>
                                <input
                                    value={form.keywords}
                                    onChange={(event) => updateFormField("keywords", event.target.value)}
                                    placeholder="مثال: ISO 27001, أمن معلومات, امتثال, شهادة"
                                    style={inputStyle}
                                />
                            </FormField>

                            <FormField label="ملاحظة الدليل" fullWidth>
                                <textarea
                                    value={form.evidence_note}
                                    onChange={(event) => updateFormField("evidence_note", event.target.value)}
                                    placeholder="مثال: يجب إرفاق نسخة الشهادة السارية أو خطاب الإنجاز عند استخدام هذا المورد كدليل."
                                    rows={4}
                                    style={textareaStyle}
                                />
                            </FormField>
                        </div>

                        <ModalFooter
                            note="الموارد التي تضيفها هنا ستصبح جزءًا من ذاكرة الشركة، ثم سنربطها لاحقًا بطبقة المطابقة وطبقة LLM Reasoning."
                            cancelText="إلغاء"
                            actionText={saving ? "جاري الحفظ..." : "حفظ المورد"}
                            onCancel={closeCreateModal}
                            onAction={createResource}
                            disabled={saving}
                        />
                    </section>
                </Modal>
            ) : null}

            {uploadResource ? (
                <Modal>
                    <section style={modalCardStyle}>
                        <ModalHeader
                            badge="رفع دليل المورد"
                            title="رفع مستند داعم للمورد"
                            description="ارفع شهادة، خطاب تفويض، CV، خطاب إنجاز، داتا شيت، أو أي مستند يثبت صحة هذا المورد."
                            onClose={closeUploadModal}
                            disabled={uploading}
                        />

                        <div style={selectedResourceBoxStyle}>
                            <div style={smallMutedTextStyle}>المورد المختار</div>
                            <strong>{uploadResource.name}</strong>
                            <div style={{ marginTop: "8px", color: "#64748b", fontSize: "13px" }}>
                                رقم المورد: {uploadResource.id} — النوع: {translateResourceType(uploadResource.resource_type)}
                            </div>
                        </div>

                        <div style={formGridStyle}>
                            <FormField label="نوع المستند *">
                                <select
                                    value={uploadDocumentType}
                                    onChange={(event) => setUploadDocumentType(event.target.value)}
                                    style={inputStyle}
                                >
                                    {DOCUMENT_TYPE_OPTIONS.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </FormField>

                            <FormField label="اختيار الملف *">
                                <input
                                    type="file"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0] || null;
                                        setUploadFile(file);
                                    }}
                                    style={fileInputStyle}
                                />
                            </FormField>

                            <FormField label="ملاحظات المستند" fullWidth>
                                <textarea
                                    value={uploadNotes}
                                    onChange={(event) => setUploadNotes(event.target.value)}
                                    placeholder="مثال: خطاب تفويض Cisco الداعم للمورد، صالح لاستخدامه كدليل في المنافسات."
                                    rows={4}
                                    style={textareaStyle}
                                />
                            </FormField>
                        </div>

                        {uploadFile ? (
                            <div style={filePreviewStyle}>
                                <strong>الملف المختار:</strong> {uploadFile.name}
                            </div>
                        ) : null}

                        <ModalFooter
                            note="بعد الرفع سيزيد عداد المستندات لهذا المورد، وسيصبح الدليل متاحًا للوكيل عند تحليل الجاهزية."
                            cancelText="إلغاء"
                            actionText={uploading ? "جاري الرفع..." : "رفع وربط المستند"}
                            onCancel={closeUploadModal}
                            onAction={uploadResourceDocument}
                            disabled={uploading}
                        />
                    </section>
                </Modal>
            ) : null}

            {documentsResource ? (
                <Modal>
                    <section style={modalCardStyle}>
                        <ModalHeader
                            badge="مجلد أدلة المورد"
                            title="مستندات المورد"
                            description="هذه هي الأدلة المرتبطة بهذا المورد، ويمكن للوكيل استخدامها لاحقًا لدعم قرارات الجاهزية وإغلاق الفجوات."
                            onClose={closeDocumentsModal}
                        />

                        <div style={selectedResourceBoxStyle}>
                            <div style={smallMutedTextStyle}>المورد</div>
                            <strong>{documentsResource.name}</strong>
                            <div style={{ marginTop: "8px", color: "#64748b", fontSize: "13px" }}>
                                رقم المورد: {documentsResource.id} — عدد المستندات: {resourceDocuments.length}
                            </div>
                        </div>

                        {documentsLoading ? (
                            <section style={emptyStateStyle}>جاري تحميل مستندات المورد...</section>
                        ) : resourceDocuments.length === 0 ? (
                            <section style={emptyStateStyle}>لا توجد مستندات داعمة مرفوعة لهذا المورد حتى الآن.</section>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {resourceDocuments.map((document) => (
                                    <article key={document.id} style={documentCardStyle}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: "14px" }}>
                                            <div>
                                                <Badge text={translateDocumentType(document.document_type)} color="#0f766e" />
                                                <h3 style={{ margin: "12px 0 6px", fontSize: "18px" }}>
                                                    {document.document_name}
                                                </h3>
                                                <p style={{ margin: 0, color: "#64748b", lineHeight: 1.8, fontSize: "13px" }}>
                                                    {document.notes || "لا توجد ملاحظات لهذا المستند."}
                                                </p>
                                            </div>

                                            <div style={{ minWidth: "150px", textAlign: "left" }}>
                                                <div style={smallMutedTextStyle}>تاريخ الرفع</div>
                                                <strong style={{ fontSize: "12px" }}>
                                                    {document.uploaded_at?.slice(0, 19).replace("T", " ")}
                                                </strong>
                                            </div>
                                        </div>

                                        <div style={documentMetaGridStyle}>
                                            <MiniInfo title="نوع الملف" value={document.mime_type || "غير محدد"} />
                                            <MiniInfo title="الحالة" value={document.status || "active"} />
                                            <MiniInfo title="رقم المستند" value={`${document.id}`} />
                                        </div>

                                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                                            <a
                                                href={`${API_BASE_URL}/resources/documents/${document.id}/download`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={downloadButtonStyle}
                                            >
                                                فتح / تحميل المستند
                                            </a>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </Modal>
            ) : null}
        </main>
    );
}

const pageStyle: CSSProperties = {
    minHeight: "100vh",
    background: "#F4F6F6",
    color: "#232122",
    display: "grid",
    gap: "12px",
    alignContent: "start",
    fontFamily:
        '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
};

const heroStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    borderRadius: "24px",
    marginBottom: "12px",
    background: "linear-gradient(135deg, #1c1b1c 0%, #232122 60%, #1a1819 100%)",
    boxShadow: "0 24px 56px rgba(35,33,34,0.22)",
};

const heroInnerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "24px",
    alignItems: "center",
    padding: "28px",
    position: "relative",
    zIndex: 1,
};

const pillStyle: CSSProperties = {
    display: "inline-flex",
    padding: "4px 12px",
    borderRadius: "999px",
    background: "rgba(89,186,71,0.15)",
    color: "#7de86a",
    fontWeight: 900,
    fontSize: "11px",
    marginBottom: "10px",
    border: "1px solid rgba(89,186,71,0.25)",
    letterSpacing: "0.04em",
};

const pageTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "28px",
    letterSpacing: "-0.03em",
    color: "#ffffff",
    fontWeight: 950,
};

const heroTextStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "rgba(255,255,255,0.52)",
    lineHeight: 1.8,
    maxWidth: "780px",
    fontSize: "13px",
};

const primaryButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "14px",
    padding: "11px 18px",
    background: "#59BA47",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(89,186,71,0.35)",
    fontSize: "13px",
};

const darkButtonStyle: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "14px",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: "13px",
};

const statsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
};

const filtersStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr 1fr",
    gap: "12px",
    background: "white",
    border: "1px solid #DFE7E4",
    borderRadius: "18px",
    padding: "14px",
};

const inputStyle: CSSProperties = {
    width: "100%",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "13px 14px",
    outline: "none",
    fontSize: "14px",
    background: "white",
    color: "#0f172a",
};

const fileInputStyle: CSSProperties = {
    ...inputStyle,
    padding: "11px 14px",
};

const textareaStyle: CSSProperties = {
    ...inputStyle,
    lineHeight: 1.8,
    resize: "vertical",
};

const emptyStateStyle: CSSProperties = {
    padding: "36px",
    borderRadius: "20px",
    background: "white",
    border: "1px dashed #cbd5e1",
    textAlign: "center",
    color: "#64748b",
    fontWeight: 800,
};

const cardsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #DFE7E4",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(35,33,34,0.04)",
    overflow: "hidden",
};

const cardHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "flex-start",
    marginBottom: "14px",
};

const badgesRowStyle: CSSProperties = {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "10px",
};

const cardTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: "21px",
    letterSpacing: "-0.02em",
};

const resourceNumberStyle: CSSProperties = {
    minWidth: "90px",
    textAlign: "center",
    padding: "10px",
    borderRadius: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
};

const smallMutedTextStyle: CSSProperties = {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 800,
};

const descriptionStyle: CSSProperties = {
    color: "#475569",
    lineHeight: 1.9,
    fontSize: "14px",
    margin: "0 0 16px",
};

const miniInfoGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
};

const evidenceNoteStyle: CSSProperties = {
    padding: "14px",
    borderRadius: "16px",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
    lineHeight: 1.8,
    fontSize: "13px",
    marginBottom: "14px",
};

const sectionBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "14px",
};

const sectionTitleStyle: CSSProperties = {
    fontSize: "13px",
    color: "#334155",
};

const capabilityCardStyle: CSSProperties = {
    border: "1px solid #e2e8f0",
    borderRadius: "15px",
    padding: "12px",
    background: "#f8fafc",
};

const capabilityHeaderStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "6px",
};

const capabilityTextStyle: CSSProperties = {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.8,
};

const dashedBoxStyle: CSSProperties = {
    padding: "12px",
    borderRadius: "14px",
    background: "#f8fafc",
    color: "#94a3b8",
    border: "1px dashed #cbd5e1",
    fontSize: "13px",
};

const keywordsRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "14px",
};

const keywordStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
};

const cardActionsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    marginTop: "16px",
    paddingTop: "14px",
    borderTop: "1px solid #e2e8f0",
};

const uploadButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "12px",
    padding: "11px 14px",
    background: "#0f766e",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
};

const outlineButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "11px 14px",
    background: "white",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
};

const downloadButtonStyle: CSSProperties = {
    border: "0",
    borderRadius: "12px",
    padding: "11px 14px",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
};

const modalOverlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    zIndex: 1000,
};

const modalCardStyle: CSSProperties = {
    width: "min(920px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
    background: "white",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 30px 80px rgba(15,23,42,0.35)",
    border: "1px solid #e2e8f0",
};

const formGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
};

const selectedResourceBoxStyle: CSSProperties = {
    padding: "16px",
    borderRadius: "18px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    marginBottom: "16px",
};

const filePreviewStyle: CSSProperties = {
    marginTop: "14px",
    padding: "14px",
    borderRadius: "14px",
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    fontSize: "13px",
};

const documentCardStyle: CSSProperties = {
    padding: "16px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 25px rgba(15,23,42,0.04)",
};

const documentMetaGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
};

function Modal({ children }: { children: ReactNode }) {
    return <div style={modalOverlayStyle}>{children}</div>;
}

function ModalHeader({
    badge,
    title,
    description,
    onClose,
    disabled,
}: {
    badge: string;
    title: string;
    description: string;
    onClose: () => void;
    disabled?: boolean;
}) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "flex-start",
                marginBottom: "20px",
            }}
        >
            <div>
                <span style={pillStyle}>{badge}</span>
                <h2 style={{ margin: 0, fontSize: "26px" }}>{title}</h2>
                <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.8 }}>
                    {description}
                </p>
            </div>

            <button
                onClick={onClose}
                disabled={disabled}
                style={{
                    border: "1px solid #e2e8f0",
                    background: "white",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 800,
                    cursor: disabled ? "not-allowed" : "pointer",
                }}
            >
                إغلاق
            </button>
        </div>
    );
}

function ModalFooter({
    note,
    cancelText,
    actionText,
    onCancel,
    onAction,
    disabled,
}: {
    note: string;
    cancelText: string;
    actionText: string;
    onCancel: () => void;
    onAction: () => void;
    disabled?: boolean;
}) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "20px",
                paddingTop: "18px",
                borderTop: "1px solid #e2e8f0",
            }}
        >
            <div style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.8 }}>
                {note}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
                <button
                    onClick={onCancel}
                    disabled={disabled}
                    style={{
                        border: "1px solid #e2e8f0",
                        background: "white",
                        color: "#0f172a",
                        borderRadius: "14px",
                        padding: "13px 18px",
                        fontWeight: 900,
                        cursor: disabled ? "not-allowed" : "pointer",
                    }}
                >
                    {cancelText}
                </button>

                <button
                    onClick={onAction}
                    disabled={disabled}
                    style={{
                        border: "0",
                        background: disabled ? "#94a3b8" : "#0f766e",
                        color: "white",
                        borderRadius: "14px",
                        padding: "13px 20px",
                        fontWeight: 900,
                        cursor: disabled ? "not-allowed" : "pointer",
                        boxShadow: disabled ? "none" : "0 14px 30px rgba(15,118,110,0.22)",
                    }}
                >
                    {actionText}
                </button>
            </div>
        </div>
    );
}

function Alert({ children, type }: { children: ReactNode; type: "error" | "success" }) {
    const isSuccess = type === "success";

    return (
        <div
            style={{
                padding: "16px",
                borderRadius: "16px",
                background: isSuccess ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${isSuccess ? "#bbf7d0" : "#fecaca"}`,
                color: isSuccess ? "#166534" : "#991b1b",
                marginBottom: "20px",
                fontWeight: 800,
            }}
        >
            {children}
        </div>
    );
}

function FormField({
    label,
    children,
    fullWidth,
}: {
    label: string;
    children: ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <label
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                gridColumn: fullWidth ? "1 / -1" : "auto",
            }}
        >
            <span style={{ fontWeight: 900, color: "#334155", fontSize: "13px" }}>
                {label}
            </span>
            {children}
        </label>
    );
}

function StatCard({
    title,
    value,
    hint,
    color,
}: {
    title: string;
    value: number;
    hint: string;
    color: string;
}) {
    return (
        <div
            style={{
                background: "white",
                border: "1px solid #DFE7E4",
                borderRadius: "18px",
                display: "flex",
                overflow: "hidden",
                boxShadow: "0 2px 10px rgba(35,33,34,0.04)",
                minHeight: "100px",
            }}
        >
            <div style={{ width: "4px", background: color, flexShrink: 0 }} />
            <div style={{ padding: "14px", flex: 1 }}>
                <div style={{ color: "#8a9591", fontWeight: 900, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
                    {title}
                </div>
                <div style={{ fontSize: "30px", fontWeight: 950, letterSpacing: "-0.03em", lineHeight: 1, color }}>
                    {value}
                </div>
                <div style={{ color: "#9CA3AF", fontWeight: 700, fontSize: "11px", marginTop: "6px" }}>
                    {hint}
                </div>
            </div>
        </div>
    );
}

function MiniInfo({ title, value }: { title: string; value: string }) {
    return (
        <div
            style={{
                padding: "12px",
                borderRadius: "14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
            }}
        >
            <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 800 }}>
                {title}
            </div>
            <div style={{ marginTop: "6px", fontWeight: 900, fontSize: "13px" }}>
                {value}
            </div>
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
                color,
                background: `${color}12`,
                border: `1px solid ${color}33`,
                fontWeight: 900,
                fontSize: "12px",
            }}
        >
            {text}
        </span>
    );
}