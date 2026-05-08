"use client";

import { useEffect, useState } from "react";
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
    documents_count: number;
};

export default function ArchivesPage() {
    const [tenders, setTenders] = useState<Tender[]>([]);
    const [resources, setResources] = useState<CompanyResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    async function loadArchives() {
        try {
            setLoading(true);
            setMessage("");

            // Load closed tenders
            const tendersRes = await fetch(`${API_BASE_URL}/tenders?status=CLOSED`, { cache: "no-store" });
            const tendersData = await tendersRes.json();
            setTenders(Array.isArray(tendersData) ? tendersData : (tendersData.tenders || []));

            // Load disabled resources
            const resourcesRes = await fetch(`${API_BASE_URL}/resources?status=disabled`, { cache: "no-store" });
            const resourcesData = await resourcesRes.json();
            setResources(resourcesData.resources || []);

        } catch (error) {
            console.error(error);
            setMessage("تعذر تحميل الأرشيف. تأكد أن الباك إند يعمل.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadArchives();
    }, []);

    async function toggleTenderStatus(tender: Tender) {
        if (!confirm(`هل أنت متأكد من إعادة فتح المنافسة: ${tender.title}؟`)) return;
        try {
            const response = await fetch(`${API_BASE_URL}/tenders/${tender.id}/reopen`, { method: "POST" });
            if (!response.ok) throw new Error(await response.text());
            await loadArchives();
        } catch (error) {
            console.error(error);
            alert("تعذر إعادة فتح المنافسة.");
        }
    }

    async function toggleResourceStatus(resource: CompanyResource) {
        if (!confirm(`هل أنت متأكد من إعادة تفعيل المورد: ${resource.name}؟`)) return;
        try {
            const response = await fetch(`${API_BASE_URL}/resources/${resource.id}/enable`, { method: "POST" });
            if (!response.ok) throw new Error(await response.text());
            await loadArchives();
        } catch (error) {
            console.error(error);
            alert("تعذر إعادة تفعيل المورد.");
        }
    }

    return (
        <main dir="rtl" style={pageStyle}>
            <section style={heroStyle}>
                <span style={pillStyle}>الأرشيف المركزي</span>
                <h1 style={titleStyle}>أرشيف منجز</h1>
                <p style={subtitleStyle}>
                    هنا تجد كافة المنافسات المغلقة والموارد المعطلة. يتم الاحتفاظ بها لأغراض الأرشفة والتدقيق والرجوع التاريخي.
                </p>
            </section>

            {message ? <div style={errorStyle}>{message}</div> : null}

            <div style={gridStyle}>
                {/* Tenders Section */}
                <section>
                    <div style={sectionHeaderStyle}>
                        <h2 style={sectionTitleStyle}>المنافسات المغلقة</h2>
                        <span style={countBadgeStyle}>{tenders.length}</span>
                    </div>

                    <div style={listStyle}>
                        {tenders.length === 0 && !loading && (
                            <div style={emptyStyle}>لا توجد منافسات مغلقة حاليًا.</div>
                        )}
                        {tenders.map((tender) => (
                            <article key={tender.id} style={cardStyle}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                        <h3 style={cardTitleStyle}>{tender.title}</h3>
                                        <p style={cardSubtitleStyle}>{tender.client}</p>
                                    </div>
                                    <div style={statusBadgeStyle}>مغلقة</div>
                                </div>
                                
                                <div style={metaGridStyle}>
                                    <div style={metaItemStyle}>
                                        <div style={metaLabelStyle}>الجاهزية</div>
                                        <div style={metaValueStyle}>{tender.readiness_score}%</div>
                                    </div>
                                    <div style={metaItemStyle}>
                                        <div style={metaLabelStyle}>تاريخ الإغلاق</div>
                                        <div style={metaValueStyle}>{tender.submission_deadline}</div>
                                    </div>
                                </div>

                                <div style={actionsStyle}>
                                    <a href={`/tenders/${tender.id}`} style={actionLinkStyle}>فتح التفاصيل</a>
                                    <a href={`/tenders/${tender.id}/reasoning`} style={actionLinkStyle}>مذكرة القرار</a>
                                    <button onClick={() => toggleTenderStatus(tender)} style={reopenButtonStyle}>إعادة فتح</button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Resources Section */}
                <section>
                    <div style={sectionHeaderStyle}>
                        <h2 style={sectionTitleStyle}>الموارد المعطلة</h2>
                        <span style={countBadgeStyle}>{resources.length}</span>
                    </div>

                    <div style={listStyle}>
                        {resources.length === 0 && !loading && (
                            <div style={emptyStyle}>لا توجد موارد معطلة حاليًا.</div>
                        )}
                        {resources.map((resource) => (
                            <article key={resource.id} style={cardStyle}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                        <h3 style={cardTitleStyle}>{resource.name}</h3>
                                        <p style={cardSubtitleStyle}>{resource.owner}</p>
                                    </div>
                                    <div style={{ ...statusBadgeStyle, background: "#fef2f2", color: "#991b1b" }}>مورد معطل</div>
                                </div>

                                <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    {resource.keywords.split(",").slice(0, 3).map(k => (
                                        <span key={k} style={tagStyle}>{k.trim()}</span>
                                    ))}
                                </div>

                                <div style={actionsStyle}>
                                    <button onClick={() => toggleResourceStatus(resource)} style={reopenButtonStyle}>إعادة تفعيل المورد</button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}

const pageStyle: CSSProperties = {
    padding: "32px",
    maxWidth: "1400px",
    margin: "0 auto",
};

const heroStyle: CSSProperties = {
    marginBottom: "40px",
    textAlign: "right",
};

const pillStyle: CSSProperties = {
    background: "#f1f5f9",
    color: "#64748b",
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
};

const titleStyle: CSSProperties = {
    fontSize: "36px",
    margin: "12px 0",
    color: "#0f172a",
};

const subtitleStyle: CSSProperties = {
    color: "#64748b",
    fontSize: "16px",
    lineHeight: 1.8,
};

const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "32px",
};

const sectionHeaderStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
    paddingBottom: "12px",
    borderBottom: "2px solid #e2e8f0",
};

const sectionTitleStyle: CSSProperties = {
    fontSize: "20px",
    fontWeight: 800,
    margin: 0,
};

const countBadgeStyle: CSSProperties = {
    background: "#0f172a",
    color: "white",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 800,
};

const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
};

const cardStyle: CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
};

const cardTitleStyle: CSSProperties = {
    fontSize: "18px",
    margin: "0 0 4px",
    fontWeight: 800,
};

const cardSubtitleStyle: CSSProperties = {
    fontSize: "14px",
    color: "#64748b",
    margin: 0,
};

const statusBadgeStyle: CSSProperties = {
    fontSize: "11px",
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: "8px",
    background: "#f8fafc",
    color: "#64748b",
    border: "1px solid #e2e8f0",
};

const metaGridStyle: CSSProperties = {
    display: "flex",
    gap: "24px",
    marginTop: "16px",
    padding: "12px",
    background: "#f8fafc",
    borderRadius: "12px",
};

const metaItemStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
};

const metaLabelStyle: CSSProperties = {
    fontSize: "11px",
    color: "#94a3b8",
    fontWeight: 800,
};

const metaValueStyle: CSSProperties = {
    fontSize: "14px",
    fontWeight: 900,
};

const actionsStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid #f1f5f9",
};

const actionLinkStyle: CSSProperties = {
    fontSize: "13px",
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 800,
};

const reopenButtonStyle: CSSProperties = {
    fontSize: "13px",
    color: "#059669",
    background: "none",
    border: "none",
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
};

const tagStyle: CSSProperties = {
    fontSize: "11px",
    background: "#f1f5f9",
    color: "#475569",
    padding: "4px 8px",
    borderRadius: "6px",
    fontWeight: 700,
};

const errorStyle: CSSProperties = {
    padding: "16px",
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: "12px",
    marginBottom: "24px",
    fontWeight: 800,
};

const emptyStyle: CSSProperties = {
    padding: "40px",
    textAlign: "center",
    color: "#94a3b8",
    background: "#f8fafc",
    borderRadius: "16px",
    border: "1px dashed #cbd5e1",
    fontSize: "14px",
};
