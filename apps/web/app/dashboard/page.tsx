export default function DashboardPage() {
    const stats = [
        { title: "Active Tenders", value: "12" },
        { title: "Open Tasks", value: "27" },
        { title: "Pending Approvals", value: "4" },
        { title: "Readiness Score", value: "78%" },
    ];

    return (
        <main>
            <h1 style={{ marginTop: 0 }}>Dashboard</h1>
            <p style={{ color: "#4b5563", marginBottom: "24px" }}>
                Overview of Munjiz OS workspace
            </p>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "16px",
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
        </main>
    );
}