from pathlib import Path
from datetime import datetime
import sqlite3

DB_PATH = Path(__file__).resolve().parents[2] / "munjiz.db"

INITIAL_TENDERS = [
    (
        1,
        "Network Infrastructure Upgrade",
        "Ministry of Digital Transformation",
        "UNDER_REVIEW",
        62,
        "Upgrade core and access network infrastructure across multiple sites.",
        "2026-05-15",
    ),
    (
        2,
        "Security Operations Center Expansion",
        "National Utilities Company",
        "BID_IN_PROGRESS",
        78,
        "Expand the SOC environment with monitoring, integration, and response tooling.",
        "2026-05-22",
    ),
    (
        3,
        "Smart Campus ELV Deployment",
        "Future University",
        "CONDITIONAL_BID",
        48,
        "Deploy integrated ELV systems for a smart campus environment.",
        "2026-06-01",
    ),
]

INITIAL_REQUIREMENTS = [
    (101, 1, "وجود مهندس شبكات معتمد", "فني", "عالية", "مغطى جزئيًا"),
    (102, 1, "تقديم سابقة أعمال مشابهة خلال آخر 5 سنوات", "خبرات", "عالية", "مغطى"),
    (103, 1, "شهادة ISO 27001 سارية", "شهادات", "متوسطة", "غير مغطى"),

    (201, 2, "فريق تشغيل مركز عمليات أمنية 24/7", "تشغيل", "عالية", "مغطى جزئيًا"),
    (202, 2, "تكامل مع أدوات SIEM و SOAR", "تقني", "عالية", "مغطى"),

    (301, 3, "خبرة في أنظمة ELV للمجمعات التعليمية", "خبرات", "عالية", "غير مغطى"),
    (302, 3, "تقديم خطة تنفيذ متكاملة", "إداري", "متوسطة", "مغطى جزئيًا"),
]

INITIAL_COMPANY_RESOURCES = [
    (
        1,
        "مهندس شبكات معتمد",
        "employee",
        "فني",
        "مهندس شبكات ضمن الفريق الفني لديه خبرة في تصميم وتنفيذ وتشغيل الشبكات، إعداد السويتشات، VLAN، الربط بين المواقع، ومعالجة الأعطال الفنية.",
        "مهندس شبكات,شبكات,Network Engineer,Cisco,Switching,Routing,VLAN,CCNA,CCNP",
        "الفريق الفني",
        "active",
        None,
        "يمكن استخدام السيرة الذاتية والشهادات المهنية كدليل لتغطية متطلبات وجود مهندس شبكات معتمد.",
    ),
    (
        2,
        "خبرة مشروع ELV لمجمع تعليمي",
        "project_experience",
        "خبرات",
        "خبرة سابقة في تنفيذ أنظمة ELV لبيئة تعليمية تشمل كاميرات المراقبة، التحكم بالدخول، الشبكات، الأنظمة السمعية والبصرية، الاختبار والتشغيل والتسليم.",
        "ELV,تيار خفيف,مجمع تعليمي,جامعة,Campus,CCTV,Access Control,AV,Network",
        "فريق تطوير الأعمال",
        "active",
        None,
        "يمكن استخدام خطاب إنجاز أو عقد أو شهادة إتمام مشروع مشابه كدليل داعم.",
    ),
    (
        3,
        "شهادة ISO 27001 سارية",
        "certification",
        "شهادات",
        "شهادة ISO 27001 خاصة بنظام إدارة أمن المعلومات، يمكن استخدامها عند طلب شهادات امتثال أو أمن معلومات ضمن المنافسة.",
        "ISO 27001,Information Security,ISMS,شهادة,أمن معلومات,امتثال",
        "فريق الجودة والامتثال",
        "active",
        "2027-12-31",
        "يجب إرفاق نسخة الشهادة السارية وتاريخ صلاحيتها عند استخدامها كدليل.",
    ),
    (
        4,
        "قالب خطة تنفيذ متكاملة",
        "template",
        "إداري",
        "قالب خطة تنفيذ يغطي مراحل التنفيذ، منهجية الأعمال، الجدول الزمني، الموارد، المخاطر، الاختبار والتشغيل، التسليم، ومعايير القبول.",
        "خطة تنفيذ,منهجية,جدول زمني,PMO,Project Plan,Implementation Plan,Testing,Acceptance",
        "إدارة المشروع",
        "active",
        None,
        "يمكن تحديث القالب باسم المنافسة وتحويله إلى مستند داعم لتغطية متطلب خطة التنفيذ.",
    ),
    (
        5,
        "منتجات Cisco Switching",
        "product",
        "تقني",
        "قدرة الشركة على توريد وتنفيذ حلول Cisco Switching مثل Core Switches وDistribution Switches وAccess Switches للشبكات المؤسسية.",
        "Cisco,Switch,Core Switch,Distribution Switch,Access Switch,Catalyst,Network Infrastructure",
        "الفريق التقني",
        "active",
        None,
        "يمكن دعم هذا المورد بداتا شيت رسمية أو عرض مصنع أو خطاب شريك معتمد.",
    ),
    (
        6,
        "قدرة تشغيل ودعم 24/7",
        "capability",
        "تشغيل",
        "توفر الشركة قدرة تشغيل ودعم ومتابعة للحلول التقنية على مدار الساعة حسب متطلبات عقود التشغيل والصيانة.",
        "24/7,NOC,Support,Monitoring,Operation,تشغيل,دعم,مراقبة",
        "فريق التشغيل",
        "active",
        None,
        "يمكن دعم القدرة بخطة تشغيل، هيكل فريق، أو SLA.",
    ),
    (
        7,
        "شراكات وموردون معتمدون",
        "partner",
        "توريد",
        "وجود شبكة شركاء وموردين معتمدين يمكن استخدامها لدعم التوريد، الضمان، الدعم الفني، وتوفير خطابات المصنع عند الحاجة.",
        "Partner,Distributor,Vendor,Manufacturer Authorization,شريك,مورد,خطاب مصنع",
        "إدارة الموردين",
        "active",
        None,
        "يمكن استخدام خطابات التفويض أو عروض الموردين أو شهادات الشراكة كدليل.",
    ),
    (
        8,
        "خبرة مشاريع كاميرات مراقبة وأنظمة أمنية",
        "project_experience",
        "خبرات",
        "خبرة في توريد وتركيب وتشغيل أنظمة كاميرات المراقبة، التخزين، الشبكات الداعمة، والاختبار والتسليم.",
        "CCTV,Surveillance,Security Cameras,NVR,Storage,أنظمة أمنية,كاميرات مراقبة",
        "فريق تطوير الأعمال",
        "active",
        None,
        "يمكن ربط هذا المورد بمتطلبات الخبرة الأمنية أو مشاريع المراقبة.",
    ),
]


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_column(cur, table_name: str, column_name: str, column_definition: str):
    existing_columns = {
        row[1]
        for row in cur.execute(f"PRAGMA table_info({table_name})").fetchall()
    }

    if column_name not in existing_columns:
        cur.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tenders (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            client TEXT NOT NULL,
            status TEXT NOT NULL,
            readiness_score INTEGER NOT NULL,
            description TEXT NOT NULL,
            submission_deadline TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS requirements (
            id INTEGER PRIMARY KEY,
            tender_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            tender_id INTEGER NOT NULL,
            linked_requirement_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            owner TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT NOT NULL,
            category TEXT NOT NULL,
            source TEXT,
            FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tender_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tender_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT,
            extraction_status TEXT NOT NULL DEFAULT 'pending',
            extracted_text TEXT,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS task_evidence_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            tender_id INTEGER NOT NULL,
            linked_requirement_id INTEGER NOT NULL,
            document_id INTEGER,
            evidence_text TEXT,
            verification_status TEXT NOT NULL,
            coverage_status TEXT NOT NULL,
            confidence TEXT NOT NULL,
            matched_keywords TEXT,
            decision_reason TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
            FOREIGN KEY (document_id) REFERENCES tender_documents(id) ON DELETE SET NULL
        )
        """
    )

    # Company Memory: central resource database used later by the LLM Reasoning Layer.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS company_resources (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            keywords TEXT NOT NULL,
            owner TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            valid_until TEXT,
            evidence_note TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    # Documents that support company resources.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            document_name TEXT NOT NULL,
            document_type TEXT NOT NULL,
            file_path TEXT,
            mime_type TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (resource_id) REFERENCES company_resources(id) ON DELETE CASCADE
        )
        """
    )

    # Capabilities make resources easier to match with tender requirements.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_capabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            capability_key TEXT NOT NULL,
            capability_label TEXT NOT NULL,
            capability_description TEXT NOT NULL,
            confidence TEXT NOT NULL DEFAULT 'متوسطة',
            keywords TEXT,
            FOREIGN KEY (resource_id) REFERENCES company_resources(id) ON DELETE CASCADE
        )
        """
    )

    # Future-ready table for saving resource-to-requirement reasoning results.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_requirement_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tender_id INTEGER NOT NULL,
            requirement_id INTEGER NOT NULL,
            resource_id INTEGER NOT NULL,
            match_status TEXT NOT NULL,
            confidence TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            recommended_action TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
            FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
            FOREIGN KEY (resource_id) REFERENCES company_resources(id) ON DELETE CASCADE
        )
        """
    )

    # Lightweight task-level evidence state for fast UI reads.
    ensure_column(cur, "tasks", "evidence_required", "TEXT DEFAULT 'no'")
    ensure_column(cur, "tasks", "evidence_status", "TEXT DEFAULT 'not_required'")
    ensure_column(cur, "tasks", "verified_document_id", "INTEGER")
    ensure_column(cur, "tasks", "verified_at", "TEXT")
    ensure_column(cur, "tasks", "last_verification_reason", "TEXT")

    # Useful indexes for repeated dashboard reads.
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_task_evidence_task_id
        ON task_evidence_submissions(task_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_task_evidence_tender_requirement
        ON task_evidence_submissions(tender_id, linked_requirement_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_tender_documents_tender
        ON tender_documents(tender_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_tasks_tender_requirement
        ON tasks(tender_id, linked_requirement_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_company_resources_type_category
        ON company_resources(resource_type, category)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_company_resources_status
        ON company_resources(status)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_resource_documents_resource
        ON resource_documents(resource_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_resource_capabilities_resource
        ON resource_capabilities(resource_id)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_resource_matches_tender_requirement
        ON resource_requirement_matches(tender_id, requirement_id)
        """
    )

    tenders_count = cur.execute("SELECT COUNT(*) FROM tenders").fetchone()[0]
    if tenders_count == 0:
        cur.executemany(
            """
            INSERT INTO tenders
            (id, title, client, status, readiness_score, description, submission_deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            INITIAL_TENDERS,
        )

    requirements_count = cur.execute("SELECT COUNT(*) FROM requirements").fetchone()[0]
    if requirements_count == 0:
        cur.executemany(
            """
            INSERT INTO requirements
            (id, tender_id, title, category, priority, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            INITIAL_REQUIREMENTS,
        )

    resources_count = cur.execute("SELECT COUNT(*) FROM company_resources").fetchone()[0]
    if resources_count == 0:
        created_at = datetime.utcnow().isoformat()
        cur.executemany(
            """
            INSERT INTO company_resources
            (
                id,
                name,
                resource_type,
                category,
                description,
                keywords,
                owner,
                status,
                valid_until,
                evidence_note,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (*resource, created_at)
                for resource in INITIAL_COMPANY_RESOURCES
            ],
        )

    capabilities_count = cur.execute(
        "SELECT COUNT(*) FROM resource_capabilities"
    ).fetchone()[0]

    if capabilities_count == 0:
        cur.executemany(
            """
            INSERT INTO resource_capabilities
            (
                resource_id,
                capability_key,
                capability_label,
                capability_description,
                confidence,
                keywords
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    1,
                    "network_engineering",
                    "تغطية متطلبات مهندس شبكات",
                    "يدعم المتطلبات التي تطلب وجود مهندس شبكات أو خبرة في الشبكات والبنية التحتية.",
                    "عالية",
                    "مهندس شبكات,شبكات,Cisco,Network Engineer",
                ),
                (
                    2,
                    "elv_education_experience",
                    "تغطية خبرة ELV تعليمية",
                    "يدعم المتطلبات التي تطلب خبرة في أنظمة ELV أو التيار الخفيف للمجمعات التعليمية.",
                    "عالية",
                    "ELV,جامعة,مجمع تعليمي,تيار خفيف",
                ),
                (
                    3,
                    "iso_27001_compliance",
                    "تغطية متطلبات ISO 27001",
                    "يدعم المتطلبات التي تطلب شهادة ISO 27001 أو امتثال أمن معلومات.",
                    "عالية",
                    "ISO 27001,أمن معلومات,امتثال",
                ),
                (
                    4,
                    "implementation_plan",
                    "تغطية خطة التنفيذ",
                    "يدعم المتطلبات التي تطلب خطة تنفيذ، منهجية أعمال، جدول زمني، أو خطة اختبار وتسليم.",
                    "عالية",
                    "خطة تنفيذ,منهجية,جدول زمني,اختبار,تسليم",
                ),
                (
                    5,
                    "network_products",
                    "تغطية منتجات الشبكات",
                    "يدعم المتطلبات التقنية المتعلقة بسويتشات Cisco والبنية التحتية للشبكات.",
                    "متوسطة",
                    "Cisco,Switch,Network Infrastructure",
                ),
                (
                    6,
                    "operation_support",
                    "تغطية التشغيل والدعم",
                    "يدعم متطلبات التشغيل والدعم والمراقبة على مدار الساعة.",
                    "متوسطة",
                    "24/7,NOC,تشغيل,دعم",
                ),
            ],
        )

    # Mark existing evidence-gap tasks as requiring evidence, without changing legacy suggested tasks.
    cur.execute(
        """
        UPDATE tasks
        SET evidence_required = 'yes',
            evidence_status = CASE
                WHEN status = 'مكتملة' THEN 'accepted'
                ELSE COALESCE(NULLIF(evidence_status, 'not_required'), 'required')
            END
        WHERE
            id LIKE 'DOC-GAP-%'
            OR id LIKE 'EAP-%'
            OR source LIKE '%فجوات المستند%'
            OR source LIKE '%خطة إغلاق فجوات%'
        """
    )

    conn.commit()
    conn.close()