from __future__ import annotations

import importlib
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field


router = APIRouter(prefix="/gap-closure", tags=["Gap Closure"])


def get_database_path() -> Path:
    try:
        db_module = importlib.import_module("app.services.db")
        for attr in ["DB_PATH", "DATABASE_PATH", "DATABASE_FILE", "SQLITE_PATH"]:
            value = getattr(db_module, attr, None)
            if value:
                return Path(value)
    except Exception:
        pass

    return Path(__file__).resolve().parents[2] / "munjiz.db"


def get_connection() -> sqlite3.Connection:
    db_path = get_database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def ensure_gap_tables() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                department TEXT NOT NULL,
                email TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gap_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                requirement_id INTEGER,
                requirement_title TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                owner_role TEXT NOT NULL,
                owner_name TEXT NOT NULL,
                owner_department TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                evidence_instruction TEXT NOT NULL,
                impact_score INTEGER NOT NULL DEFAULT 5,
                due_date TEXT,
                verification_status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
                verification_notes TEXT,
                evidence_note TEXT,
                created_by TEXT NOT NULL DEFAULT 'Gap Assignment Agent',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                closed_at TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gap_task_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        seed_team_members(conn)
        conn.commit()


def seed_team_members(conn: sqlite3.Connection) -> None:
    default_members = [
        {
            "name": "أحمد - مدير المنافسة",
            "role": "tender_manager",
            "title": "مدير المنافسة",
            "department": "إدارة العروض",
            "email": "tender.manager@munjiz.local",
        },
        {
            "name": "سارة - المهندس الفني",
            "role": "technical_engineer",
            "title": "مهندس فني",
            "department": "الفريق الفني",
            "email": "technical.engineer@munjiz.local",
        },
        {
            "name": "خالد - مسؤول المشتريات",
            "role": "procurement_officer",
            "title": "مسؤول المشتريات",
            "department": "المشتريات",
            "email": "procurement@munjiz.local",
        },
        {
            "name": "نورة - مسؤولة الجودة والامتثال",
            "role": "quality_compliance",
            "title": "مسؤول الجودة والامتثال",
            "department": "الجودة والامتثال",
            "email": "quality@munjiz.local",
        },
        {
            "name": "ماجد - مسؤول المشاريع",
            "role": "project_manager",
            "title": "مسؤول المشاريع",
            "department": "إدارة المشاريع",
            "email": "projects@munjiz.local",
        },
        {
            "name": "فيصل - المسؤول المالي",
            "role": "finance_officer",
            "title": "المسؤول المالي",
            "department": "الإدارة المالية",
            "email": "finance@munjiz.local",
        },
        {
            "name": "ريم - مسؤولة المستندات",
            "role": "document_controller",
            "title": "مسؤول المستندات",
            "department": "الوثائق والتسليم",
            "email": "documents@munjiz.local",
        },
    ]

    for member in default_members:
        conn.execute(
            """
            INSERT OR IGNORE INTO team_members
            (name, role, title, department, email, active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (
                member["name"],
                member["role"],
                member["title"],
                member["department"],
                member["email"],
                now_iso(),
            ),
        )


def get_team_member_by_role(conn: sqlite3.Connection, role: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM team_members WHERE role = ? AND active = 1",
        (role,),
    ).fetchone()

    if row:
        return dict(row)

    fallback = conn.execute(
        "SELECT * FROM team_members WHERE role = 'tender_manager' AND active = 1"
    ).fetchone()

    if fallback:
        return dict(fallback)

    return {
        "name": "مدير المنافسة",
        "role": "tender_manager",
        "title": "مدير المنافسة",
        "department": "إدارة العروض",
        "email": None,
    }


def normalize_status(value: str | None) -> str:
    return (value or "").strip().lower()


def is_requirement_covered(status: str | None) -> bool:
    """
    إصلاح مهم:
    لا نعتبر "غير مغطى" مغطى فقط لأنها تحتوي على كلمة "مغطى".
    لذلك نفحص الحالات السلبية أولًا.
    """
    normalized = normalize_status(status)

    if not normalized:
        return False

    negative_words = [
        "غير مغطى",
        "غير مغطاة",
        "غير مكتمل",
        "غير مكتملة",
        "not covered",
        "uncovered",
        "missing",
        "gap",
        "open",
        "pending",
        "needs evidence",
        "needs review",
        "بحاجة",
        "ناقص",
        "ناقصة",
        "مفتوح",
        "مفتوحة",
    ]

    partial_words = [
        "partial",
        "partially",
        "جزئي",
        "جزئية",
        "مغطى جزئيًا",
        "مغطى جزئياً",
    ]

    covered_words = [
        "covered",
        "complete",
        "completed",
        "closed",
        "مغطى",
        "مغطاة",
        "مكتمل",
        "مكتملة",
        "مغلق",
        "مغلقة",
        "جاهز",
        "جاهزة",
    ]

    if any(word in normalized for word in negative_words):
        return False

    if any(word in normalized for word in partial_words):
        return False

    return any(word in normalized for word in covered_words)


def classify_gap(requirement_title: str, category: str | None = None) -> dict[str, Any]:
    text = f"{requirement_title} {category or ''}".lower()

    if any(
        keyword in text
        for keyword in [
            "iso",
            "quality",
            "compliance",
            "cyber",
            "security",
            "شهادة",
            "جودة",
            "امتثال",
            "أمن",
        ]
    ):
        return {
            "owner_role": "quality_compliance",
            "priority": "عالية",
            "evidence_type": "شهادة / سياسة امتثال",
            "impact_score": 10,
            "instruction": "ارفع شهادة سارية أو سياسة معتمدة أو خطاب رسمي يثبت الامتثال المطلوب.",
        }

    if any(
        keyword in text
        for keyword in [
            "authorization",
            "manufacturer",
            "vendor",
            "supplier",
            "distributor",
            "اعتماد",
            "تفويض",
            "مصنع",
            "مورد",
            "وكيل",
        ]
    ):
        return {
            "owner_role": "procurement_officer",
            "priority": "عالية",
            "evidence_type": "خطاب تفويض / اعتماد مورد",
            "impact_score": 10,
            "instruction": "ارفع خطاب تفويض من المصنع أو المورد أو ما يثبت توفر المنتج والدعم والضمان.",
        }

    if any(
        keyword in text
        for keyword in [
            "implementation",
            "methodology",
            "testing",
            "sat",
            "fat",
            "technical",
            "plan",
            "تنفيذ",
            "منهجية",
            "اختبار",
            "تشغيل",
            "فني",
        ]
    ):
        return {
            "owner_role": "technical_engineer",
            "priority": "متوسطة",
            "evidence_type": "خطة فنية / منهجية تنفيذ",
            "impact_score": 7,
            "instruction": "ارفع خطة تنفيذ أو اختبار وتشغيل أو مستند فني يثبت تغطية المتطلب.",
        }

    if any(
        keyword in text
        for keyword in [
            "experience",
            "project",
            "reference",
            "completion",
            "خبرة",
            "سابقة",
            "مشروع",
            "إنجاز",
            "اعمال",
            "أعمال",
        ]
    ):
        return {
            "owner_role": "project_manager",
            "priority": "عالية",
            "evidence_type": "سابقة أعمال / شهادة إنجاز",
            "impact_score": 9,
            "instruction": "ارفع شهادة إنجاز أو سابقة أعمال مشابهة تثبت قدرة الشركة على تنفيذ هذا المتطلب.",
        }

    if any(
        keyword in text
        for keyword in [
            "financial",
            "guarantee",
            "bank",
            "price",
            "ضمان",
            "مالي",
            "بنك",
            "تسعير",
            "سعر",
        ]
    ):
        return {
            "owner_role": "finance_officer",
            "priority": "عالية",
            "evidence_type": "مستند مالي / ضمان",
            "impact_score": 8,
            "instruction": "ارفع المستند المالي المطلوب مثل الضمان أو خطاب البنك أو ما يثبت الجاهزية المالية.",
        }

    if any(
        keyword in text
        for keyword in [
            "document",
            "attachment",
            "form",
            "ملف",
            "مستند",
            "مرفق",
            "نموذج",
        ]
    ):
        return {
            "owner_role": "document_controller",
            "priority": "متوسطة",
            "evidence_type": "مستند مطلوب",
            "impact_score": 6,
            "instruction": "ارفع المستند المطلوب أو النموذج المكتمل حسب كراسة المنافسة.",
        }

    return {
        "owner_role": "tender_manager",
        "priority": "متوسطة",
        "evidence_type": "دليل داعم",
        "impact_score": 5,
        "instruction": "راجع المتطلب وحدد الدليل المناسب لإغلاق الفجوة.",
    }


def fetch_tender_or_404(conn: sqlite3.Connection, tender_id: int) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM tenders WHERE id = ?",
        (tender_id,),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Tender not found")

    return dict(row)


def fetch_requirements(conn: sqlite3.Connection, tender_id: int) -> list[dict[str, Any]]:
    try:
        rows = conn.execute(
            """
            SELECT *
            FROM requirements
            WHERE tender_id = ?
            ORDER BY id ASC
            """,
            (tender_id,),
        ).fetchall()
        return rows_to_list(rows)
    except sqlite3.OperationalError:
        return []


def create_task_event(conn: sqlite3.Connection, task_id: int, event_type: str, message: str) -> None:
    conn.execute(
        """
        INSERT INTO gap_task_events (task_id, event_type, message, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (task_id, event_type, message, now_iso()),
    )


def build_tasks_summary(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(tasks)
    open_count = len([task for task in tasks if task.get("status") == "OPEN"])
    in_progress_count = len([task for task in tasks if task.get("status") == "IN_PROGRESS"])
    waiting_review_count = len([task for task in tasks if task.get("status") == "WAITING_REVIEW"])
    closed_count = len([task for task in tasks if task.get("status") == "CLOSED"])
    blocked_count = len([task for task in tasks if task.get("status") == "BLOCKED"])
    high_priority_open = len(
        [
            task
            for task in tasks
            if task.get("priority") == "عالية" and task.get("status") != "CLOSED"
        ]
    )

    total_impact = sum(int(task.get("impact_score") or 0) for task in tasks)
    closed_impact = sum(
        int(task.get("impact_score") or 0)
        for task in tasks
        if task.get("status") == "CLOSED"
    )

    closure_score = 100
    if total_impact > 0:
        closure_score = round((closed_impact / total_impact) * 100)

    if total == 0:
        decision = "لا توجد مهام فجوات"
        recommendation = "شغّل توليد مهام الفجوات بعد استخراج المتطلبات."
    elif high_priority_open > 0:
        decision = "دخول مشروط"
        recommendation = f"أغلق {high_priority_open} فجوة عالية التأثير قبل اعتماد التقديم."
    elif closure_score >= 85:
        decision = "جاهز للتقديم"
        recommendation = "الفجوات الحرجة مغلقة. راجع مذكرة القرار النهائية."
    else:
        decision = "قيد التجهيز"
        recommendation = "استكمل المهام المفتوحة ثم أعد التحقق."

    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress_count,
        "waiting_review": waiting_review_count,
        "closed": closed_count,
        "blocked": blocked_count,
        "high_priority_open": high_priority_open,
        "closure_score": closure_score,
        "decision": decision,
        "recommendation": recommendation,
    }


class TaskUpdateRequest(BaseModel):
    status: Optional[str] = None
    owner_role: Optional[str] = None
    priority: Optional[str] = None
    evidence_note: Optional[str] = None
    verification_notes: Optional[str] = None


class VerifyTaskRequest(BaseModel):
    evidence_note: str = Field(..., min_length=3)


@router.on_event("startup")
def startup_gap_closure() -> None:
    ensure_gap_tables()


@router.get("/team")
def list_team_members() -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM team_members
            WHERE active = 1
            ORDER BY id ASC
            """
        ).fetchall()

    return {"team": rows_to_list(rows)}


@router.get("/tasks")
def list_gap_tasks(
    tender_id: Optional[int] = Query(default=None),
    owner_role: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    ensure_gap_tables()

    conditions: list[str] = []
    params: list[Any] = []

    if tender_id is not None:
        conditions.append("tender_id = ?")
        params.append(tender_id)

    if owner_role:
        conditions.append("owner_role = ?")
        params.append(owner_role)

    if status:
        conditions.append("status = ?")
        params.append(status)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM gap_tasks
            {where_clause}
            ORDER BY
                CASE priority
                    WHEN 'عالية' THEN 1
                    WHEN 'متوسطة' THEN 2
                    ELSE 3
                END,
                id DESC
            """,
            params,
        ).fetchall()

    return {"tasks": rows_to_list(rows)}


@router.get("/workbench/{owner_role}")
def employee_workbench(owner_role: str) -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        member = get_team_member_by_role(conn, owner_role)

        rows = conn.execute(
            """
            SELECT *
            FROM gap_tasks
            WHERE owner_role = ?
            ORDER BY
                CASE status
                    WHEN 'OPEN' THEN 1
                    WHEN 'IN_PROGRESS' THEN 2
                    WHEN 'WAITING_REVIEW' THEN 3
                    WHEN 'CLOSED' THEN 4
                    ELSE 5
                END,
                CASE priority
                    WHEN 'عالية' THEN 1
                    WHEN 'متوسطة' THEN 2
                    ELSE 3
                END,
                id DESC
            """,
            (owner_role,),
        ).fetchall()

        tasks = rows_to_list(rows)

    return {
        "member": member,
        "tasks": tasks,
        "summary": build_tasks_summary(tasks),
    }


@router.post("/tenders/{tender_id}/generate")
def generate_gap_tasks(tender_id: int) -> dict[str, Any]:
    ensure_gap_tables()

    created_tasks: list[dict[str, Any]] = []
    skipped_tasks: list[dict[str, Any]] = []

    with get_connection() as conn:
        tender = fetch_tender_or_404(conn, tender_id)
        requirements = fetch_requirements(conn, tender_id)

        if not requirements:
            raise HTTPException(
                status_code=400,
                detail="No requirements found for this tender. Extract or create requirements first.",
            )

        due_date = (datetime.utcnow() + timedelta(days=3)).date().isoformat()

        for requirement in requirements:
            status = requirement.get("status")

            if is_requirement_covered(status):
                skipped_tasks.append(
                    {
                        "requirement_id": requirement.get("id"),
                        "status": status,
                        "reason": "Requirement already covered",
                    }
                )
                continue

            requirement_id = requirement.get("id")
            title = requirement.get("title") or "متطلب بدون عنوان"
            category = requirement.get("category") or "عام"

            existing = conn.execute(
                """
                SELECT *
                FROM gap_tasks
                WHERE tender_id = ?
                  AND requirement_id = ?
                  AND status != 'CLOSED'
                """,
                (tender_id, requirement_id),
            ).fetchone()

            if existing:
                skipped_tasks.append(
                    {
                        "requirement_id": requirement_id,
                        "status": status,
                        "reason": "Open task already exists",
                    }
                )
                continue

            classification = classify_gap(title, category)
            member = get_team_member_by_role(conn, classification["owner_role"])

            task_title = f"طلب دليل: {title[:90]}"
            task_description = (
                f"تم اكتشاف فجوة في المنافسة: {tender.get('title', '')}. "
                f"المتطلب يحتاج دليلًا قبل اعتماد قرار التقديم. "
                f"التصنيف: {category}. "
                f"حالة المتطلب الحالية: {status or 'غير محددة'}. "
                f"الإجراء المطلوب: {classification['instruction']}"
            )

            cursor = conn.execute(
                """
                INSERT INTO gap_tasks (
                    tender_id,
                    requirement_id,
                    requirement_title,
                    title,
                    description,
                    owner_role,
                    owner_name,
                    owner_department,
                    priority,
                    status,
                    evidence_type,
                    evidence_instruction,
                    impact_score,
                    due_date,
                    verification_status,
                    created_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 'NOT_SUBMITTED', 'Gap Assignment Agent', ?, ?)
                """,
                (
                    tender_id,
                    requirement_id,
                    title,
                    task_title,
                    task_description,
                    member["role"],
                    member["name"],
                    member["department"],
                    classification["priority"],
                    classification["evidence_type"],
                    classification["instruction"],
                    classification["impact_score"],
                    due_date,
                    now_iso(),
                    now_iso(),
                ),
            )

            task_id = int(cursor.lastrowid)
            create_task_event(
                conn,
                task_id,
                "TASK_CREATED",
                f"تم إنشاء مهمة فجوة للمتطلب رقم {requirement_id} وإسنادها إلى {member['title']}.",
            )

            created_row = conn.execute(
                "SELECT * FROM gap_tasks WHERE id = ?",
                (task_id,),
            ).fetchone()

            if created_row:
                created_tasks.append(dict(created_row))

        conn.commit()

    return {
        "message": "Gap tasks generated successfully",
        "tender_id": tender_id,
        "created_count": len(created_tasks),
        "skipped_count": len(skipped_tasks),
        "created_tasks": created_tasks,
        "skipped_tasks": skipped_tasks,
    }


@router.patch("/tasks/{task_id}")
def update_gap_task(task_id: int, payload: TaskUpdateRequest) -> dict[str, Any]:
    ensure_gap_tables()

    allowed_statuses = {"OPEN", "IN_PROGRESS", "WAITING_REVIEW", "CLOSED", "BLOCKED"}

    with get_connection() as conn:
        task = conn.execute(
            "SELECT * FROM gap_tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        updates: list[str] = []
        params: list[Any] = []
        event_messages: list[str] = []

        if payload.status is not None:
            if payload.status not in allowed_statuses:
                raise HTTPException(status_code=400, detail="Invalid task status")

            updates.append("status = ?")
            params.append(payload.status)

            if payload.status == "CLOSED":
                updates.append("closed_at = ?")
                params.append(now_iso())

            event_messages.append(f"تم تحديث حالة المهمة إلى {payload.status}.")

        if payload.owner_role is not None:
            member = get_team_member_by_role(conn, payload.owner_role)
            updates.extend(["owner_role = ?", "owner_name = ?", "owner_department = ?"])
            params.extend([member["role"], member["name"], member["department"]])
            event_messages.append(f"تم تغيير مالك المهمة إلى {member['title']}.")

        if payload.priority is not None:
            updates.append("priority = ?")
            params.append(payload.priority)
            event_messages.append(f"تم تعديل أولوية المهمة إلى {payload.priority}.")

        if payload.evidence_note is not None:
            updates.append("evidence_note = ?")
            params.append(payload.evidence_note)
            updates.append("verification_status = ?")
            params.append("SUBMITTED")
            event_messages.append("تم رفع ملاحظة/دليل للمهمة وأصبحت بانتظار المراجعة.")

        if payload.verification_notes is not None:
            updates.append("verification_notes = ?")
            params.append(payload.verification_notes)
            event_messages.append("تم تحديث ملاحظات التحقق.")

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updates.append("updated_at = ?")
        params.append(now_iso())
        params.append(task_id)

        conn.execute(
            f"""
            UPDATE gap_tasks
            SET {", ".join(updates)}
            WHERE id = ?
            """,
            params,
        )

        for message in event_messages:
            create_task_event(conn, task_id, "TASK_UPDATED", message)

        conn.commit()

        updated = conn.execute(
            "SELECT * FROM gap_tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

    return {"message": "Task updated", "task": row_to_dict(updated)}


@router.post("/tasks/{task_id}/verify")
def verify_gap_task(task_id: int, payload: VerifyTaskRequest) -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        task = conn.execute(
            "SELECT * FROM gap_tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        evidence_note = payload.evidence_note.strip()

        if len(evidence_note) >= 15:
            verification_status = "ACCEPTED"
            status = "CLOSED"
            verification_notes = (
                "تم قبول الدليل مبدئيًا في نسخة الديمو. "
                "في النسخة المتقدمة سيتم التحقق من الملف وربطه بمصدره الفعلي."
            )
            closed_at = now_iso()
            event_message = "تم قبول الدليل وإغلاق الفجوة."
        else:
            verification_status = "REJECTED"
            status = "WAITING_REVIEW"
            verification_notes = "الدليل غير كافٍ. يلزم رفع مستند أو وصف أوضح."
            closed_at = None
            event_message = "تم رفض الدليل لأنه غير كافٍ."

        conn.execute(
            """
            UPDATE gap_tasks
            SET
                evidence_note = ?,
                verification_status = ?,
                verification_notes = ?,
                status = ?,
                closed_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                evidence_note,
                verification_status,
                verification_notes,
                status,
                closed_at,
                now_iso(),
                task_id,
            ),
        )

        create_task_event(conn, task_id, "TASK_VERIFIED", event_message)
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM gap_tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

    return {
        "message": event_message,
        "task": row_to_dict(updated),
    }


@router.get("/tasks/{task_id}/events")
def list_task_events(task_id: int) -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM gap_task_events
            WHERE task_id = ?
            ORDER BY id ASC
            """,
            (task_id,),
        ).fetchall()

    return {"events": rows_to_list(rows)}


@router.get("/tenders/{tender_id}/summary")
def tender_gap_summary(tender_id: int) -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        fetch_tender_or_404(conn, tender_id)

        rows = conn.execute(
            """
            SELECT *
            FROM gap_tasks
            WHERE tender_id = ?
            """,
            (tender_id,),
        ).fetchall()

    tasks = rows_to_list(rows)

    return {
        "tender_id": tender_id,
        "summary": build_tasks_summary(tasks),
    }


@router.delete("/tenders/{tender_id}/tasks")
def delete_tender_gap_tasks(tender_id: int) -> dict[str, Any]:
    ensure_gap_tables()

    with get_connection() as conn:
        fetch_tender_or_404(conn, tender_id)

        task_rows = conn.execute(
            "SELECT id FROM gap_tasks WHERE tender_id = ?",
            (tender_id,),
        ).fetchall()

        task_ids = [int(row["id"]) for row in task_rows]

        if task_ids:
            placeholders = ",".join(["?"] * len(task_ids))
            conn.execute(
                f"DELETE FROM gap_task_events WHERE task_id IN ({placeholders})",
                task_ids,
            )

        conn.execute(
            "DELETE FROM gap_tasks WHERE tender_id = ?",
            (tender_id,),
        )

        conn.commit()

    return {
        "message": "Tender gap tasks deleted",
        "tender_id": tender_id,
        "deleted_count": len(task_ids),
    }