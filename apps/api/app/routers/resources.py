import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.db import get_connection


router = APIRouter(prefix="/resources", tags=["resources"])

RESOURCE_DOCUMENTS_DIR = (
    Path(__file__).resolve().parents[2] / "uploads" / "resource_documents"
)
RESOURCE_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)


class CompanyResourceCreateRequest(BaseModel):
    name: str = Field(..., min_length=2)
    resource_type: str = Field(..., min_length=2)
    category: str = Field(..., min_length=2)
    description: str = Field(..., min_length=5)
    keywords: str = Field(..., min_length=2)
    owner: str = Field(..., min_length=2)
    status: str = "active"
    valid_until: Optional[str] = None
    evidence_note: Optional[str] = None


def find_resource_or_404(conn, resource_id: int):
    resource = conn.execute(
        """
        SELECT *
        FROM company_resources
        WHERE id = ?
        """,
        (resource_id,),
    ).fetchone()

    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    return dict(resource)


def get_resource_documents(conn, resource_id: int):
    rows = conn.execute(
        """
        SELECT *
        FROM resource_documents
        WHERE resource_id = ?
        ORDER BY id DESC
        """,
        (resource_id,),
    ).fetchall()

    return [dict(row) for row in rows]


def get_resource_capabilities(conn, resource_id: int):
    rows = conn.execute(
        """
        SELECT *
        FROM resource_capabilities
        WHERE resource_id = ?
        ORDER BY id
        """,
        (resource_id,),
    ).fetchall()

    return [dict(row) for row in rows]


def normalize_matching_text(value: Optional[str]) -> str:
    if not value:
        return ""

    text = value.lower()

    replacements = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ـ": "",
        ",": " ",
        "،": " ",
        "/": " ",
        "-": " ",
        "_": " ",
        ".": " ",
        ":": " ",
        ";": " ",
        "(": " ",
        ")": " ",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_matching_terms(*values: Optional[str]):
    combined = normalize_matching_text(" ".join([value or "" for value in values]))

    stop_words = {
        "في",
        "من",
        "على",
        "الى",
        "إلى",
        "عن",
        "مع",
        "او",
        "أو",
        "و",
        "ال",
        "هذا",
        "هذه",
        "ذلك",
        "تقديم",
        "وجود",
        "ضمن",
        "خلال",
        "اخر",
        "آخر",
        "سنه",
        "سنوات",
        "رقم",
        "متطلب",
        "مطلوب",
    }

    terms = []
    for term in combined.split():
        clean_term = term.strip()
        if len(clean_term) < 3:
            continue
        if clean_term in stop_words:
            continue
        if clean_term not in terms:
            terms.append(clean_term)

    return terms


def calculate_resource_match_score(requirement, resource, capabilities, documents_count):
    requirement_title = requirement["title"]
    requirement_category = requirement["category"]
    requirement_priority = requirement["priority"]

    requirement_terms = extract_matching_terms(
        requirement_title,
        requirement_category,
        requirement_priority,
    )

    resource_terms = extract_matching_terms(
        resource["name"],
        resource["description"],
        resource["keywords"],
        resource["category"],
        resource["owner"],
    )

    capability_terms = []
    for capability in capabilities:
        capability_terms.extend(
            extract_matching_terms(
                capability.get("capability_label"),
                capability.get("capability_description"),
                capability.get("keywords"),
            )
        )

    all_resource_terms = set(resource_terms + capability_terms)

    matched_terms = []
    for term in requirement_terms:
        if term in all_resource_terms:
            matched_terms.append(term)

    score = 0
    reasons = []

    if requirement["category"] == resource["category"]:
        score += 25
        reasons.append("نفس تصنيف المتطلب")

    if resource["status"] == "active":
        score += 10
        reasons.append("المورد نشط داخل قاعدة موارد الشركة")

    if matched_terms:
        keyword_score = min(len(matched_terms) * 12, 36)
        score += keyword_score
        reasons.append("تطابق كلمات مفتاحية: " + ", ".join(matched_terms[:8]))

    normalized_requirement_title = normalize_matching_text(requirement_title)
    normalized_resource_name = normalize_matching_text(resource["name"])
    normalized_resource_description = normalize_matching_text(resource["description"])

    if normalized_requirement_title in normalized_resource_name:
        score += 30
        reasons.append("اسم المورد يغطي نص المتطلب مباشرة")

    elif normalized_resource_name in normalized_requirement_title:
        score += 25
        reasons.append("اسم المورد مذكور ضمن المتطلب")

    elif any(
        important_word in normalized_resource_description
        for important_word in requirement_terms[:5]
    ):
        score += 12
        reasons.append("وصف المورد يحتوي على مؤشرات مرتبطة بالمتطلب")

    if capabilities:
        score += 8
        reasons.append("للمورد قدرات معرفة مرتبطة يمكن استخدامها في المطابقة")

    if documents_count > 0:
        score += 15
        reasons.append("يوجد مستند داعم مرتبط بالمورد")

    if requirement_priority == "عالية":
        score += 4
        reasons.append("المتطلب عالي الأولوية وتم رفع حساسية المطابقة")

    score = min(score, 100)

    if score >= 75:
        confidence = "عالية"
    elif score >= 45:
        confidence = "متوسطة"
    elif score >= 25:
        confidence = "منخفضة"
    else:
        confidence = "ضعيفة"

    if documents_count > 0 and score >= 45:
        evidence_status = "قابل للاستخدام كدليل"
        recommended_action = "استخدم هذا المورد مع مستنداته الداعمة لإغلاق الفجوة أو دعم المتطلب."
    elif documents_count == 0 and score >= 45:
        evidence_status = "مطابق لكن يحتاج مستند داعم"
        recommended_action = "ارفع مستندًا داعمًا لهذا المورد قبل استخدامه كدليل في المنافسة."
    else:
        evidence_status = "غير كافٍ"
        recommended_action = "لا تستخدم هذا المورد كدليل أساسي إلا بعد تقوية بياناته أو رفع مستندات داعمة."

    return {
        "score": score,
        "confidence": confidence,
        "matched_terms": matched_terms,
        "reasons": reasons,
        "evidence_status": evidence_status,
        "recommended_action": recommended_action,
    }


@router.get("")
def list_company_resources(
    resource_type: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    conn = get_connection()

    filters = []
    params = []

    if resource_type:
        filters.append("resource_type = ?")
        params.append(resource_type)

    if category:
        filters.append("category = ?")
        params.append(category)

    if status:
        filters.append("status = ?")
        params.append(status)

    if q:
        filters.append(
            """
            (
                name LIKE ?
                OR description LIKE ?
                OR keywords LIKE ?
                OR owner LIKE ?
                OR category LIKE ?
            )
            """
        )
        search_value = f"%{q}%"
        params.extend(
            [
                search_value,
                search_value,
                search_value,
                search_value,
                search_value,
            ]
        )

    where_clause = ""
    if filters:
        where_clause = "WHERE " + " AND ".join(filters)

    rows = conn.execute(
        f"""
        SELECT *
        FROM company_resources
        {where_clause}
        ORDER BY
            CASE status
                WHEN 'active' THEN 1
                ELSE 2
            END,
            id
        """,
        params,
    ).fetchall()

    resources = []
    for row in rows:
        resource = dict(row)
        resource["capabilities"] = get_resource_capabilities(conn, resource["id"])
        resource["documents_count"] = conn.execute(
            """
            SELECT COUNT(*)
            FROM resource_documents
            WHERE resource_id = ?
            """,
            (resource["id"],),
        ).fetchone()[0]
        resources.append(resource)

    conn.close()

    return {
        "count": len(resources),
        "resources": resources,
    }


@router.get("/summary")
def get_company_resources_summary():
    conn = get_connection()

    total_count = conn.execute("SELECT COUNT(*) FROM company_resources").fetchone()[0]

    active_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM company_resources
        WHERE status = 'active'
        """
    ).fetchone()[0]

    by_type_rows = conn.execute(
        """
        SELECT resource_type, COUNT(*) AS count
        FROM company_resources
        GROUP BY resource_type
        ORDER BY count DESC
        """
    ).fetchall()

    by_category_rows = conn.execute(
        """
        SELECT category, COUNT(*) AS count
        FROM company_resources
        GROUP BY category
        ORDER BY count DESC
        """
    ).fetchall()

    documents_count = conn.execute("SELECT COUNT(*) FROM resource_documents").fetchone()[0]

    capabilities_count = conn.execute(
        "SELECT COUNT(*) FROM resource_capabilities"
    ).fetchone()[0]

    conn.close()

    return {
        "total_resources": total_count,
        "active_resources": active_count,
        "documents_count": documents_count,
        "capabilities_count": capabilities_count,
        "by_type": [dict(row) for row in by_type_rows],
        "by_category": [dict(row) for row in by_category_rows],
    }


@router.get("/search/matches")
def search_company_resources_for_requirement(
    requirement_text: str,
    category: Optional[str] = None,
):
    conn = get_connection()

    search_words = [
        word.strip()
        for word in requirement_text.replace("،", " ").replace(",", " ").split()
        if len(word.strip()) >= 3
    ]

    filters = []
    params = []

    if category:
        filters.append("category = ?")
        params.append(category)

    if search_words:
        keyword_filters = []
        for word in search_words:
            keyword_filters.append(
                """
                (
                    name LIKE ?
                    OR description LIKE ?
                    OR keywords LIKE ?
                    OR category LIKE ?
                )
                """
            )
            value = f"%{word}%"
            params.extend([value, value, value, value])

        filters.append("(" + " OR ".join(keyword_filters) + ")")

    where_clause = ""
    if filters:
        where_clause = "WHERE " + " AND ".join(filters)

    rows = conn.execute(
        f"""
        SELECT *
        FROM company_resources
        {where_clause}
        ORDER BY
            CASE status
                WHEN 'active' THEN 1
                ELSE 2
            END,
            id
        LIMIT 10
        """,
        params,
    ).fetchall()

    matches = []
    for row in rows:
        resource = dict(row)

        matched_keywords = []
        searchable_text = (
            f"{resource['name']} "
            f"{resource['description']} "
            f"{resource['keywords']} "
            f"{resource['category']}"
        ).lower()

        for word in search_words:
            if word.lower() in searchable_text:
                matched_keywords.append(word)

        if len(matched_keywords) >= 2:
            confidence = "عالية"
        elif len(matched_keywords) == 1:
            confidence = "متوسطة"
        else:
            confidence = "منخفضة"

        resource["matched_keywords"] = matched_keywords
        resource["confidence"] = confidence
        resource["reasoning"] = (
            "تم العثور على مؤشرات مطابقة بين نص المتطلب وهذا المورد: "
            f"{', '.join(matched_keywords) if matched_keywords else 'لا توجد كلمات مباشرة، لكن المورد ضمن نفس التصنيف'}."
        )

        matches.append(resource)

    conn.close()

    return {
        "requirement_text": requirement_text,
        "category": category,
        "matches_count": len(matches),
        "matches": matches,
    }


@router.get("/match/tender/{tender_id}")
def match_resources_to_tender_requirements(tender_id: int):
    conn = get_connection()

    tender = conn.execute(
        """
        SELECT *
        FROM tenders
        WHERE id = ?
        """,
        (tender_id,),
    ).fetchone()

    if not tender:
        conn.close()
        raise HTTPException(status_code=404, detail="Tender not found")

    requirements_rows = conn.execute(
        """
        SELECT *
        FROM requirements
        WHERE tender_id = ?
        ORDER BY
            CASE priority
                WHEN 'عالية' THEN 1
                WHEN 'متوسطة' THEN 2
                ELSE 3
            END,
            id
        """,
        (tender_id,),
    ).fetchall()

    resources_rows = conn.execute(
        """
        SELECT *
        FROM company_resources
        WHERE status = 'active'
        ORDER BY id
        """
    ).fetchall()

    requirements = [dict(row) for row in requirements_rows]
    resources = [dict(row) for row in resources_rows]

    matched_requirements = []
    total_best_score = 0
    requirements_with_usable_evidence = 0

    for requirement in requirements:
        resource_matches = []

        for resource in resources:
            capabilities = get_resource_capabilities(conn, resource["id"])
            documents = get_resource_documents(conn, resource["id"])
            documents_count = len(documents)

            match_result = calculate_resource_match_score(
                requirement=requirement,
                resource=resource,
                capabilities=capabilities,
                documents_count=documents_count,
            )

            if match_result["score"] < 25:
                continue

            resource_matches.append(
                {
                    "resource_id": resource["id"],
                    "resource_name": resource["name"],
                    "resource_type": resource["resource_type"],
                    "resource_category": resource["category"],
                    "resource_owner": resource["owner"],
                    "resource_status": resource["status"],
                    "documents_count": documents_count,
                    "documents": documents,
                    "capabilities": capabilities,
                    "match_score": match_result["score"],
                    "confidence": match_result["confidence"],
                    "matched_terms": match_result["matched_terms"],
                    "reasons": match_result["reasons"],
                    "evidence_status": match_result["evidence_status"],
                    "recommended_action": match_result["recommended_action"],
                }
            )

        resource_matches.sort(
            key=lambda item: (
                item["match_score"],
                item["documents_count"],
            ),
            reverse=True,
        )

        best_match = resource_matches[0] if resource_matches else None
        best_score = best_match["match_score"] if best_match else 0
        total_best_score += best_score

        if best_match and best_match["documents_count"] > 0 and best_score >= 45:
            requirements_with_usable_evidence += 1

        if best_match and best_score >= 75:
            requirement_decision = "مدعوم بقوة من موارد الشركة"
        elif best_match and best_score >= 45:
            requirement_decision = "مدعوم جزئيًا ويحتاج مراجعة"
        elif best_match:
            requirement_decision = "توجد مؤشرات ضعيفة"
        else:
            requirement_decision = "لا يوجد مورد مناسب"

        matched_requirements.append(
            {
                "requirement_id": requirement["id"],
                "requirement_title": requirement["title"],
                "requirement_category": requirement["category"],
                "requirement_priority": requirement["priority"],
                "current_requirement_status": requirement["status"],
                "decision": requirement_decision,
                "best_score": best_score,
                "best_match": best_match,
                "matches_count": len(resource_matches),
                "matches": resource_matches[:5],
            }
        )

    if requirements:
        resource_readiness_score = round(total_best_score / len(requirements))
        evidence_coverage_score = round(
            (requirements_with_usable_evidence / len(requirements)) * 100
        )
    else:
        resource_readiness_score = 0
        evidence_coverage_score = 0

    if evidence_coverage_score >= 90 and resource_readiness_score >= 80:
        agent_decision = "موارد الشركة تدعم المنافسة بقوة"
        recommended_next_action = "استخدم الموارد المطابقة كأدلة داعمة وانتقل إلى مراجعة التقديم."
    elif evidence_coverage_score >= 60:
        agent_decision = "موارد الشركة تدعم المنافسة جزئيًا"
        recommended_next_action = "أغلق المتطلبات الضعيفة برفع مستندات داعمة إضافية."
    else:
        agent_decision = "توجد فجوات في ربط الموارد بالأدلة"
        recommended_next_action = "ارفع مستندات داعمة أو أضف موارد شركة جديدة قبل اعتماد التقديم."

    conn.close()

    return {
        "tender_id": tender["id"],
        "tender_title": tender["title"],
        "client": tender["client"],
        "requirements_count": len(requirements),
        "resources_checked": len(resources),
        "resource_readiness_score": resource_readiness_score,
        "evidence_coverage_score": evidence_coverage_score,
        "requirements_with_usable_evidence": requirements_with_usable_evidence,
        "agent_decision": agent_decision,
        "recommended_next_action": recommended_next_action,
        "requirements": matched_requirements,
        "engine": "deterministic_resource_matching_v1",
    }


@router.get("/{resource_id}")
def get_company_resource(resource_id: int):
    conn = get_connection()

    resource = find_resource_or_404(conn, resource_id)
    resource["documents"] = get_resource_documents(conn, resource_id)
    resource["capabilities"] = get_resource_capabilities(conn, resource_id)

    conn.close()

    return resource


@router.post("")
def create_company_resource(payload: CompanyResourceCreateRequest):
    conn = get_connection()

    created_at = datetime.utcnow().isoformat()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO company_resources
        (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.name,
            payload.resource_type,
            payload.category,
            payload.description,
            payload.keywords,
            payload.owner,
            payload.status,
            payload.valid_until,
            payload.evidence_note,
            created_at,
        ),
    )

    resource_id = cur.lastrowid
    conn.commit()

    resource = find_resource_or_404(conn, resource_id)
    resource["documents"] = get_resource_documents(conn, resource_id)
    resource["capabilities"] = get_resource_capabilities(conn, resource_id)

    conn.close()

    return {
        "message": "تم إنشاء مورد الشركة بنجاح",
        "resource": resource,
    }


@router.get("/{resource_id}/documents")
def list_resource_documents(resource_id: int):
    conn = get_connection()

    find_resource_or_404(conn, resource_id)
    documents = get_resource_documents(conn, resource_id)

    conn.close()

    return {
        "resource_id": resource_id,
        "count": len(documents),
        "documents": documents,
    }


@router.post("/{resource_id}/documents/upload")
async def upload_resource_document(
    resource_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("supporting_document"),
    notes: Optional[str] = Form(None),
):
    conn = get_connection()

    resource = find_resource_or_404(conn, resource_id)

    if not file.filename:
        conn.close()
        raise HTTPException(status_code=400, detail="File name is required")

    file_bytes = await file.read()

    max_size_mb = 25
    if len(file_bytes) > max_size_mb * 1024 * 1024:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Maximum allowed size is {max_size_mb} MB",
        )

    safe_filename = (
        file.filename
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("*", "_")
        .replace("?", "_")
        .replace('"', "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace("|", "_")
    )

    stored_filename = f"resource_{resource_id}_{uuid4().hex}_{safe_filename}"
    stored_path = RESOURCE_DOCUMENTS_DIR / stored_filename

    with open(stored_path, "wb") as output_file:
        output_file.write(file_bytes)

    uploaded_at = datetime.utcnow().isoformat()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO resource_documents
        (
            resource_id,
            document_name,
            document_type,
            file_path,
            mime_type,
            notes,
            status,
            uploaded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            resource_id,
            file.filename,
            document_type,
            str(stored_path),
            file.content_type,
            notes,
            "active",
            uploaded_at,
        ),
    )

    document_id = cur.lastrowid
    conn.commit()

    document = conn.execute(
        """
        SELECT *
        FROM resource_documents
        WHERE id = ?
        """,
        (document_id,),
    ).fetchone()

    conn.close()

    return {
        "message": "تم رفع مستند المورد بنجاح",
        "resource": {
            "id": resource["id"],
            "name": resource["name"],
        },
        "document": dict(document),
    }


@router.get("/documents/{document_id}/download")
def download_resource_document(document_id: int):
    conn = get_connection()

    document = conn.execute(
        """
        SELECT *
        FROM resource_documents
        WHERE id = ?
        """,
        (document_id,),
    ).fetchone()

    if not document:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    document = dict(document)
    file_path = Path(document["file_path"])

    if not file_path.exists():
        conn.close()
        raise HTTPException(status_code=404, detail="Stored file not found")

    conn.close()

    return FileResponse(
        path=str(file_path),
        filename=document["document_name"],
        media_type=document["mime_type"] or "application/octet-stream",
    )