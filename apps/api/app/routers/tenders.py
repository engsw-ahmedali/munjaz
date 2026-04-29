from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import shutil
import uuid
import re
import json

from pypdf import PdfReader

from app.services.db import get_connection

router = APIRouter(prefix="/tenders", tags=["tenders"])

DOCUMENTS_DIR = Path(__file__).resolve().parents[2] / "storage" / "tender_documents"
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

DOC_GAP_TASK_SOURCE = "تم إنشاؤها تلقائيًا من تحليل فجوات المستند"
EVIDENCE_ACTION_PLAN_TASK_SOURCE = "تم إنشاؤها تلقائيًا من خطة إغلاق فجوات التقديم"


class SuggestedTasksApprovalRequest(BaseModel):
    tender_id: int


def suggest_owner(category: str):
    owner_map = {
        "فني": "الفريق الفني",
        "تشغيل": "فريق التشغيل",
        "خبرات": "فريق تطوير الأعمال",
        "شهادات": "فريق الجودة والامتثال",
        "إداري": "إدارة المشروع",
        "تقني": "الفريق التقني",
    }
    return owner_map.get(category, "فريق المتابعة")


def find_tender_or_404(conn, tender_id: int):
    tender = conn.execute(
        "SELECT * FROM tenders WHERE id = ?",
        (tender_id,),
    ).fetchone()

    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    return dict(tender)


def get_requirements_for_tender(conn, tender_id: int):
    find_tender_or_404(conn, tender_id)

    rows = conn.execute(
        "SELECT * FROM requirements WHERE tender_id = ? ORDER BY id",
        (tender_id,),
    ).fetchall()

    return [dict(row) for row in rows]


def get_documents_for_tender(conn, tender_id: int):
    find_tender_or_404(conn, tender_id)

    rows = conn.execute(
        """
        SELECT *
        FROM tender_documents
        WHERE tender_id = ?
        ORDER BY id DESC
        """,
        (tender_id,),
    ).fetchall()

    return [dict(row) for row in rows]


def calculate_readiness_score(conn, tender_id: int):
    requirements = get_requirements_for_tender(conn, tender_id)

    if not requirements:
        return 0

    points = 0.0

    for requirement in requirements:
        status = requirement["status"]

        if status == "مغطى":
            points += 1.0
        elif status == "مغطى جزئيًا":
            points += 0.5

    return round((points / len(requirements)) * 100)


def sync_tender_readiness(conn, tender_id: int):
    score = calculate_readiness_score(conn, tender_id)

    conn.execute(
        "UPDATE tenders SET readiness_score = ? WHERE id = ?",
        (score, tender_id),
    )

    conn.commit()


def build_analysis(conn, tender_id: int):
    requirements = get_requirements_for_tender(conn, tender_id)

    covered = sum(1 for r in requirements if r["status"] == "مغطى")
    partial = sum(1 for r in requirements if r["status"] == "مغطى جزئيًا")
    uncovered = sum(1 for r in requirements if r["status"] == "غير مغطى")

    if uncovered >= 2:
        recommendation = "عدم الدخول"
        risk_level = "عالٍ"
    elif uncovered == 1 or partial >= 2:
        recommendation = "دخول مشروط"
        risk_level = "متوسط"
    else:
        recommendation = "دخول"
        risk_level = "منخفض"

    blockers = [r["title"] for r in requirements if r["status"] == "غير مغطى"]

    return {
        "tender_id": tender_id,
        "covered_count": covered,
        "partial_count": partial,
        "uncovered_count": uncovered,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "blockers": blockers,
    }


def build_suggested_tasks(conn, tender_id: int):
    requirements = get_requirements_for_tender(conn, tender_id)
    tasks = []

    for requirement in requirements:
        if requirement["status"] == "غير مغطى":
            task_type = "معالجة نقص"
            reason = "المتطلب غير مغطى حاليًا ويؤثر على قرار الدخول"
        elif requirement["status"] == "مغطى جزئيًا":
            task_type = "استكمال تغطية"
            reason = "المتطلب مغطى جزئيًا ويحتاج استكمال قبل التقديم"
        else:
            continue

        tasks.append(
            {
                "id": f"TASK-{tender_id}-{requirement['id']}",
                "title": f"{task_type}: {requirement['title']}",
                "owner": suggest_owner(requirement["category"]),
                "priority": requirement["priority"],
                "status": "مقترحة",
                "reason": reason,
                "linked_requirement_id": requirement["id"],
                "category": requirement["category"],
                "tender_id": tender_id,
            }
        )

    return tasks


def extract_text_from_pdf(file_path: str):
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError("Document file was not found on disk")

    reader = PdfReader(str(path))
    extracted_pages = []

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        page_text = page_text.strip()

        if page_text:
            extracted_pages.append(f"--- صفحة {page_number} ---\n{page_text}")

    extracted_text = "\n\n".join(extracted_pages).strip()

    if not extracted_text:
        extracted_text = (
            "لم يتم العثور على نص قابل للاستخراج داخل الملف. "
            "قد يكون الملف صورة ممسوحة ضوئيًا أو يحتاج إلى OCR."
        )

    return extracted_text


def normalize_text(value: str):
    value = value or ""
    value = value.lower()

    replacements = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ى": "ي",
        "ة": "ه",
        "ؤ": "و",
        "ئ": "ي",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    value = re.sub(r"[^\w\s\u0600-\u06FF]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()

    return value


def build_requirement_keywords(requirement: dict):
    title = requirement["title"]
    category = requirement["category"]

    keywords = [
        title,
        category,
    ]

    normalized_title = normalize_text(title)

    if "iso" in normalized_title or "27001" in normalized_title:
        keywords.extend(
            [
                "ISO 27001",
                "27001",
                "آيزو",
                "ايزو",
                "شهادة",
                "شهادة ISO",
                "شهادة ISO 27001",
            ]
        )

    if "مهندس" in normalized_title and "شبكات" in normalized_title:
        keywords.extend(
            [
                "مهندس شبكات",
                "شبكات",
                "مهندس",
                "معتمد",
                "اعتماد",
                "CCNA",
                "CCNP",
                "Cisco",
            ]
        )

    if "سابقه" in normalized_title or "اعمال" in normalized_title or "خبر" in normalized_title:
        keywords.extend(
            [
                "سابقة أعمال",
                "اعمال مشابهة",
                "أعمال مشابهة",
                "خبرة",
                "خبرات",
                "مشاريع مماثلة",
                "آخر 5 سنوات",
                "خلال آخر 5 سنوات",
                "خمس سنوات",
                "5 سنوات",
            ]
        )

    if "24" in normalized_title or "تشغيل" in normalized_title or "مركز عمليات" in normalized_title:
        keywords.extend(
            [
                "24/7",
                "24 7",
                "مركز عمليات",
                "تشغيل",
                "فريق تشغيل",
                "مراقبة",
                "استجابة",
            ]
        )

    if "siem" in normalized_title or "soar" in normalized_title:
        keywords.extend(
            [
                "SIEM",
                "SOAR",
                "تكامل",
                "أدوات المراقبة",
                "أدوات الاستجابة",
                "security information",
            ]
        )

    if "elv" in normalized_title or "المجمعات التعليميه" in normalized_title:
        keywords.extend(
            [
                "ELV",
                "أنظمة ELV",
                "انظمة ELV",
                "أنظمة التيار الخفيف",
                "المجمعات التعليمية",
                "الحرم الجامعي",
                "كاميرات",
                "تحكم بالدخول",
            ]
        )

    if "خطه" in normalized_title or "تنفيذ" in normalized_title:
        keywords.extend(
            [
                "خطة تنفيذ",
                "منهجية التنفيذ",
                "برنامج العمل",
                "الجدول الزمني",
                "مراحل التنفيذ",
                "إدارة المشروع",
            ]
        )

    normalized_keywords = []
    seen = set()

    for keyword in keywords:
        normalized_keyword = normalize_text(keyword)

        if not normalized_keyword:
            continue

        if len(normalized_keyword) < 2:
            continue

        if normalized_keyword not in seen:
            seen.add(normalized_keyword)
            normalized_keywords.append(keyword)

    return normalized_keywords


def analyze_requirement_against_text(requirement: dict, extracted_text: str):
    normalized_document_text = normalize_text(extracted_text)
    normalized_requirement_title = normalize_text(requirement["title"])
    keywords = build_requirement_keywords(requirement)

    matched_keywords = []

    for keyword in keywords:
        normalized_keyword = normalize_text(keyword)

        if normalized_keyword and normalized_keyword in normalized_document_text:
            matched_keywords.append(keyword)

    unique_matches = []
    seen = set()

    for match in matched_keywords:
        normalized_match = normalize_text(match)

        if normalized_match not in seen:
            seen.add(normalized_match)
            unique_matches.append(match)

    has_exact_title = normalized_requirement_title in normalized_document_text
    match_count = len(unique_matches)

    if has_exact_title or match_count >= 2:
        coverage_status = "مغطى"
        confidence = "عالية"
        reason = "تم العثور على إشارات واضحة داخل المستند تدعم تغطية هذا المتطلب."
    elif match_count == 1:
        coverage_status = "مغطى جزئيًا"
        confidence = "متوسطة"
        reason = "تم العثور على إشارة واحدة مرتبطة بالمتطلب، لكنها غير كافية للحكم بتغطية كاملة."
    else:
        coverage_status = "غير مغطى"
        confidence = "منخفضة"
        reason = "لم يتم العثور على مؤشرات كافية داخل المستند تثبت تغطية هذا المتطلب."

    return {
        "requirement_id": requirement["id"],
        "requirement_title": requirement["title"],
        "category": requirement["category"],
        "priority": requirement["priority"],
        "current_system_status": requirement["status"],
        "document_coverage_status": coverage_status,
        "confidence": confidence,
        "matched_keywords": unique_matches,
        "reason": reason,
    }


def coverage_points(status: str):
    if status == "مغطى":
        return 1.0

    if status == "مغطى جزئيًا":
        return 0.5

    return 0.0


def choose_better_coverage(current_item: dict | None, candidate_item: dict):
    if current_item is None:
        return candidate_item

    current_points = coverage_points(current_item["document_coverage_status"])
    candidate_points = coverage_points(candidate_item["document_coverage_status"])

    if candidate_points > current_points:
        return candidate_item

    if candidate_points == current_points:
        current_matches = len(current_item.get("matched_keywords", []))
        candidate_matches = len(candidate_item.get("matched_keywords", []))

        if candidate_matches > current_matches:
            return candidate_item

    return current_item


def ensure_document_text_is_extracted(conn, document: dict):
    extracted_text = document.get("extracted_text") or ""
    extraction_status = document.get("extraction_status") or ""

    should_extract_again = (
        not extracted_text
        or extraction_status != "completed"
        or extracted_text.startswith("نص أولي مستخرج من الملف")
    )

    if not should_extract_again:
        return extracted_text

    extracted_text = extract_text_from_pdf(document["file_path"])

    conn.execute(
        """
        UPDATE tender_documents
        SET extraction_status = ?, extracted_text = ?
        WHERE id = ? AND tender_id = ?
        """,
        ("completed", extracted_text, document["id"], document["tender_id"]),
    )

    conn.commit()

    return extracted_text


def build_document_coverage_analysis(conn, tender_id: int, document_id: int):
    document = conn.execute(
        """
        SELECT *
        FROM tender_documents
        WHERE id = ? AND tender_id = ?
        """,
        (document_id, tender_id),
    ).fetchone()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document = dict(document)
    extracted_text = ensure_document_text_is_extracted(conn, document)

    requirements = get_requirements_for_tender(conn, tender_id)

    coverage_items = [
        analyze_requirement_against_text(requirement, extracted_text)
        for requirement in requirements
    ]

    covered_count = sum(
        1 for item in coverage_items if item["document_coverage_status"] == "مغطى"
    )
    partial_count = sum(
        1 for item in coverage_items if item["document_coverage_status"] == "مغطى جزئيًا"
    )
    uncovered_count = sum(
        1 for item in coverage_items if item["document_coverage_status"] == "غير مغطى"
    )

    if uncovered_count == 0 and partial_count == 0:
        recommendation = "المستند يغطي المتطلبات المرصودة بشكل جيد ويمكن دعم قرار الدخول."
        risk_level = "منخفض"
    elif uncovered_count == 0 and partial_count > 0:
        recommendation = "المستند يدعم الدخول، مع الحاجة إلى استكمال بعض الأدلة قبل التقديم."
        risk_level = "متوسط"
    elif uncovered_count <= 2:
        recommendation = "يوجد نقص في بعض المتطلبات، ويوصى بإنشاء مهام استكمال قبل اعتماد القرار النهائي."
        risk_level = "متوسط"
    else:
        recommendation = "يوجد نقص جوهري في التغطية، ويوصى بعدم الدخول أو التصعيد قبل التقديم."
        risk_level = "عالٍ"

    gaps = [
        item
        for item in coverage_items
        if item["document_coverage_status"] in ["غير مغطى", "مغطى جزئيًا"]
    ]

    return {
        "tender_id": tender_id,
        "document_id": document_id,
        "document_name": document["original_filename"],
        "coverage_summary": {
            "covered_count": covered_count,
            "partial_count": partial_count,
            "uncovered_count": uncovered_count,
            "total_requirements": len(coverage_items),
            "risk_level": risk_level,
            "recommendation": recommendation,
        },
        "requirements_coverage": coverage_items,
        "gaps": gaps,
    }


def get_accepted_task_evidence_for_tender(conn, tender_id: int):
    rows = conn.execute(
        """
        SELECT
            evidence.*,
            documents.original_filename AS document_name,
            tasks.title AS task_title,
            tasks.owner AS task_owner,
            tasks.source AS task_source
        FROM task_evidence_submissions evidence
        LEFT JOIN tender_documents documents
            ON documents.id = evidence.document_id
        LEFT JOIN tasks tasks
            ON tasks.id = evidence.task_id
        WHERE evidence.tender_id = ?
        AND evidence.verification_status = ?
        ORDER BY evidence.id DESC
        """,
        (tender_id, "accepted"),
    ).fetchall()

    accepted_evidence = []

    for row in rows:
        item = dict(row)
        item["matched_keywords"] = parse_json_list(item.get("matched_keywords"))
        accepted_evidence.append(item)

    return accepted_evidence


def get_accepted_task_evidence_by_requirement(conn, tender_id: int):
    accepted_evidence = get_accepted_task_evidence_for_tender(conn, tender_id)
    evidence_by_requirement = {}

    for item in accepted_evidence:
        requirement_id = item.get("linked_requirement_id")

        if requirement_id is None:
            continue

        evidence_by_requirement.setdefault(requirement_id, []).append(item)

    return evidence_by_requirement


def build_accepted_task_evidence_candidate(requirement: dict, evidence: dict):
    matched_keywords = evidence.get("matched_keywords") or []
    document_id = evidence.get("document_id")
    document_name = evidence.get("document_name")

    if document_id and document_name:
        best_evidence_document = {
            "document_id": document_id,
            "document_name": document_name,
            "source_type": "task_uploaded_document",
        }
    else:
        best_evidence_document = {
            "document_id": 0,
            "document_name": f"دليل نصي مقبول من المهمة {evidence.get('task_id')}",
            "source_type": "task_text_evidence",
        }

    reason = (
        "تم احتساب هذا المتطلب كمغطى لأن هناك دليلًا مقبولًا مرتبطًا بمهمة إغلاق فجوة. "
        f"سبب قبول الدليل: {evidence.get('decision_reason') or 'تم قبول الدليل من نظام التحقق.'}"
    )

    return {
        "requirement_id": requirement["id"],
        "requirement_title": requirement["title"],
        "category": requirement["category"],
        "priority": requirement["priority"],
        "current_system_status": requirement["status"],
        "document_coverage_status": "مغطى",
        "confidence": evidence.get("confidence") or "عالية",
        "matched_keywords": matched_keywords,
        "reason": reason,
        "best_evidence_document": best_evidence_document,
        "evidence_source": "accepted_task_evidence",
        "task_id": evidence.get("task_id"),
        "evidence_submission_id": evidence.get("id"),
    }


def build_tender_documents_coverage_summary(conn, tender_id: int):
    tender = find_tender_or_404(conn, tender_id)
    requirements = get_requirements_for_tender(conn, tender_id)
    documents = get_documents_for_tender(conn, tender_id)
    accepted_evidence_by_requirement = get_accepted_task_evidence_by_requirement(conn, tender_id)
    accepted_evidence_count = sum(
        len(items) for items in accepted_evidence_by_requirement.values()
    )
    evidence_sources_count = len(documents) + accepted_evidence_count

    if not requirements:
        return {
            "tender_id": tender_id,
            "internal_readiness_score": tender["readiness_score"],
            "documents_coverage_score": 0,
            "covered_count": 0,
            "partial_count": 0,
            "uncovered_count": 0,
            "total_requirements": 0,
            "documents_count": len(documents),
            "accepted_evidence_count": accepted_evidence_count,
            "evidence_sources_count": evidence_sources_count,
            "risk_level": "غير محدد",
            "recommendation": "لا توجد متطلبات مرتبطة بالمنافسة حتى الآن.",
            "requirements_document_coverage": [],
        }

    document_texts = []

    for document in documents:
        extracted_text = ensure_document_text_is_extracted(conn, document)

        document_texts.append(
            {
                "document_id": document["id"],
                "document_name": document["original_filename"],
                "extracted_text": extracted_text,
            }
        )

    requirements_document_coverage = []

    for requirement in requirements:
        best_item = None
        evidence_by_document = []

        for document_text in document_texts:
            item = analyze_requirement_against_text(
                requirement=requirement,
                extracted_text=document_text["extracted_text"],
            )

            evidence_item = {
                "document_id": document_text["document_id"],
                "document_name": document_text["document_name"],
                "document_coverage_status": item["document_coverage_status"],
                "confidence": item["confidence"],
                "matched_keywords": item["matched_keywords"],
                "reason": item["reason"],
                "evidence_source": "tender_document",
            }

            evidence_by_document.append(evidence_item)

            candidate = {
                **item,
                "best_evidence_document": {
                    "document_id": document_text["document_id"],
                    "document_name": document_text["document_name"],
                    "source_type": "tender_document",
                },
                "evidence_source": "tender_document",
            }

            best_item = choose_better_coverage(best_item, candidate)

        accepted_items = accepted_evidence_by_requirement.get(requirement["id"], [])

        for accepted_evidence in accepted_items:
            candidate = build_accepted_task_evidence_candidate(requirement, accepted_evidence)

            evidence_by_document.append(
                {
                    "document_id": candidate["best_evidence_document"].get("document_id"),
                    "document_name": candidate["best_evidence_document"].get("document_name"),
                    "document_coverage_status": candidate["document_coverage_status"],
                    "confidence": candidate["confidence"],
                    "matched_keywords": candidate["matched_keywords"],
                    "reason": candidate["reason"],
                    "evidence_source": "accepted_task_evidence",
                    "task_id": candidate.get("task_id"),
                    "evidence_submission_id": candidate.get("evidence_submission_id"),
                }
            )

            best_item = choose_better_coverage(best_item, candidate)

        if best_item is None:
            if evidence_sources_count == 0:
                reason = "لا توجد مستندات أو أدلة مقبولة يمكن تحليلها لإثبات هذا المتطلب."
            else:
                reason = "لم يتم العثور على مؤشرات كافية داخل المستندات أو أدلة المهام المقبولة تثبت تغطية هذا المتطلب."

            best_item = {
                "requirement_id": requirement["id"],
                "requirement_title": requirement["title"],
                "category": requirement["category"],
                "priority": requirement["priority"],
                "current_system_status": requirement["status"],
                "document_coverage_status": "غير مغطى",
                "confidence": "منخفضة",
                "matched_keywords": [],
                "reason": reason,
                "best_evidence_document": None,
                "evidence_source": "none",
            }

        requirements_document_coverage.append(
            {
                "requirement_id": best_item["requirement_id"],
                "requirement_title": best_item["requirement_title"],
                "category": best_item["category"],
                "priority": best_item["priority"],
                "current_system_status": best_item["current_system_status"],
                "best_document_coverage_status": best_item["document_coverage_status"],
                "confidence": best_item["confidence"],
                "matched_keywords": best_item["matched_keywords"],
                "best_evidence_document": best_item["best_evidence_document"],
                "reason": best_item["reason"],
                "evidence_source": best_item.get("evidence_source", "unknown"),
                "evidence_by_document": evidence_by_document,
            }
        )

    covered_count = sum(
        1
        for item in requirements_document_coverage
        if item["best_document_coverage_status"] == "مغطى"
    )
    partial_count = sum(
        1
        for item in requirements_document_coverage
        if item["best_document_coverage_status"] == "مغطى جزئيًا"
    )
    uncovered_count = sum(
        1
        for item in requirements_document_coverage
        if item["best_document_coverage_status"] == "غير مغطى"
    )

    total_points = sum(
        coverage_points(item["best_document_coverage_status"])
        for item in requirements_document_coverage
    )

    documents_coverage_score = round(
        (total_points / len(requirements_document_coverage)) * 100
    )

    internal_readiness_score = calculate_readiness_score(conn, tender_id)

    if evidence_sources_count == 0:
        risk_level = "عالٍ"
        recommendation = "لا توجد مستندات أو أدلة مقبولة لإثبات تغطية المتطلبات، ويوصى برفع أدلة داعمة قبل التقديم."
    elif documents_coverage_score >= 90 and uncovered_count == 0:
        risk_level = "منخفض"
        recommendation = (
            "المنافسة جاهزة داخليًا وأدلة الإثبات تغطي المتطلبات بشكل قوي. "
            "يمكن دعم قرار الدخول مع مراجعة نهائية قبل التقديم."
        )
    elif documents_coverage_score >= 60:
        risk_level = "متوسط"
        recommendation = (
            "الجاهزية الداخلية جيدة، لكن تغطية الأدلة تحتاج استكمال بعض العناصر "
            "قبل اعتماد قرار التقديم النهائي."
        )
    else:
        risk_level = "عالٍ"
        recommendation = (
            "يوجد ضعف في تغطية الأدلة مقارنة بالمتطلبات. "
            "يوصى بإنشاء مهام فجوات الأدلة أو رفع مستندات داعمة قبل التقديم."
        )

    if internal_readiness_score >= 90 and documents_coverage_score < 90:
        decision_note = (
            "الجاهزية الداخلية مرتفعة، لكن أدلة الإثبات لا تعكس الجاهزية بالكامل. "
            "هذا يعني أن الفريق قد يكون جاهزًا فعليًا، لكن الأدلة المرفوعة أو المقبولة غير كافية."
        )
    elif internal_readiness_score < 90 and documents_coverage_score >= 90:
        decision_note = (
            "الأدلة تدعم التغطية، لكن حالة المتطلبات داخل النظام تحتاج تحديثًا "
            "حتى تعكس الأدلة الموجودة."
        )
    else:
        decision_note = (
            "الجاهزية الداخلية وتغطية الأدلة متقاربتان، ويمكن الاعتماد عليهما "
            "في قراءة وضع المنافسة."
        )

    return {
        "tender_id": tender_id,
        "internal_readiness_score": internal_readiness_score,
        "documents_coverage_score": documents_coverage_score,
        "covered_count": covered_count,
        "partial_count": partial_count,
        "uncovered_count": uncovered_count,
        "total_requirements": len(requirements_document_coverage),
        "documents_count": len(documents),
        "accepted_evidence_count": accepted_evidence_count,
        "evidence_sources_count": evidence_sources_count,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "decision_note": decision_note,
        "requirements_document_coverage": requirements_document_coverage,
    }
def build_gap_tasks_from_document_analysis(conn, tender_id: int, document_id: int):
    coverage_analysis = build_document_coverage_analysis(conn, tender_id, document_id)
    gaps = coverage_analysis["gaps"]

    existing_rows = conn.execute(
        """
        SELECT id, linked_requirement_id
        FROM tasks
        WHERE tender_id = ?
        AND (
            source = ?
            OR id LIKE ?
        )
        """,
        (tender_id, DOC_GAP_TASK_SOURCE, f"DOC-GAP-{tender_id}-%"),
    ).fetchall()

    existing_ids = {row["id"] for row in existing_rows}
    existing_gap_requirement_ids = {row["linked_requirement_id"] for row in existing_rows}

    created_tasks = []
    skipped_tasks = []

    for gap in gaps:
        requirement_id = gap["requirement_id"]

        task_id = f"DOC-GAP-{tender_id}-{requirement_id}"

        if task_id in existing_ids or requirement_id in existing_gap_requirement_ids:
            skipped_tasks.append(task_id)
            continue

        if gap["document_coverage_status"] == "غير مغطى":
            task_prefix = "معالجة فجوة حرجة من المستند"
        else:
            task_prefix = "استكمال دليل جزئي من المستند"

        matched_keywords = gap.get("matched_keywords") or []

        matched_keywords_text = (
            "، ".join(matched_keywords)
            if matched_keywords
            else "لا توجد كلمات مطابقة كافية"
        )

        reason = (
            f"تحليل مستند المنافسة أظهر أن المتطلب حالته: "
            f"{gap['document_coverage_status']}. "
            f"سبب الحكم: {gap['reason']} "
            f"الكلمات المطابقة: {matched_keywords_text}."
        )

        new_task = {
            "id": task_id,
            "tender_id": tender_id,
            "linked_requirement_id": requirement_id,
            "title": f"{task_prefix}: {gap['requirement_title']}",
            "owner": suggest_owner(gap["category"]),
            "priority": gap["priority"],
            "status": "مفتوحة",
            "reason": reason,
            "category": gap["category"],
            "source": DOC_GAP_TASK_SOURCE,
        }

        conn.execute(
            """
            INSERT INTO tasks
            (id, tender_id, linked_requirement_id, title, owner, priority, status, reason, category, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_task["id"],
                new_task["tender_id"],
                new_task["linked_requirement_id"],
                new_task["title"],
                new_task["owner"],
                new_task["priority"],
                new_task["status"],
                new_task["reason"],
                new_task["category"],
                new_task["source"],
            ),
        )

        created_tasks.append(new_task)
        existing_ids.add(task_id)
        existing_gap_requirement_ids.add(requirement_id)

    conn.commit()

    return {
        "coverage_analysis": coverage_analysis,
        "created_count": len(created_tasks),
        "skipped_count": len(skipped_tasks),
        "created_tasks": created_tasks,
        "skipped_task_ids": skipped_tasks,
    }


def deduplicate_document_gap_tasks(conn, tender_id: int | None = None):
    if tender_id is None:
        rows = conn.execute(
            """
            SELECT rowid, *
            FROM tasks
            WHERE source = ?
            OR id LIKE 'DOC-GAP-%'
            ORDER BY
                tender_id,
                linked_requirement_id,
                CASE WHEN status = 'مكتملة' THEN 0 ELSE 1 END,
                rowid
            """,
            (DOC_GAP_TASK_SOURCE,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT rowid, *
            FROM tasks
            WHERE tender_id = ?
            AND (
                source = ?
                OR id LIKE ?
            )
            ORDER BY
                tender_id,
                linked_requirement_id,
                CASE WHEN status = 'مكتملة' THEN 0 ELSE 1 END,
                rowid
            """,
            (tender_id, DOC_GAP_TASK_SOURCE, f"DOC-GAP-{tender_id}-%"),
        ).fetchall()

    seen_keys = set()
    kept_tasks = []
    deleted_tasks = []

    for row in rows:
        task = dict(row)
        key = (task["tender_id"], task["linked_requirement_id"])

        if key in seen_keys:
            deleted_tasks.append(task)
            continue

        seen_keys.add(key)
        kept_tasks.append(task)

    for task in deleted_tasks:
        conn.execute(
            "DELETE FROM tasks WHERE rowid = ?",
            (task["rowid"],),
        )

    conn.commit()

    return {
        "kept_count": len(kept_tasks),
        "deleted_count": len(deleted_tasks),
        "kept_tasks": kept_tasks,
        "deleted_tasks": deleted_tasks,
    }


def build_required_action_for_gap(item: dict):
    title = item.get("requirement_title", "")
    category = item.get("category", "")
    coverage_status = item.get("best_document_coverage_status", "غير مغطى")
    normalized_title = normalize_text(title)

    if "iso" in normalized_title or "27001" in normalized_title:
        return {
            "requirement_id": item["requirement_id"],
            "action_type": "رفع دليل امتثال",
            "title": "رفع شهادة ISO 27001 واضحة وسارية",
            "description": "إرفاق شهادة ISO 27001 بصيغة واضحة، ويفضل أن تتضمن اسم الشركة وتاريخ السريان وجهة الإصدار.",
            "priority": item.get("priority", "متوسطة"),
            "evidence_status": coverage_status,
        }

    if "مهندس" in normalized_title and "شبكات" in normalized_title:
        return {
            "requirement_id": item["requirement_id"],
            "action_type": "رفع دليل موارد بشرية",
            "title": "رفع دليل يثبت توفر مهندس شبكات معتمد",
            "description": "إرفاق سيرة ذاتية أو شهادة اعتماد مهنية أو خطاب تعيين يثبت توفر مهندس شبكات معتمد ضمن فريق المشروع.",
            "priority": item.get("priority", "عالية"),
            "evidence_status": coverage_status,
        }

    if "سابقه" in normalized_title or "اعمال" in normalized_title or "خبر" in normalized_title:
        return {
            "requirement_id": item["requirement_id"],
            "action_type": "رفع دليل خبرة",
            "title": "رفع سابقة أعمال مشابهة موثقة",
            "description": "إرفاق خطاب إنجاز أو عقد أو شهادة إتمام مشروع مشابه خلال آخر 5 سنوات لدعم متطلب الخبرة.",
            "priority": item.get("priority", "عالية"),
            "evidence_status": coverage_status,
        }

    if category == "فني" or category == "تقني":
        action_type = "رفع دليل فني"
    elif category == "شهادات":
        action_type = "رفع شهادة داعمة"
    elif category == "خبرات":
        action_type = "رفع مرجع خبرة"
    elif category == "إداري":
        action_type = "رفع مستند إداري"
    else:
        action_type = "استكمال دليل"

    return {
        "requirement_id": item["requirement_id"],
        "action_type": action_type,
        "title": f"استكمال دليل المتطلب: {title}",
        "description": "رفع أو تحديث مستند داعم يحتوي على دليل واضح ومباشر يثبت تغطية هذا المتطلب.",
        "priority": item.get("priority", "متوسطة"),
        "evidence_status": coverage_status,
    }




def get_resource_capabilities_for_gate(conn, resource_id: int):
    try:
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
    except Exception:
        return []


def get_resource_documents_for_gate(conn, resource_id: int):
    try:
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
    except Exception:
        return []


def normalize_resource_match_text(value: str | None):
    if not value:
        return ""

    text = value.lower()

    replacements = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
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


def extract_resource_matching_terms(*values: str | None):
    combined = normalize_resource_match_text(" ".join([value or "" for value in values]))

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
        "المطلوب",
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


def calculate_resource_match_score_for_gate(requirement: dict, resource: dict, capabilities: list, documents_count: int):
    requirement_title = requirement["title"]
    requirement_category = requirement["category"]
    requirement_priority = requirement["priority"]

    requirement_terms = extract_resource_matching_terms(
        requirement_title,
        requirement_category,
        requirement_priority,
    )

    resource_terms = extract_resource_matching_terms(
        resource.get("name"),
        resource.get("description"),
        resource.get("keywords"),
        resource.get("category"),
        resource.get("owner"),
    )

    capability_terms = []
    for capability in capabilities:
        capability_terms.extend(
            extract_resource_matching_terms(
                capability.get("capability_label"),
                capability.get("capability_description"),
                capability.get("keywords"),
            )
        )

    all_resource_terms = set(resource_terms + capability_terms)
    matched_terms = [term for term in requirement_terms if term in all_resource_terms]

    score = 0
    reasons = []

    if requirement.get("category") == resource.get("category"):
        score += 25
        reasons.append("نفس تصنيف المتطلب")

    if resource.get("status") == "active":
        score += 10
        reasons.append("المورد نشط داخل قاعدة موارد الشركة")

    if matched_terms:
        keyword_score = min(len(matched_terms) * 12, 36)
        score += keyword_score
        reasons.append("تطابق كلمات مفتاحية: " + ", ".join(matched_terms[:8]))

    normalized_requirement_title = normalize_resource_match_text(requirement_title)
    normalized_resource_name = normalize_resource_match_text(resource.get("name"))
    normalized_resource_description = normalize_resource_match_text(resource.get("description"))

    if normalized_requirement_title and normalized_requirement_title in normalized_resource_name:
        score += 30
        reasons.append("اسم المورد يغطي نص المتطلب مباشرة")
    elif normalized_resource_name and normalized_resource_name in normalized_requirement_title:
        score += 25
        reasons.append("اسم المورد مذكور ضمن المتطلب")
    elif any(word in normalized_resource_description for word in requirement_terms[:5]):
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


def build_company_resource_matching_summary(conn, tender_id: int):
    requirements = get_requirements_for_tender(conn, tender_id)

    try:
        resources_rows = conn.execute(
            """
            SELECT *
            FROM company_resources
            WHERE status = 'active'
            ORDER BY id
            """
        ).fetchall()
    except Exception:
        resources_rows = []

    resources = [dict(row) for row in resources_rows]
    matched_requirements = []
    total_best_score = 0
    requirements_with_usable_evidence = 0

    for requirement in requirements:
        resource_matches = []

        for resource in resources:
            capabilities = get_resource_capabilities_for_gate(conn, resource["id"])
            documents = get_resource_documents_for_gate(conn, resource["id"])
            documents_count = len(documents)

            match_result = calculate_resource_match_score_for_gate(
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
            key=lambda item: (item["match_score"], item["documents_count"]),
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
        resource_evidence_coverage_score = round(
            (requirements_with_usable_evidence / len(requirements)) * 100
        )
    else:
        resource_readiness_score = 0
        resource_evidence_coverage_score = 0

    if resource_evidence_coverage_score >= 90 and resource_readiness_score >= 80:
        agent_decision = "موارد الشركة تدعم المنافسة بقوة"
        recommended_next_action = "استخدم الموارد المطابقة كأدلة داعمة وانتقل إلى مراجعة التقديم."
    elif resource_evidence_coverage_score >= 60:
        agent_decision = "موارد الشركة تدعم المنافسة جزئيًا"
        recommended_next_action = "أغلق المتطلبات الضعيفة برفع مستندات داعمة إضافية."
    else:
        agent_decision = "توجد فجوات في ربط الموارد بالأدلة"
        recommended_next_action = "ارفع مستندات داعمة أو أضف موارد شركة جديدة قبل اعتماد التقديم."

    return {
        "resource_requirements_count": len(requirements),
        "resources_checked": len(resources),
        "resource_readiness_score": resource_readiness_score,
        "resource_evidence_coverage_score": resource_evidence_coverage_score,
        "requirements_with_usable_resource_evidence": requirements_with_usable_evidence,
        "resource_agent_decision": agent_decision,
        "resource_recommended_next_action": recommended_next_action,
        "requirements": matched_requirements,
        "engine": "deterministic_resource_matching_v1_embedded_in_submission_gate",
    }

def build_submission_gate(conn, tender_id: int):
    tender = find_tender_or_404(conn, tender_id)
    internal_analysis = build_analysis(conn, tender_id)
    documents_summary = build_tender_documents_coverage_summary(conn, tender_id)
    resources_summary = build_company_resource_matching_summary(conn, tender_id)

    internal_readiness_score = documents_summary["internal_readiness_score"]
    documents_coverage_score = documents_summary["documents_coverage_score"]
    documents_count = documents_summary["documents_count"]
    accepted_evidence_count = documents_summary.get("accepted_evidence_count", 0)
    evidence_sources_count = documents_summary.get(
        "evidence_sources_count",
        documents_count + accepted_evidence_count,
    )
    total_requirements = documents_summary["total_requirements"]
    uncovered_count = documents_summary["uncovered_count"]
    partial_count = documents_summary["partial_count"]

    resources_checked = resources_summary["resources_checked"]
    resource_readiness_score = resources_summary["resource_readiness_score"]
    resource_evidence_coverage_score = resources_summary["resource_evidence_coverage_score"]
    requirements_with_usable_resource_evidence = resources_summary[
        "requirements_with_usable_resource_evidence"
    ]
    resource_requirements_count = resources_summary["resource_requirements_count"]

    evidence_gaps = [
        item
        for item in documents_summary["requirements_document_coverage"]
        if item["best_document_coverage_status"] in ["غير مغطى", "مغطى جزئيًا"]
    ]

    critical_blockers = [
        item
        for item in evidence_gaps
        if item["priority"] == "عالية" or item["best_document_coverage_status"] == "غير مغطى"
    ]

    resource_gaps = [
        item
        for item in resources_summary.get("requirements", [])
        if not item.get("best_match")
        or item.get("best_score", 0) < 45
        or not item.get("best_match", {}).get("documents_count", 0)
    ]

    open_task_rows = conn.execute(
        """
        SELECT *
        FROM tasks
        WHERE tender_id = ?
        AND status != ?
        ORDER BY rowid DESC
        """,
        (tender_id, "مكتملة"),
    ).fetchall()

    open_tasks = [dict(row) for row in open_task_rows]
    open_gap_tasks = [
        task
        for task in open_tasks
        if (
            task.get("source") == DOC_GAP_TASK_SOURCE
            or task.get("source") == EVIDENCE_ACTION_PLAN_TASK_SOURCE
            or str(task.get("id", "")).startswith("DOC-GAP-")
            or str(task.get("id", "")).startswith("EAP-")
        )
    ]

    open_gap_task_requirement_ids = {
        task["linked_requirement_id"]
        for task in open_gap_tasks
        if task.get("linked_requirement_id") is not None
    }

    required_actions = []
    seen_action_requirement_ids = set()

    for item in critical_blockers:
        requirement_id = item["requirement_id"]

        if requirement_id in seen_action_requirement_ids:
            continue

        required_actions.append(build_required_action_for_gap(item))
        seen_action_requirement_ids.add(requirement_id)

    if not required_actions and evidence_gaps:
        for item in evidence_gaps:
            requirement_id = item["requirement_id"]

            if requirement_id in seen_action_requirement_ids:
                continue

            required_actions.append(build_required_action_for_gap(item))
            seen_action_requirement_ids.add(requirement_id)

    resource_required_actions = []
    for item in resource_gaps:
        best_match = item.get("best_match") or {}
        if not best_match:
            title = "إضافة مورد شركة داعم للمتطلب"
            description = "لا يوجد مورد مناسب في ذاكرة الشركة لهذا المتطلب. أضف موردًا أو خبرة أو قالبًا مناسبًا ثم أرفق مستندًا داعمًا."
        elif best_match.get("documents_count", 0) == 0:
            title = "رفع مستند داعم للمورد المطابق"
            description = f"المورد المطابق ({best_match.get('resource_name')}) موجود، لكنه لا يحتوي على مستند داعم يمكن استخدامه في قرار التقديم."
        else:
            title = "مراجعة قوة مطابقة المورد"
            description = "يوجد مورد محتمل، لكن درجة المطابقة منخفضة وتحتاج مراجعة أو تقوية بيانات المورد."

        resource_required_actions.append(
            {
                "requirement_id": item.get("requirement_id"),
                "requirement_title": item.get("requirement_title"),
                "action_type": "إغلاق فجوة موارد الشركة",
                "title": title,
                "description": description,
                "priority": item.get("requirement_priority", "متوسطة"),
                "resource_match_score": item.get("best_score", 0),
                "best_resource": best_match,
            }
        )

    checks = [
        {
            "key": "internal_readiness",
            "label": "الجاهزية الداخلية",
            "passed": internal_readiness_score >= 90,
            "value": internal_readiness_score,
            "required_value": 90,
            "message": "يجب أن تكون جاهزية المتطلبات الداخلية 90% أو أعلى قبل التقديم.",
        },
        {
            "key": "evidence_present",
            "label": "توفر أدلة الإثبات",
            "passed": evidence_sources_count > 0,
            "value": evidence_sources_count,
            "required_value": 1,
            "message": "يجب توفر مستند أو دليل مهمة مقبول واحد على الأقل لإثبات المتطلبات.",
        },
        {
            "key": "evidence_coverage",
            "label": "تغطية الأدلة",
            "passed": documents_coverage_score >= 90,
            "value": documents_coverage_score,
            "required_value": 90,
            "message": "يجب أن تثبت الأدلة 90% أو أكثر من المتطلبات قبل السماح بالتقديم.",
        },
        {
            "key": "uncovered_requirements",
            "label": "المتطلبات غير المثبتة",
            "passed": uncovered_count == 0,
            "value": uncovered_count,
            "required_value": 0,
            "message": "لا يسمح بالتقديم مع وجود متطلبات غير مغطاة بالأدلة.",
        },
        {
            "key": "open_gap_tasks",
            "label": "مهام فجوات الأدلة المفتوحة",
            "passed": len(open_gap_tasks) == 0,
            "value": len(open_gap_tasks),
            "required_value": 0,
            "message": "يجب إغلاق مهام فجوات الأدلة قبل اعتماد التقديم.",
        },
        {
            "key": "company_resources_available",
            "label": "توفر موارد الشركة",
            "passed": resources_checked > 0,
            "value": resources_checked,
            "required_value": 1,
            "message": "يجب توفر موارد شركة معرفة في ذاكرة الموارد قبل اعتماد قرار التقديم.",
        },
        {
            "key": "resource_readiness",
            "label": "مطابقة موارد الشركة",
            "passed": resource_readiness_score >= 80,
            "value": resource_readiness_score,
            "required_value": 80,
            "message": "يجب أن تغطي موارد الشركة المتطلبات بدرجة مطابقة 80% أو أعلى.",
        },
        {
            "key": "resource_evidence_coverage",
            "label": "أدلة موارد الشركة",
            "passed": resource_evidence_coverage_score >= 90,
            "value": resource_evidence_coverage_score,
            "required_value": 90,
            "message": "يجب أن تكون الموارد المطابقة مدعومة بمستندات كافية قبل السماح بالتقديم.",
        },
    ]

    failed_checks = [check for check in checks if not check["passed"]]
    blocking_reasons = [check["message"] for check in failed_checks]

    resource_checks_failed = any(
        check["key"] in [
            "company_resources_available",
            "resource_readiness",
            "resource_evidence_coverage",
        ]
        for check in failed_checks
    )

    if not failed_checks:
        can_submit = True
        gate_status = "PASSED"
        decision = "جاهز للتقديم"
        risk_level = "منخفض"
        recommendation = (
            "يمكن اعتماد المنافسة للتقديم بعد مراجعة بشرية نهائية؛ لأن الجاهزية الداخلية، "
            "أدلة المنافسة، وموارد الشركة المدعومة بالمستندات كلها اجتازت فحوصات البوابة."
        )
        next_best_action = "اعتماد حزمة التقديم النهائية وإرسالها لمسؤول المراجعة."
        human_review_required = True
    elif resource_checks_failed and internal_readiness_score >= 90 and documents_coverage_score >= 90:
        can_submit = False
        gate_status = "BLOCKED_BY_COMPANY_RESOURCES"
        decision = "محجوب بسبب فجوات موارد الشركة"
        risk_level = "عالٍ" if resource_evidence_coverage_score < 60 else "متوسط"
        recommendation = (
            "المستندات والجاهزية الداخلية جيدة، لكن ذاكرة موارد الشركة لا تدعم القرار بما يكفي. "
            "يجب إضافة موارد أو رفع مستندات داعمة للموارد المطابقة قبل اعتماد التقديم."
        )
        next_best_action = "إكمال إجراءات موارد الشركة المطلوبة ثم إعادة تشغيل بوابة التقديم."
        human_review_required = True
    elif internal_readiness_score >= 90 and documents_coverage_score < 90:
        can_submit = False
        gate_status = "BLOCKED_BY_EVIDENCE"
        decision = "محجوب بسبب ضعف الأدلة"
        risk_level = "عالٍ" if documents_coverage_score < 60 or uncovered_count > 0 else "متوسط"
        recommendation = "لا يعتمد التقديم حتى يتم استكمال الأدلة التي تثبت المتطلبات الحرجة."
        next_best_action = "إكمال مهام فجوات الأدلة أو رفع مستندات داعمة ثم إعادة تشغيل تحليل التغطية."
        human_review_required = True
    elif internal_readiness_score < 90:
        can_submit = False
        gate_status = "BLOCKED_BY_INTERNAL_READINESS"
        decision = "محجوب بسبب جاهزية داخلية غير مكتملة"
        risk_level = "عالٍ" if internal_readiness_score < 70 else "متوسط"
        recommendation = "لا يعتمد التقديم حتى يتم إغلاق فجوات المتطلبات الداخلية."
        next_best_action = "إكمال مهام المتطلبات الداخلية ثم إعادة تقييم الجاهزية."
        human_review_required = True
    else:
        can_submit = False
        gate_status = "CONDITIONAL_REVIEW_REQUIRED"
        decision = "يتطلب مراجعة مشروطة"
        risk_level = "متوسط"
        recommendation = "يمكن دراسة الدخول، لكن لا يسمح بالاعتماد النهائي قبل معالجة الفحوصات الفاشلة."
        next_best_action = "مراجعة الفحوصات الفاشلة وتحديد مالك لكل إجراء مطلوب."
        human_review_required = True

    return {
        "tender_id": tender_id,
        "tender_title": tender["title"],
        "client": tender["client"],
        "can_submit": can_submit,
        "gate_status": gate_status,
        "decision": decision,
        "risk_level": risk_level,
        "human_review_required": human_review_required,
        "internal_readiness_score": internal_readiness_score,
        "documents_coverage_score": documents_coverage_score,
        "documents_count": documents_count,
        "accepted_evidence_count": accepted_evidence_count,
        "evidence_sources_count": evidence_sources_count,
        "total_requirements": total_requirements,
        "covered_count": documents_summary["covered_count"],
        "partial_count": partial_count,
        "uncovered_count": uncovered_count,
        "open_tasks_count": len(open_tasks),
        "open_gap_tasks_count": len(open_gap_tasks),
        "critical_blockers_count": len(critical_blockers),
        "resources_checked": resources_checked,
        "resource_readiness_score": resource_readiness_score,
        "resource_evidence_coverage_score": resource_evidence_coverage_score,
        "resource_requirements_count": resource_requirements_count,
        "requirements_with_usable_resource_evidence": requirements_with_usable_resource_evidence,
        "resource_agent_decision": resources_summary["resource_agent_decision"],
        "resource_recommended_next_action": resources_summary["resource_recommended_next_action"],
        "resource_matches": resources_summary.get("requirements", []),
        "resource_required_actions": resource_required_actions,
        "critical_blockers": [
            {
                "requirement_id": item["requirement_id"],
                "requirement_title": item["requirement_title"],
                "priority": item["priority"],
                "evidence_status": item["best_document_coverage_status"],
                "confidence": item["confidence"],
                "best_evidence_document": item.get("best_evidence_document"),
                "reason": item["reason"],
            }
            for item in critical_blockers
        ],
        "evidence_gaps": [
            {
                "requirement_id": item["requirement_id"],
                "requirement_title": item["requirement_title"],
                "priority": item["priority"],
                "evidence_status": item["best_document_coverage_status"],
                "confidence": item["confidence"],
                "has_open_gap_task": item["requirement_id"] in open_gap_task_requirement_ids,
                "best_evidence_document": item.get("best_evidence_document"),
                "reason": item["reason"],
            }
            for item in evidence_gaps
        ],
        "required_actions": required_actions,
        "checks": checks,
        "failed_checks": failed_checks,
        "blocking_reasons": blocking_reasons,
        "recommendation": recommendation,
        "next_best_action": next_best_action,
        "audit_trail": {
            "engine": "deterministic_submission_gate_v3_resource_aware",
            "rules": [
                "internal_readiness_score must be >= 90",
                "documents_coverage_score must be >= 90",
                "uncovered_count must be 0",
                "evidence_sources_count must be greater than 0",
                "open_gap_tasks_count must be 0",
                "resources_checked must be greater than 0",
                "resource_readiness_score must be >= 80",
                "resource_evidence_coverage_score must be >= 90",
            ],
            "internal_analysis": internal_analysis,
            "documents_summary_recommendation": documents_summary["recommendation"],
            "documents_summary_decision_note": documents_summary.get("decision_note"),
            "resources_summary_recommendation": resources_summary["resource_recommended_next_action"],
            "resources_summary_decision": resources_summary["resource_agent_decision"],
            "resources_engine": resources_summary["engine"],
        },
    }

def choose_required_document_type(requirement_title: str, category: str):
    normalized_title = normalize_text(requirement_title)

    if "iso" in normalized_title or "27001" in normalized_title:
        return {
            "document_type": "شهادة امتثال",
            "required_evidence": "شهادة ISO 27001 واضحة وسارية",
            "acceptance_criteria": [
                "ظهور اسم الشركة أو الجهة المالكة للشهادة بوضوح",
                "ظهور رقم الشهادة أو جهة الإصدار إن وجد",
                "ظهور تاريخ السريان أو ما يثبت أن الشهادة سارية",
                "أن يكون الملف قابلًا للقراءة والاستخراج النصي قدر الإمكان",
            ],
            "recommended_upload_label": "شهادة ISO 27001",
        }

    if "مهندس" in normalized_title and "شبكات" in normalized_title:
        return {
            "document_type": "دليل مورد فني",
            "required_evidence": "سيرة ذاتية أو شهادة مهنية أو خطاب تعيين يثبت وجود مهندس شبكات معتمد",
            "acceptance_criteria": [
                "ظهور اسم المهندس أو الدور الوظيفي",
                "ظهور تخصص الشبكات أو الشهادة المهنية مثل CCNA أو CCNP أو ما يعادلها",
                "ربط المورد المقترح بالمشروع أو فريق التنفيذ",
                "وضوح تاريخ الشهادة أو صلاحيتها إن كانت شهادة اعتماد",
            ],
            "recommended_upload_label": "سيرة ذاتية / شهادة مهندس شبكات",
        }

    if "سابقه" in normalized_title or "اعمال" in normalized_title or "خبر" in normalized_title:
        return {
            "document_type": "دليل خبرة وسابقة أعمال",
            "required_evidence": "خطاب إنجاز أو عقد أو شهادة إتمام مشروع مشابه خلال آخر 5 سنوات",
            "acceptance_criteria": [
                "ظهور اسم المشروع أو العميل",
                "إثبات أن المشروع مشابه لنطاق المنافسة",
                "وجود تاريخ يثبت أن الخبرة ضمن آخر 5 سنوات عند الحاجة",
                "ظهور ما يثبت الإنجاز أو التعاقد أو التسليم",
            ],
            "recommended_upload_label": "سابقة أعمال موثقة",
        }

    if "elv" in normalized_title or "المجمعات التعليميه" in normalized_title or "المجمعات التعليمية" in requirement_title:
        return {
            "document_type": "دليل خبرة فنية متخصصة",
            "required_evidence": "خطاب إنجاز أو شهادة مشروع تثبت تنفيذ أنظمة ELV في بيئة تعليمية أو حرم جامعي",
            "acceptance_criteria": [
                "ذكر أنظمة ELV أو أنظمة التيار الخفيف أو الأنظمة الأمنية/الصوتية/المرئية",
                "ظهور بيئة تعليمية أو جامعة أو مجمع تعليمي عند الإمكان",
                "إثبات التنفيذ أو التسليم وليس مجرد عرض تسويقي",
                "تطابق النطاق مع متطلبات المنافسة بشكل واضح",
            ],
            "recommended_upload_label": "مشروع ELV تعليمي سابق",
        }

    if "خطه" in normalized_title or "تنفيذ" in normalized_title:
        return {
            "document_type": "خطة تنفيذ فنية/إدارية",
            "required_evidence": "خطة تنفيذ متكاملة تشمل المراحل، المنهجية، الجدول الزمني، الأدوار، وآلية الاختبار والتسليم",
            "acceptance_criteria": [
                "وجود مراحل تنفيذ واضحة",
                "وجود جدول زمني أو برنامج عمل",
                "تحديد المسؤوليات أو فرق العمل",
                "توضيح الاختبار والتشغيل والتسليم النهائي",
            ],
            "recommended_upload_label": "خطة تنفيذ المشروع",
        }

    if "24" in normalized_title or "تشغيل" in normalized_title or "مركز عمليات" in normalized_title:
        return {
            "document_type": "خطة تشغيل أو دليل فريق تشغيل",
            "required_evidence": "خطة تشغيل أو هيكل فريق يثبت القدرة على التشغيل والدعم حسب متطلبات المنافسة",
            "acceptance_criteria": [
                "توضيح نموذج التشغيل أو المناوبات",
                "تحديد الأدوار والمسؤوليات",
                "توضيح آلية التصعيد والاستجابة",
                "إثبات القدرة على التشغيل المستمر إذا كان مطلوبًا 24/7",
            ],
            "recommended_upload_label": "خطة تشغيل / فريق تشغيل",
        }

    if "siem" in normalized_title or "soar" in normalized_title:
        return {
            "document_type": "دليل تكامل تقني",
            "required_evidence": "مستند تصميم أو خطة تكامل توضح الربط مع أدوات SIEM و SOAR أو ما يعادلها",
            "acceptance_criteria": [
                "ذكر أدوات SIEM أو SOAR بوضوح",
                "توضيح آلية التكامل أو تدفق البيانات",
                "تحديد المسؤوليات التقنية أو نقاط الربط",
                "وجود خطة اختبار أو تحقق من التكامل",
            ],
            "recommended_upload_label": "خطة تكامل SIEM/SOAR",
        }

    if category == "شهادات":
        return {
            "document_type": "شهادة داعمة",
            "required_evidence": "شهادة أو اعتماد رسمي يثبت تغطية المتطلب",
            "acceptance_criteria": [
                "وضوح اسم الشهادة أو الاعتماد",
                "وضوح الجهة المالكة أو جهة الإصدار",
                "وضوح تاريخ السريان إن وجد",
            ],
            "recommended_upload_label": "شهادة داعمة",
        }

    if category == "خبرات":
        return {
            "document_type": "مرجع خبرة",
            "required_evidence": "مستند خبرة أو مرجع مشروع يثبت تنفيذ نطاق مشابه",
            "acceptance_criteria": [
                "ذكر اسم المشروع أو العميل",
                "وجود علاقة واضحة بين المشروع السابق والمتطلب الحالي",
                "وجود دليل إنجاز أو تعاقد أو تسليم",
            ],
            "recommended_upload_label": "مرجع خبرة",
        }

    if category in ["فني", "تقني"]:
        return {
            "document_type": "دليل فني",
            "required_evidence": "مستند فني أو شهادة أو ملف داعم يثبت قدرة الفريق على تلبية المتطلب",
            "acceptance_criteria": [
                "تغطية المتطلب بعبارة واضحة ومباشرة",
                "وجود دليل مرتبط بالنطاق الفني المطلوب",
                "وضوح المصدر أو الوثيقة الداعمة",
            ],
            "recommended_upload_label": "دليل فني داعم",
        }

    return {
        "document_type": "مستند داعم",
        "required_evidence": "رفع أو تحديث مستند داعم يحتوي على دليل واضح ومباشر يثبت تغطية هذا المتطلب",
        "acceptance_criteria": [
            "ذكر المتطلب أو ما يعادله بشكل واضح",
            "وجود دليل قابل للتحقق وليس مجرد عبارة عامة",
            "وضوح ارتباط المستند بالمنافسة الحالية",
        ],
        "recommended_upload_label": "مستند داعم للمتطلب",
    }


def get_open_tasks_for_tender_by_requirement(conn, tender_id: int):
    rows = conn.execute(
        """
        SELECT *
        FROM tasks
        WHERE tender_id = ?
        AND status != ?
        ORDER BY rowid DESC
        """,
        (tender_id, "مكتملة"),
    ).fetchall()

    tasks_by_requirement = {}

    for row in rows:
        task = dict(row)
        requirement_id = task.get("linked_requirement_id")

        if requirement_id is None:
            continue

        tasks_by_requirement.setdefault(requirement_id, []).append(task)

    return tasks_by_requirement


def build_evidence_action_item(conn, tender_id: int, item: dict, open_tasks_by_requirement: dict):
    requirement_id = item["requirement_id"]
    requirement_title = item["requirement_title"]
    category = item.get("category", "غير محدد")
    priority = item.get("priority", "متوسطة")
    evidence_status = item.get("best_document_coverage_status", "غير مغطى")
    confidence = item.get("confidence", "منخفضة")
    current_system_status = item.get("current_system_status", "غير محدد")
    matched_keywords = item.get("matched_keywords") or []
    existing_open_tasks = open_tasks_by_requirement.get(requirement_id, [])
    required_document = choose_required_document_type(requirement_title, category)

    is_critical = priority == "عالية" or evidence_status == "غير مغطى"

    if evidence_status == "غير مغطى":
        gap_type = "فجوة حرجة"
        impact_on_submission = "مانع للتقديم"
        action_title = f"إغلاق فجوة دليل: {requirement_title}"
        next_step = f"رفع {required_document['recommended_upload_label']} ثم إعادة تشغيل تحليل التغطية."
    elif evidence_status == "مغطى جزئيًا":
        gap_type = "دليل غير مكتمل"
        impact_on_submission = "يضعف قرار التقديم"
        action_title = f"استكمال دليل المتطلب: {requirement_title}"
        next_step = f"تحديث المستند الحالي أو رفع {required_document['recommended_upload_label']} أقوى لإثبات المتطلب."
    else:
        gap_type = "مغطى"
        impact_on_submission = "لا يمنع التقديم"
        action_title = f"مراجعة دليل المتطلب: {requirement_title}"
        next_step = "لا يوجد إجراء إلزامي، ويمكن الاكتفاء بمراجعة بشرية نهائية."

    if current_system_status != "مغطى" and evidence_status != "مغطى":
        root_cause = "فجوة مزدوجة: المتطلب غير مكتمل داخليًا ولا توجد أدلة كافية في المستندات."
    elif current_system_status == "مغطى" and evidence_status != "مغطى":
        root_cause = "الفريق يبدو جاهزًا داخليًا، لكن الأدلة المرفوعة لا تثبت هذه الجاهزية."
    elif current_system_status != "مغطى" and evidence_status == "مغطى":
        root_cause = "يوجد دليل في المستندات، لكن حالة المتطلب داخل النظام تحتاج تحديثًا."
    else:
        root_cause = "المتطلب مغطى داخليًا ومدعوم بمستندات كافية."

    if existing_open_tasks:
        execution_status = "قيد التنفيذ"
    elif evidence_status == "مغطى" and current_system_status == "مغطى":
        execution_status = "مغلق منطقيًا"
    else:
        execution_status = "تحتاج تنفيذ"

    return {
        "id": f"EAP-{tender_id}-{requirement_id}",
        "tender_id": tender_id,
        "requirement_id": requirement_id,
        "requirement_title": requirement_title,
        "category": category,
        "owner": suggest_owner(category),
        "priority": priority,
        "gap_type": gap_type,
        "is_critical": is_critical,
        "impact_on_submission": impact_on_submission,
        "current_system_status": current_system_status,
        "evidence_status": evidence_status,
        "confidence": confidence,
        "best_evidence_document": item.get("best_evidence_document"),
        "matched_keywords": matched_keywords,
        "root_cause": root_cause,
        "required_document_type": required_document["document_type"],
        "required_evidence": required_document["required_evidence"],
        "recommended_upload_label": required_document["recommended_upload_label"],
        "acceptance_criteria": required_document["acceptance_criteria"],
        "action_title": action_title,
        "next_step": next_step,
        "verification_method": "بعد رفع المستند أو تحديثه، شغّل استخراج النص ثم تحليل التغطية للتأكد من تحوّل حالة المتطلب إلى مغطى.",
        "existing_open_tasks": [
            {
                "id": task["id"],
                "title": task["title"],
                "status": task["status"],
                "owner": task["owner"],
                "source": task.get("source"),
            }
            for task in existing_open_tasks
        ],
        "execution_status": execution_status,
    }


def action_priority_rank(action: dict):
    impact_rank = 0 if action["impact_on_submission"] == "مانع للتقديم" else 1
    priority_rank = 0 if action["priority"] == "عالية" else 1 if action["priority"] == "متوسطة" else 2
    coverage_rank = 0 if action["evidence_status"] == "غير مغطى" else 1 if action["evidence_status"] == "مغطى جزئيًا" else 2
    return (impact_rank, priority_rank, coverage_rank, action["requirement_id"])


def build_evidence_action_plan(conn, tender_id: int):
    tender = find_tender_or_404(conn, tender_id)
    documents_summary = build_tender_documents_coverage_summary(conn, tender_id)
    submission_gate = build_submission_gate(conn, tender_id)
    open_tasks_by_requirement = get_open_tasks_for_tender_by_requirement(conn, tender_id)

    coverage_items = documents_summary.get("requirements_document_coverage", [])
    action_candidates = []

    for item in coverage_items:
        evidence_status = item.get("best_document_coverage_status")
        internal_status = item.get("current_system_status")

        if evidence_status != "مغطى" or internal_status != "مغطى":
            action_candidates.append(item)

    action_items = [
        build_evidence_action_item(conn, tender_id, item, open_tasks_by_requirement)
        for item in action_candidates
    ]
    action_items = sorted(action_items, key=action_priority_rank)

    critical_actions = [
        action for action in action_items
        if action["impact_on_submission"] == "مانع للتقديم" or action["is_critical"]
    ]
    quick_wins = [
        action for action in action_items
        if action["evidence_status"] == "مغطى جزئيًا" or action["current_system_status"] == "مغطى جزئيًا"
    ][:3]
    high_priority_actions = [action for action in action_items if action["priority"] == "عالية"]
    actions_with_existing_tasks = [action for action in action_items if action["existing_open_tasks"]]
    actions_without_tasks = [
        action for action in action_items
        if not action["existing_open_tasks"] and action["execution_status"] != "مغلق منطقيًا"
    ]

    if submission_gate["can_submit"]:
        plan_status = "CLEARED"
        executive_note = "لا توجد فجوات تمنع التقديم. يوصى بمراجعة بشرية نهائية قبل اعتماد الحزمة."
    elif critical_actions:
        plan_status = "NEEDS_CRITICAL_ACTION"
        executive_note = "توجد فجوات حرجة تمنع اعتماد التقديم. يجب تنفيذ عناصر خطة الإغلاق بالترتيب قبل القرار النهائي."
    elif action_items:
        plan_status = "NEEDS_ACTION"
        executive_note = "توجد فجوات غير حرجة أو أدلة جزئية. يمكن دراسة الدخول، لكن لا يعتمد التقديم قبل إكمال الخطة."
    else:
        plan_status = "REVIEW_REQUIRED"
        executive_note = "لا توجد فجوات واضحة في الخطة، لكن بوابة التقديم ما زالت تحتاج مراجعة الفحوصات الفاشلة."

    recommended_sequence = [
        {
            "order": index + 1,
            "requirement_id": action["requirement_id"],
            "title": action["action_title"],
            "owner": action["owner"],
            "priority": action["priority"],
            "impact_on_submission": action["impact_on_submission"],
            "next_step": action["next_step"],
        }
        for index, action in enumerate(action_items)
    ]

    return {
        "tender_id": tender_id,
        "tender_title": tender["title"],
        "client": tender["client"],
        "plan_status": plan_status,
        "can_submit": submission_gate["can_submit"],
        "submission_gate_status": submission_gate["gate_status"],
        "submission_decision": submission_gate["decision"],
        "submission_risk_level": submission_gate["risk_level"],
        "internal_readiness_score": documents_summary["internal_readiness_score"],
        "documents_coverage_score": documents_summary["documents_coverage_score"],
        "documents_count": documents_summary["documents_count"],
        "total_requirements": documents_summary["total_requirements"],
        "plan_summary": {
            "total_actions": len(action_items),
            "critical_actions_count": len(critical_actions),
            "high_priority_actions_count": len(high_priority_actions),
            "quick_wins_count": len(quick_wins),
            "actions_with_existing_tasks_count": len(actions_with_existing_tasks),
            "actions_without_tasks_count": len(actions_without_tasks),
        },
        "executive_note": executive_note,
        "action_items": action_items,
        "critical_actions": critical_actions,
        "quick_wins": quick_wins,
        "recommended_sequence": recommended_sequence,
        "blocking_reasons": submission_gate.get("blocking_reasons", []),
        "next_best_action": submission_gate.get("next_best_action"),
        "audit_trail": {
            "engine": "deterministic_evidence_action_plan_v1",
            "source": "documents_coverage_summary + submission_gate + open_tasks",
            "submission_gate_status": submission_gate["gate_status"],
            "submission_gate_rules": submission_gate.get("audit_trail", {}).get("rules", []),
        },
    }


def create_tasks_from_evidence_action_plan(conn, tender_id: int):
    plan = build_evidence_action_plan(conn, tender_id)

    existing_rows = conn.execute(
        """
        SELECT id, linked_requirement_id, status, source
        FROM tasks
        WHERE tender_id = ?
        ORDER BY rowid DESC
        """,
        (tender_id,),
    ).fetchall()

    existing_task_ids = {row["id"] for row in existing_rows}
    open_requirement_ids = {
        row["linked_requirement_id"]
        for row in existing_rows
        if row["status"] != "مكتملة" and row["linked_requirement_id"] is not None
    }

    created_tasks = []
    skipped_tasks = []

    for action in plan["action_items"]:
        if action["execution_status"] == "مغلق منطقيًا":
            skipped_tasks.append(
                {
                    "id": action["id"],
                    "requirement_id": action["requirement_id"],
                    "reason": "العنصر مغلق منطقيًا ولا يحتاج مهمة جديدة.",
                }
            )
            continue

        task_id = action["id"]
        requirement_id = action["requirement_id"]

        if task_id in existing_task_ids or requirement_id in open_requirement_ids:
            skipped_tasks.append(
                {
                    "id": task_id,
                    "requirement_id": requirement_id,
                    "reason": "توجد مهمة مفتوحة مسبقًا لنفس المتطلب، لذلك لم يتم إنشاء مهمة مكررة.",
                }
            )
            continue

        acceptance_criteria_text = " | ".join(action["acceptance_criteria"])
        reason = (
            f"خطة إغلاق فجوات التقديم حددت أن هذا المتطلب يحتاج إجراء. "
            f"حالة الدليل: {action['evidence_status']}. "
            f"الأثر على التقديم: {action['impact_on_submission']}. "
            f"المستند المطلوب: {action['required_evidence']}. "
            f"معايير القبول: {acceptance_criteria_text}. "
            f"الخطوة التالية: {action['next_step']}"
        )

        new_task = {
            "id": task_id,
            "tender_id": tender_id,
            "linked_requirement_id": requirement_id,
            "title": action["action_title"],
            "owner": action["owner"],
            "priority": action["priority"],
            "status": "مفتوحة",
            "reason": reason,
            "category": action["category"],
            "source": EVIDENCE_ACTION_PLAN_TASK_SOURCE,
        }

        conn.execute(
            """
            INSERT INTO tasks
            (id, tender_id, linked_requirement_id, title, owner, priority, status, reason, category, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_task["id"],
                new_task["tender_id"],
                new_task["linked_requirement_id"],
                new_task["title"],
                new_task["owner"],
                new_task["priority"],
                new_task["status"],
                new_task["reason"],
                new_task["category"],
                new_task["source"],
            ),
        )

        created_tasks.append(new_task)
        existing_task_ids.add(task_id)
        open_requirement_ids.add(requirement_id)

    conn.commit()

    return {
        "plan": plan,
        "created_count": len(created_tasks),
        "skipped_count": len(skipped_tasks),
        "created_tasks": created_tasks,
        "skipped_tasks": skipped_tasks,
    }


def is_evidence_required_task(task: dict):
    task_id = str(task.get("id", ""))
    source = task.get("source") or ""

    return (
        task_id.startswith("DOC-GAP-")
        or task_id.startswith("EAP-")
        or "فجوات المستند" in source
        or "خطة إغلاق فجوات" in source
    )


def parse_json_list(value: str | None):
    if not value:
        return []

    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def get_latest_task_evidence(conn, task_id: str):
    row = conn.execute(
        """
        SELECT *
        FROM task_evidence_submissions
        WHERE task_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (task_id,),
    ).fetchone()

    if not row:
        return None

    item = dict(row)
    item["matched_keywords"] = parse_json_list(item.get("matched_keywords"))
    return item


def decorate_task_with_evidence(conn, task: dict):
    evidence_required = is_evidence_required_task(task)
    latest_evidence = get_latest_task_evidence(conn, task["id"])

    task["evidence_required"] = "yes" if evidence_required else (task.get("evidence_required") or "no")
    task["latest_evidence"] = latest_evidence
    task["latest_evidence_status"] = (
        latest_evidence["verification_status"]
        if latest_evidence
        else ("required" if evidence_required and task.get("status") != "مكتملة" else task.get("evidence_status") or "not_required")
    )
    task["can_complete_manually"] = not evidence_required
    task["closure_policy"] = (
        "لا تغلق هذه المهمة إلا بعد رفع دليل وتحليله بنجاح."
        if evidence_required
        else "يمكن إغلاق هذه المهمة يدويًا."
    )

    return task


def store_task_evidence_document(conn, tender_id: int, file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is missing")

    tender_folder = DOCUMENTS_DIR / str(tender_id)
    tender_folder.mkdir(parents=True, exist_ok=True)

    extension = Path(file.filename).suffix or ".bin"
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    file_path = tender_folder / stored_filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_at = datetime.utcnow().isoformat()

        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO tender_documents
            (
                tender_id,
                original_filename,
                stored_filename,
                file_path,
                mime_type,
                extraction_status,
                extracted_text,
                uploaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tender_id,
                file.filename,
                stored_filename,
                str(file_path),
                file.content_type,
                "pending",
                None,
                uploaded_at,
            ),
        )

        document_id = cur.lastrowid
        conn.commit()

        document = conn.execute(
            "SELECT * FROM tender_documents WHERE id = ?",
            (document_id,),
        ).fetchone()

        return dict(document)

    except Exception:
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        raise

    finally:
        file.file.close()


def extract_text_from_any_document(conn, document: dict):
    file_path = Path(document["file_path"])
    mime_type = (document.get("mime_type") or "").lower()
    suffix = file_path.suffix.lower()

    if suffix == ".pdf" or "pdf" in mime_type:
        return ensure_document_text_is_extracted(conn, document)

    extracted_text = ""

    if file_path.exists():
        try:
            extracted_text = file_path.read_text(encoding="utf-8", errors="ignore").strip()
        except Exception:
            extracted_text = ""

    if not extracted_text:
        extracted_text = (
            f"تم رفع مستند داعم باسم: {document['original_filename']}. "
            "لم يتم استخراج نص كافٍ تلقائيًا من الملف، لذلك يفضل إضافة وصف نصي للدليل."
        )

    conn.execute(
        """
        UPDATE tender_documents
        SET extraction_status = ?, extracted_text = ?
        WHERE id = ? AND tender_id = ?
        """,
        ("completed", extracted_text, document["id"], document["tender_id"]),
    )
    conn.commit()

    return extracted_text


def close_requirement_tasks_after_verified_evidence(
    conn,
    tender_id: int,
    requirement_id: int,
    document_id: int | None,
    reason: str,
):
    verified_at = datetime.utcnow().isoformat()

    conn.execute(
        """
        UPDATE tasks
        SET status = ?,
            evidence_required = ?,
            evidence_status = ?,
            verified_document_id = COALESCE(?, verified_document_id),
            verified_at = ?,
            last_verification_reason = ?
        WHERE tender_id = ?
        AND linked_requirement_id = ?
        AND (
            id LIKE 'DOC-GAP-%'
            OR id LIKE 'EAP-%'
            OR source LIKE '%فجوات المستند%'
            OR source LIKE '%خطة إغلاق فجوات%'
        )
        """,
        (
            "مكتملة",
            "yes",
            "accepted",
            document_id,
            verified_at,
            reason,
            tender_id,
            requirement_id,
        ),
    )

    conn.execute(
        """
        UPDATE requirements
        SET status = ?
        WHERE id = ? AND tender_id = ?
        """,
        ("مغطى", requirement_id, tender_id),
    )

    sync_tender_readiness(conn, tender_id)
    conn.commit()


def build_task_evidence_verification(
    conn,
    task: dict,
    evidence_text: str,
    document_id: int | None,
):
    requirement = conn.execute(
        """
        SELECT *
        FROM requirements
        WHERE id = ? AND tender_id = ?
        """,
        (task["linked_requirement_id"], task["tender_id"]),
    ).fetchone()

    if not requirement:
        raise HTTPException(status_code=404, detail="Linked requirement not found")

    requirement = dict(requirement)
    analysis = analyze_requirement_against_text(requirement, evidence_text)

    accepted = analysis["document_coverage_status"] == "مغطى"
    verification_status = "accepted" if accepted else "rejected"

    if accepted:
        decision_reason = (
            "تم قبول الدليل لأنه يغطي المتطلب بشكل واضح وفق تحليل الكلمات والمؤشرات المطابقة. "
            f"سبب التحليل: {analysis['reason']}"
        )
    else:
        decision_reason = (
            "لم يتم إغلاق المهمة لأن الدليل لا يثبت المتطلب بدرجة كافية. "
            f"حالة التغطية: {analysis['document_coverage_status']}. "
            f"سبب التحليل: {analysis['reason']}"
        )

    submitted_at = datetime.utcnow().isoformat()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO task_evidence_submissions
        (
            task_id,
            tender_id,
            linked_requirement_id,
            document_id,
            evidence_text,
            verification_status,
            coverage_status,
            confidence,
            matched_keywords,
            decision_reason,
            submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task["id"],
            task["tender_id"],
            task["linked_requirement_id"],
            document_id,
            evidence_text,
            verification_status,
            analysis["document_coverage_status"],
            analysis["confidence"],
            json.dumps(analysis["matched_keywords"], ensure_ascii=False),
            decision_reason,
            submitted_at,
        ),
    )

    evidence_id = cur.lastrowid

    conn.execute(
        """
        UPDATE tasks
        SET evidence_required = ?,
            evidence_status = ?,
            verified_document_id = CASE WHEN ? = 'accepted' THEN ? ELSE verified_document_id END,
            verified_at = CASE WHEN ? = 'accepted' THEN ? ELSE verified_at END,
            last_verification_reason = ?
        WHERE id = ?
        """,
        (
            "yes" if is_evidence_required_task(task) else "no",
            verification_status,
            verification_status,
            document_id,
            verification_status,
            submitted_at,
            decision_reason,
            task["id"],
        ),
    )

    if accepted:
        close_requirement_tasks_after_verified_evidence(
            conn=conn,
            tender_id=task["tender_id"],
            requirement_id=task["linked_requirement_id"],
            document_id=document_id,
            reason=decision_reason,
        )
    else:
        conn.commit()

    evidence_row = conn.execute(
        """
        SELECT *
        FROM task_evidence_submissions
        WHERE id = ?
        """,
        (evidence_id,),
    ).fetchone()

    evidence = dict(evidence_row)
    evidence["matched_keywords"] = parse_json_list(evidence.get("matched_keywords"))

    return {
        "accepted": accepted,
        "verification_status": verification_status,
        "analysis": analysis,
        "evidence": evidence,
        "decision_reason": decision_reason,
    }


def build_evidence_binder(conn, tender_id: int):
    tender = find_tender_or_404(conn, tender_id)
    documents_summary = build_tender_documents_coverage_summary(conn, tender_id)
    submission_gate = build_submission_gate(conn, tender_id)

    task_rows = conn.execute(
        """
        SELECT *
        FROM tasks
        WHERE tender_id = ?
        ORDER BY rowid DESC
        """,
        (tender_id,),
    ).fetchall()

    tasks = [decorate_task_with_evidence(conn, dict(row)) for row in task_rows]

    tasks_by_requirement = {}
    for task in tasks:
        tasks_by_requirement.setdefault(task["linked_requirement_id"], []).append(task)

    binder_items = []

    for item in documents_summary["requirements_document_coverage"]:
        requirement_id = item["requirement_id"]
        related_tasks = tasks_by_requirement.get(requirement_id, [])
        latest_verified_evidence = None

        for task in related_tasks:
            latest = task.get("latest_evidence")
            if latest and latest.get("verification_status") == "accepted":
                latest_verified_evidence = latest
                break

        evidence_status = item["best_document_coverage_status"]
        has_defensible_evidence = evidence_status == "مغطى" or latest_verified_evidence is not None

        binder_items.append(
            {
                "requirement_id": requirement_id,
                "requirement_title": item["requirement_title"],
                "category": item["category"],
                "priority": item["priority"],
                "internal_status": item["current_system_status"],
                "best_document_coverage_status": evidence_status,
                "confidence": item["confidence"],
                "best_evidence_document": item.get("best_evidence_document"),
                "evidence_source": item.get("evidence_source"),
                "matched_keywords": item.get("matched_keywords", []),
                "reason": item["reason"],
                "related_tasks_count": len(related_tasks),
                "open_related_tasks_count": len(
                    [task for task in related_tasks if task["status"] != "مكتملة"]
                ),
                "latest_verified_evidence": latest_verified_evidence,
                "decision": (
                    "مثبت وقابل للدفاع"
                    if has_defensible_evidence
                    else "يحتاج دليل إضافي"
                ),
            }
        )

    return {
        "tender_id": tender_id,
        "tender_title": tender["title"],
        "client": tender["client"],
        "submission_gate_status": submission_gate["gate_status"],
        "can_submit": submission_gate["can_submit"],
        "internal_readiness_score": documents_summary["internal_readiness_score"],
        "documents_coverage_score": documents_summary["documents_coverage_score"],
        "documents_count": documents_summary["documents_count"],
        "accepted_evidence_count": documents_summary.get("accepted_evidence_count", 0),
        "evidence_sources_count": documents_summary.get("evidence_sources_count", documents_summary["documents_count"]),
        "requirements_count": documents_summary["total_requirements"],
        "binder_items": binder_items,
        "audit_trail": {
            "engine": "evidence_binder_v2_task_evidence_aware",
            "source": "requirements + tender_documents + accepted_task_evidence_submissions + submission_gate",
            "generated_at": datetime.utcnow().isoformat(),
        },
    }

@router.get("/system/tasks")
def list_system_tasks():
    conn = get_connection()

    rows = conn.execute(
        "SELECT * FROM tasks ORDER BY rowid DESC"
    ).fetchall()

    tasks = [decorate_task_with_evidence(conn, dict(row)) for row in rows]

    conn.close()

    return tasks


@router.post("/system/tasks/deduplicate-document-gaps")
def deduplicate_all_document_gap_tasks():
    conn = get_connection()

    result = deduplicate_document_gap_tasks(conn)

    conn.close()

    return {
        "message": "تم تنظيف مهام فجوات المستندات المكررة",
        "kept_count": result["kept_count"],
        "deleted_count": result["deleted_count"],
        "deleted_tasks": result["deleted_tasks"],
    }


@router.post("/approve-suggested-tasks")
def approve_suggested_tasks(payload: SuggestedTasksApprovalRequest):
    conn = get_connection()
    find_tender_or_404(conn, payload.tender_id)

    suggested_tasks = build_suggested_tasks(conn, payload.tender_id)
    created_tasks = []

    existing_rows = conn.execute("SELECT id FROM tasks").fetchall()
    existing_ids = {row["id"] for row in existing_rows}

    for task in suggested_tasks:
        if task["id"] in existing_ids:
            continue

        new_task = {
            **task,
            "status": "مفتوحة",
            "source": "تم إنشاؤها من اقتراح الوكيل",
        }

        conn.execute(
            """
            INSERT INTO tasks
            (id, tender_id, linked_requirement_id, title, owner, priority, status, reason, category, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_task["id"],
                new_task["tender_id"],
                new_task["linked_requirement_id"],
                new_task["title"],
                new_task["owner"],
                new_task["priority"],
                new_task["status"],
                new_task["reason"],
                new_task["category"],
                new_task["source"],
            ),
        )

        created_tasks.append(new_task)

    sync_tender_readiness(conn, payload.tender_id)

    conn.commit()
    conn.close()

    return {
        "message": "تم اعتماد المهام المقترحة",
        "created_count": len(created_tasks),
        "tasks": created_tasks,
    }


@router.post("/system/tasks/{task_id}/complete")
def complete_system_task(task_id: str):
    conn = get_connection()

    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    task = dict(task)

    if task["status"] == "مكتملة":
        analysis = build_analysis(conn, task["tender_id"])
        decorated_task = decorate_task_with_evidence(conn, task)

        conn.close()

        return {
            "message": "المهمة مكتملة مسبقًا",
            "task": decorated_task,
            "updated_analysis": analysis,
        }

    if is_evidence_required_task(task):
        latest_evidence = get_latest_task_evidence(conn, task_id)

        if not latest_evidence or latest_evidence["verification_status"] != "accepted":
            conn.close()
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "لا يمكن إكمال هذه المهمة يدويًا لأنها تتطلب دليلًا مقبولًا.",
                    "required_action": "استخدم endpoint رفع الدليل وإغلاق المهمة: POST /tenders/{tender_id}/tasks/{task_id}/submit-evidence",
                    "task_id": task_id,
                    "latest_evidence_status": latest_evidence["verification_status"] if latest_evidence else None,
                },
            )

    conn.execute(
        "UPDATE tasks SET status = ? WHERE id = ?",
        ("مكتملة", task_id),
    )

    conn.execute(
        "UPDATE requirements SET status = ? WHERE id = ?",
        ("مغطى", task["linked_requirement_id"]),
    )

    sync_tender_readiness(conn, task["tender_id"])

    updated_task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    analysis = build_analysis(conn, task["tender_id"])
    decorated_task = decorate_task_with_evidence(conn, dict(updated_task))

    conn.commit()
    conn.close()

    return {
        "message": "تم إكمال المهمة وتحديث حالة المتطلب",
        "task": decorated_task,
        "updated_analysis": analysis,
    }


@router.get("")
def list_tenders():
    conn = get_connection()

    tender_rows = conn.execute("SELECT id FROM tenders").fetchall()

    for row in tender_rows:
        sync_tender_readiness(conn, row["id"])

    rows = conn.execute("SELECT * FROM tenders ORDER BY id").fetchall()

    conn.close()

    return [dict(row) for row in rows]


@router.get("/{tender_id}")
def get_tender(tender_id: int):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)
    sync_tender_readiness(conn, tender_id)

    tender = conn.execute(
        "SELECT * FROM tenders WHERE id = ?",
        (tender_id,),
    ).fetchone()

    conn.close()

    return dict(tender)


@router.get("/{tender_id}/requirements")
def get_tender_requirements(tender_id: int):
    conn = get_connection()

    requirements = get_requirements_for_tender(conn, tender_id)

    conn.close()

    return requirements


@router.get("/{tender_id}/analysis")
def analyze_tender(tender_id: int):
    conn = get_connection()

    analysis = build_analysis(conn, tender_id)

    conn.close()

    return analysis


@router.get("/{tender_id}/suggested-tasks")
def get_suggested_tasks(tender_id: int):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)
    tasks = build_suggested_tasks(conn, tender_id)

    conn.close()

    return tasks


@router.get("/{tender_id}/documents")
def list_tender_documents(tender_id: int):
    conn = get_connection()

    documents = get_documents_for_tender(conn, tender_id)

    conn.close()

    return documents


@router.get("/{tender_id}/documents/coverage-summary")
def get_tender_documents_coverage_summary(tender_id: int):
    conn = get_connection()

    try:
        summary = build_tender_documents_coverage_summary(conn, tender_id)

        conn.close()

        return summary

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Documents coverage summary failed: {exc}",
        )


@router.get("/{tender_id}/submission-gate")
def get_submission_gate(tender_id: int):
    conn = get_connection()

    try:
        gate = build_submission_gate(conn, tender_id)

        conn.close()

        return gate

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Submission gate evaluation failed: {exc}",
        )



@router.post("/{tender_id}/tasks/{task_id}/submit-evidence")
def submit_task_evidence(
    tender_id: int,
    task_id: str,
    file: UploadFile | None = File(None),
    evidence_text: str | None = Form(None),
):
    conn = get_connection()

    try:
        find_tender_or_404(conn, tender_id)

        task = conn.execute(
            """
            SELECT *
            FROM tasks
            WHERE id = ? AND tender_id = ?
            """,
            (task_id, tender_id),
        ).fetchone()

        if not task:
            conn.close()
            raise HTTPException(status_code=404, detail="Task not found")

        task = dict(task)

        if task["status"] == "مكتملة":
            decorated_task = decorate_task_with_evidence(conn, task)
            submission_gate = build_submission_gate(conn, tender_id)

            conn.close()

            return {
                "message": "المهمة مكتملة مسبقًا",
                "accepted": True,
                "task": decorated_task,
                "submission_gate": submission_gate,
            }

        evidence_parts = []
        document = None
        document_id = None

        if file is not None:
            document = store_task_evidence_document(conn, tender_id, file)
            document_id = document["id"]
            document_text = extract_text_from_any_document(conn, document)
            evidence_parts.append(document_text)

        if evidence_text and evidence_text.strip():
            evidence_parts.append(evidence_text.strip())

        combined_evidence_text = "\n\n".join(part for part in evidence_parts if part).strip()

        if not combined_evidence_text:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="Evidence file or evidence text is required",
            )

        verification = build_task_evidence_verification(
            conn=conn,
            task=task,
            evidence_text=combined_evidence_text,
            document_id=document_id,
        )

        updated_task_row = conn.execute(
            """
            SELECT *
            FROM tasks
            WHERE id = ? AND tender_id = ?
            """,
            (task_id, tender_id),
        ).fetchone()

        updated_task = decorate_task_with_evidence(conn, dict(updated_task_row))
        updated_analysis = build_analysis(conn, tender_id)
        submission_gate = build_submission_gate(conn, tender_id)

        conn.close()

        if verification["accepted"]:
            message = "تم قبول الدليل وإغلاق المهمة وتحديث المتطلب وبوابة التقديم."
        else:
            message = "تم تحليل الدليل، لكنه غير كافٍ لإغلاق المهمة. بقيت المهمة مفتوحة."

        return {
            "message": message,
            "accepted": verification["accepted"],
            "verification_status": verification["verification_status"],
            "task": updated_task,
            "document": document,
            "evidence": verification["evidence"],
            "analysis": verification["analysis"],
            "decision_reason": verification["decision_reason"],
            "updated_analysis": updated_analysis,
            "submission_gate": submission_gate,
        }

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()
        raise HTTPException(
            status_code=500,
            detail=f"Evidence submission failed: {exc}",
        )


@router.get("/{tender_id}/evidence-binder")
def get_evidence_binder(tender_id: int):
    conn = get_connection()

    try:
        binder = build_evidence_binder(conn, tender_id)

        conn.close()

        return binder

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Evidence binder failed: {exc}",
        )


@router.get("/{tender_id}/evidence-action-plan")
def get_evidence_action_plan(tender_id: int):
    conn = get_connection()

    try:
        plan = build_evidence_action_plan(conn, tender_id)

        conn.close()

        return plan

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Evidence action plan failed: {exc}",
        )


@router.post("/{tender_id}/evidence-action-plan/create-tasks")
def create_evidence_action_plan_tasks(tender_id: int):
    conn = get_connection()

    try:
        result = create_tasks_from_evidence_action_plan(conn, tender_id)

        conn.close()

        return {
            "message": "تم إنشاء مهام خطة إغلاق فجوات التقديم",
            "created_count": result["created_count"],
            "skipped_count": result["skipped_count"],
            "created_tasks": result["created_tasks"],
            "skipped_tasks": result["skipped_tasks"],
            "plan_summary": result["plan"]["plan_summary"],
        }

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Create evidence action plan tasks failed: {exc}",
        )


@router.post("/{tender_id}/documents/upload")
def upload_tender_document(tender_id: int, file: UploadFile = File(...)):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)

    if not file.filename:
        conn.close()
        raise HTTPException(status_code=400, detail="File name is missing")

    tender_folder = DOCUMENTS_DIR / str(tender_id)
    tender_folder.mkdir(parents=True, exist_ok=True)

    extension = Path(file.filename).suffix or ".bin"
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    file_path = tender_folder / stored_filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_at = datetime.utcnow().isoformat()
        extraction_status = "pending"

        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO tender_documents
            (
                tender_id,
                original_filename,
                stored_filename,
                file_path,
                mime_type,
                extraction_status,
                extracted_text,
                uploaded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tender_id,
                file.filename,
                stored_filename,
                str(file_path),
                file.content_type,
                extraction_status,
                None,
                uploaded_at,
            ),
        )

        document_id = cur.lastrowid

        conn.commit()

        document = conn.execute(
            "SELECT * FROM tender_documents WHERE id = ?",
            (document_id,),
        ).fetchone()

        conn.close()

        return {
            "message": "تم رفع ملف المنافسة بنجاح",
            "document": dict(document),
        }

    except Exception as exc:
        conn.close()

        if file_path.exists():
            file_path.unlink(missing_ok=True)

        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}")

    finally:
        file.file.close()


@router.post("/{tender_id}/documents/{document_id}/extract")
def extract_tender_document_text(tender_id: int, document_id: int):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)

    document = conn.execute(
        """
        SELECT *
        FROM tender_documents
        WHERE id = ? AND tender_id = ?
        """,
        (document_id, tender_id),
    ).fetchone()

    if not document:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    document = dict(document)

    try:
        extracted_text = extract_text_from_pdf(document["file_path"])

        conn.execute(
            """
            UPDATE tender_documents
            SET extraction_status = ?, extracted_text = ?
            WHERE id = ? AND tender_id = ?
            """,
            ("completed", extracted_text, document_id, tender_id),
        )

        conn.commit()

        updated_document = conn.execute(
            """
            SELECT *
            FROM tender_documents
            WHERE id = ? AND tender_id = ?
            """,
            (document_id, tender_id),
        ).fetchone()

        conn.close()

        return {
            "message": "تم استخراج النص الفعلي من مستند المنافسة",
            "document": dict(updated_document),
        }

    except Exception as exc:
        conn.execute(
            """
            UPDATE tender_documents
            SET extraction_status = ?, extracted_text = ?
            WHERE id = ? AND tender_id = ?
            """,
            ("failed", f"فشل استخراج النص: {exc}", document_id, tender_id),
        )

        conn.commit()
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Document extraction failed: {exc}",
        )


@router.post("/{tender_id}/documents/{document_id}/analyze-coverage")
def analyze_document_coverage(tender_id: int, document_id: int):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)

    try:
        coverage_analysis = build_document_coverage_analysis(
            conn=conn,
            tender_id=tender_id,
            document_id=document_id,
        )

        conn.close()

        return {
            "message": "تم تحليل تغطية المتطلبات بناءً على محتوى المستند",
            "analysis": coverage_analysis,
        }

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Document coverage analysis failed: {exc}",
        )


@router.post("/{tender_id}/documents/{document_id}/create-gap-tasks")
def create_gap_tasks_from_document(tender_id: int, document_id: int):
    conn = get_connection()

    find_tender_or_404(conn, tender_id)

    try:
        result = build_gap_tasks_from_document_analysis(
            conn=conn,
            tender_id=tender_id,
            document_id=document_id,
        )

        conn.close()

        return {
            "message": "تم إنشاء مهام تنفيذية من فجوات المستند",
            "created_count": result["created_count"],
            "skipped_count": result["skipped_count"],
            "created_tasks": result["created_tasks"],
            "skipped_task_ids": result["skipped_task_ids"],
            "coverage_summary": result["coverage_analysis"]["coverage_summary"],
        }

    except HTTPException:
        conn.close()
        raise

    except Exception as exc:
        conn.close()

        raise HTTPException(
            status_code=500,
            detail=f"Create gap tasks failed: {exc}",
        )
