"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type TenderDetails = {
  id: number;
  title: string;
  client: string;
  status: string;
  readiness_score: number;
  description: string;
  submission_deadline: string;
};

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

export default function TenderDetailsPage() {
  const params = useParams<{ id: string }>();
  const [tender, setTender] = useState<TenderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadTender = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
        const tenderId = params?.id;

        if (!tenderId) {
          throw new Error("Missing tender id");
        }

        const response = await fetch(`${baseUrl}/tenders/${tenderId}`);

        if (!response.ok) {
          throw new Error("Failed to load tender");
        }

        const data: TenderDetails = await response.json();
        setTender(data);
      } catch {
        setError("تعذر تحميل تفاصيل المنافسة من الخادم");
      } finally {
        setLoading(false);
      }
    };

    loadTender();
  }, [params]);

  if (loading) {
    return <p>جارٍ تحميل تفاصيل المنافسة...</p>;
  }

  if (error) {
    return (
      <div
        style={{
          background: "#fee2e2",
          color: "#991b1b",
          padding: "16px",
          borderRadius: "10px",
        }}
      >
        {error}
      </div>
    );
  }

  if (!tender) {
    return <p>المنافسة غير موجودة.</p>;
  }

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>{tender.title}</h1>
      <p style={{ color: "#4b5563", marginBottom: "24px" }}>
        تفاصيل مساحة عمل المنافسة
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>معلومات المنافسة</h2>
          <p>
            <strong>الجهة:</strong> {tender.client}
          </p>
          <p>
            <strong>الحالة:</strong> {translateStatus(tender.status)}
          </p>
          <p>
            <strong>آخر موعد للتقديم:</strong> {tender.submission_deadline}
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>الوصف:</strong> {tender.description}
          </p>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>الجاهزية</h2>
          <p style={{ color: "#6b7280", marginBottom: "8px" }}>
            درجة الجاهزية الحالية
          </p>
          <h3 style={{ fontSize: "36px", margin: 0 }}>
            {tender.readiness_score}%
          </h3>
        </div>
      </div>
    </main>
  );
}