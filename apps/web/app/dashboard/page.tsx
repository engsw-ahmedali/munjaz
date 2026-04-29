"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
    status: string;
};

export default function DashboardPage() {
    const [apiStatus, setApiStatus] = useState("جارٍ الفحص...");
    const [apiMessage, setApiMessage] = useState("جارٍ الاتصال بالخادم...");
    const [loading, setLoading] = useState(true);

    const stats = [
        { title: "المنافسات النشطة", value: "12" },
        { title: "المهام المفتوحة", value: "27" },
        { title: "الموافقات المعلقة", value: "4" },
        { title: "درجة الجاهزية", value: "78%" },
    ];

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
                const response = await fetch(`${baseUrl}/health`);
                const data: HealthResponse = await response.json();

                if (response.ok) {
                    setApiStatus("متصل");
                    setApiMessage(`استجاب الخادم بالحالة: ${data.status}`);
                } else {
                    setApiStatus("خطأ");
                    setApiMessage("عاد الخادم باستجابة غير ناجحة");
                }
            } catch {
                setApiStatus("غير متصل");
                setApiMessage("تعذر الاتصال بالخادم");
            } finally {
                setLoading(false);
            }
        };

        checkHealth();
    }, []);

    return (
        <main>
            <h1 style={{ marginTop: 0 }}>لوحة التحكم</h1>
            <p style={{ color: "#4b5563", marginBottom: "24px" }}>
                نظرة عامة على مساحة عمل منجز
            </p>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "16px",
                    marginBottom: "24px",
                }}
            >
                {stats.map((stat) => (
                    <div
                        key={stat.title}
                        style={{
                            background: "white",
                            padding: "20px",
                            borderRadius: "12px",
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                    >
                        <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                            {stat.title}
                        </p>
                        <h2 style={{ margin: "10px 0 0", fontSize: "28px" }}>
                            {stat.value}
                        </h2>
                    </div>
                ))}
            </div>

            <div
                style={{
                    background: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
            >
                <h2 style={{ marginTop: 0 }}>حالة النظام</h2>
                <p>
                    <strong>حالة واجهة API الخلفية:</strong>{" "}
                    {loading ? "جارٍ الفحص..." : apiStatus}
                </p>
                <p style={{ color: "#4b5563", marginBottom: 0 }}>{apiMessage}</p>
            </div>
        </main>
    );
}