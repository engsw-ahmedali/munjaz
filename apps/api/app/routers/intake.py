import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.db import get_connection


router = APIRouter(prefix="/intake", tags=["tender-intake"])

INTAKE_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "intake_documents"
INTAKE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class RequirementInput(BaseModel):
    title: str = Field(..., min_length=2)
    category: str = "عام"
    priority: str = "متوسطة"
    status: str = "غير مغطى"


class ManualTenderCreateRequest(BaseModel):
    title: str = Field(..., min_length=2)
    client: str = Field(..., min_length=2)
    description: str = Field(..., min_length=5)
    submission_deadline: str = Field(..., min_length=4)
    status: str = "UNDER_REVIEW"
    readiness_score: int = 25
    requirements: List[RequirementInput] = []


class FileTenderConfirmRequest(BaseModel):
    title: str = Field(..., min_length=2)
    client: str = Field(..., min_length=2)
    description: str = Field(..., min_length=5)
    submission_deadline: str = Field(..., min_length=4)
    status: str = "UNDER_REVIEW"
    readiness_score: int = 25
    requirements: List[RequirementInput] = []
    required_documents: List[str] = []
    risk_notes: List[str] = []
    source_filename: Optional[str] = None
    source_mime_type: Optional[str] = None
    temp_file_token: Optional[str] = None
    extracted_text: Optional[str] = None


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def clamp_score(value: Any, default: int = 25) -> int:
    try:
        score = int(value)
    except Exception:
        score = default

    return max(0, min(100, score))


def sanitize_filename(filename: str) -> str:
    return (
        filename.replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("*", "_")
        .replace("?", "_")
        .replace('"', "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace("|", "_")
    )


def normalize_deadline(value: Optional[str]) -> str:
    if not value:
        return "2026-12-31"

    text = value.strip()

    yyyy_mm_dd = re.search(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})", text)
    if yyyy_mm_dd:
        year, month, day = yyyy_mm_dd.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    dd_mm_yyyy = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](20\d{2})", text)
    if dd_mm_yyyy:
        day, month, year = dd_mm_yyyy.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    return text


def infer_category(title: str) -> str:
    text = title.lower()

    if any(word in text for word in ["iso", "شهادة", "اعتماد", "certification"]):
        return "شهادات"

    if any(word in text for word in ["خبرة", "سابقة", "مشابهة", "experience", "project"]):
        return "خبرات"

    if any(word in text for word in ["خطة", "جدول", "تنفيذ", "منهجية", "برنامج", "plan"]):
        return "إداري"

    if any(word in text for word in ["مهندس", "فريق", "موظف", "سيرة", "cv", "engineer"]):
        return "فني"

    if any(word in text for word in ["تقني", "تكامل", "شبكات", "أمن", "security", "network"]):
        return "تقني"

    return "عام"


def infer_priority(title: str) -> str:
    text = title.lower()

    if any(word in text for word in ["إلزامي", "حرج", "أساسي", "mandatory", "critical", "must"]):
        return "عالية"

    if any(word in text for word in ["يفضل", "اختياري", "preferred", "optional"]):
        return "منخفضة"

    return "متوسطة"


def parse_requirements_from_text(text: str) -> List[Dict[str, str]]:
    lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        line = re.sub(r"^[\-\*\•\d\.\)\(]+\s*", "", line).strip()
        if len(line) >= 8:
            lines.append(line)

    candidates = []
    keywords = [
        "يجب",
        "يلتزم",
        "المطلوب",
        "يشترط",
        "تقديم",
        "وجود",
        "خبرة",
        "شهادة",
        "خطة",
        "توريد",
        "تنفيذ",
        "صيانة",
        "must",
        "shall",
        "required",
        "requirement",
    ]

    for line in lines:
        if any(keyword.lower() in line.lower() for keyword in keywords):
            if line not in candidates:
                candidates.append(line)

    if not candidates:
        candidates = lines[:8]

    requirements = []
    for candidate in candidates[:15]:
        requirements.append(
            {
                "title": candidate[:180],
                "category": infer_category(candidate),
                "priority": infer_priority(candidate),
                "status": "غير مغطى",
            }
        )

    return requirements


def extract_text_from_pdf(file_path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(file_path))
        pages = []
        for page in reader.pages[:25]:
            pages.append(page.extract_text() or "")
        return "\n".join(pages).strip()
    except Exception:
        return ""


def extract_text_from_docx(file_path: Path) -> str:
    try:
        from docx import Document

        document = Document(str(file_path))
        return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
    except Exception:
        return ""


def extract_text_from_file(file_path: Path, mime_type: Optional[str]) -> str:
    suffix = file_path.suffix.lower()

    if suffix == ".pdf" or mime_type == "application/pdf":
        text = extract_text_from_pdf(file_path)
        if text:
            return text

    if suffix == ".docx":
        text = extract_text_from_docx(file_path)
        if text:
            return text

    try:
        return file_path.read_text(encoding="utf-8", errors="ignore").strip()
    except Exception:
        return ""


def extract_first_json_object(value: str) -> Optional[Dict[str, Any]]:
    if not value:
        return None

    cleaned = value.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None

    return None


def fallback_file_intake(
    filename: str,
    extracted_text: str,
) -> Dict[str, Any]:
    title = Path(filename).stem.replace("_", " ").replace("-", " ").strip()

    if not title:
        title = "منافسة جديدة من ملف"

    deadline = "2026-12-31"
    date_match = re.search(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})", extracted_text)
    if date_match:
        year, month, day = date_match.groups()
        deadline = f"{year}-{int(month):02d}-{int(day):02d}"

    requirements = parse_requirements_from_text(extracted_text)

    if not requirements:
        requirements = [
            {
                "title": "تقديم مستندات تثبت القدرة الفنية والتنفيذية",
                "category": "فني",
                "priority": "متوسطة",
                "status": "غير مغطى",
            },
            {
                "title": "تقديم خطة تنفيذ واضحة للمشروع",
                "category": "إداري",
                "priority": "متوسطة",
                "status": "غير مغطى",
            },
        ]

    return {
        "title": title,
        "client": "جهة غير محددة",
        "description": extracted_text[:700] if extracted_text else "تم إنشاء هذه المنافسة من ملف مرفوع وتحتاج إلى مراجعة البيانات قبل الاعتماد.",
        "submission_deadline": deadline,
        "status": "UNDER_REVIEW",
        "readiness_score": 25,
        "requirements": requirements,
        "required_documents": [
            "المستندات النظامية المطلوبة",
            "العرض الفني",
            "العرض المالي",
            "خطة التنفيذ",
        ],
        "risk_notes": [
            "تم إنشاء هذه البيانات آليًا وتحتاج إلى مراجعة بشرية قبل الاعتماد.",
        ],
        "confidence_notes": {
            "overall": "متوسطة",
            "reason": "تم استخدام تحليل داخلي لأن OpenAI لم يرجع نتيجة منظمة أو النص المستخرج محدود.",
        },
    }


def openai_file_intake(
    filename: str,
    extracted_text: str,
) -> Optional[Dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5.5")

    if not api_key:
        return None

    if not extracted_text.strip():
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        prompt = {
            "task": "استخرج بيانات منافسة من نص كراسة أو مستند مناقصة. أعد JSON فقط دون Markdown.",
            "filename": filename,
            "required_schema": {
                "title": "string",
                "client": "string",
                "description": "string",
                "submission_deadline": "YYYY-MM-DD or string",
                "status": "UNDER_REVIEW",
                "readiness_score": 25,
                "requirements": [
                    {
                        "title": "string",
                        "category": "فني | إداري | خبرات | شهادات | تقني | عام",
                        "priority": "عالية | متوسطة | منخفضة",
                        "status": "غير مغطى",
                    }
                ],
                "required_documents": ["string"],
                "risk_notes": ["string"],
                "confidence_notes": {
                    "overall": "عالية | متوسطة | منخفضة",
                    "fields_need_review": ["string"],
                },
            },
            "rules": [
                "لا تخترع أسماء جهات أو متطلبات غير موجودة بوضوح.",
                "عند عدم وضوح الجهة اكتب: جهة غير محددة.",
                "عند عدم وضوح الموعد اكتب: 2026-12-31 وضعه ضمن fields_need_review.",
                "اجعل المتطلبات مختصرة وواضحة ومباشرة.",
                "أعد JSON صالح فقط.",
            ],
            "document_text": extracted_text[:18000],
        }

        response = client.responses.create(
            model=model,
            instructions=(
                "أنت وكيل متخصص في قراءة كراسات المنافسات واستخراج البيانات الأساسية "
                "والمتطلبات والمستندات المطلوبة والمخاطر. أعد JSON فقط."
            ),
            input=json.dumps(prompt, ensure_ascii=False),
            max_output_tokens=1800,
        )

        parsed = extract_first_json_object(response.output_text)
        if not parsed:
            return None

        return parsed
    except Exception:
        return None


def normalize_intake_result(
    raw_result: Dict[str, Any],
    fallback_filename: str,
    extracted_text: str,
) -> Dict[str, Any]:
    fallback = fallback_file_intake(fallback_filename, extracted_text)

    title = str(raw_result.get("title") or fallback["title"]).strip()
    client = str(raw_result.get("client") or fallback["client"]).strip()
    description = str(raw_result.get("description") or fallback["description"]).strip()

    requirements = raw_result.get("requirements")
    if not isinstance(requirements, list) or not requirements:
        requirements = fallback["requirements"]

    normalized_requirements = []
    for item in requirements[:25]:
        if isinstance(item, dict):
            req_title = str(item.get("title") or "").strip()
            if not req_title:
                continue

            normalized_requirements.append(
                {
                    "title": req_title[:220],
                    "category": str(item.get("category") or infer_category(req_title)).strip(),
                    "priority": str(item.get("priority") or infer_priority(req_title)).strip(),
                    "status": str(item.get("status") or "غير مغطى").strip(),
                }
            )
        elif isinstance(item, str) and item.strip():
            req_title = item.strip()
            normalized_requirements.append(
                {
                    "title": req_title[:220],
                    "category": infer_category(req_title),
                    "priority": infer_priority(req_title),
                    "status": "غير مغطى",
                }
            )

    if not normalized_requirements:
        normalized_requirements = fallback["requirements"]

    required_documents = raw_result.get("required_documents")
    if not isinstance(required_documents, list):
        required_documents = fallback["required_documents"]

    risk_notes = raw_result.get("risk_notes")
    if not isinstance(risk_notes, list):
        risk_notes = fallback["risk_notes"]

    confidence_notes = raw_result.get("confidence_notes")
    if not isinstance(confidence_notes, dict):
        confidence_notes = fallback["confidence_notes"]

    return {
        "title": title,
        "client": client,
        "description": description,
        "submission_deadline": normalize_deadline(
            str(raw_result.get("submission_deadline") or fallback["submission_deadline"])
        ),
        "status": str(raw_result.get("status") or "UNDER_REVIEW"),
        "readiness_score": clamp_score(raw_result.get("readiness_score"), 25),
        "requirements": normalized_requirements,
        "required_documents": [str(item).strip() for item in required_documents if str(item).strip()],
        "risk_notes": [str(item).strip() for item in risk_notes if str(item).strip()],
        "confidence_notes": confidence_notes,
    }


def create_tender_record(
    title: str,
    client: str,
    status: str,
    readiness_score: int,
    description: str,
    submission_deadline: str,
    requirements: List[Dict[str, Any]],
) -> Dict[str, Any]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO tenders
        (
            title,
            client,
            status,
            readiness_score,
            description,
            submission_deadline
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            client,
            status,
            clamp_score(readiness_score),
            description,
            normalize_deadline(submission_deadline),
        ),
    )

    tender_id = cur.lastrowid

    for requirement in requirements:
        req_title = str(requirement.get("title") or "").strip()
        if not req_title:
            continue

        cur.execute(
            """
            INSERT INTO requirements
            (
                tender_id,
                title,
                category,
                priority,
                status
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                tender_id,
                req_title,
                str(requirement.get("category") or infer_category(req_title)),
                str(requirement.get("priority") or infer_priority(req_title)),
                str(requirement.get("status") or "غير مغطى"),
            ),
        )

    conn.commit()

    tender = conn.execute(
        """
        SELECT *
        FROM tenders
        WHERE id = ?
        """,
        (tender_id,),
    ).fetchone()

    requirements_rows = conn.execute(
        """
        SELECT *
        FROM requirements
        WHERE tender_id = ?
        ORDER BY id
        """,
        (tender_id,),
    ).fetchall()

    conn.close()

    return {
        "tender": dict(tender),
        "requirements": [dict(row) for row in requirements_rows],
    }


def store_source_document_for_tender(
    tender_id: int,
    source_filename: Optional[str],
    source_mime_type: Optional[str],
    temp_file_token: Optional[str],
    extracted_text: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not temp_file_token or not source_filename:
        return None

    safe_token = sanitize_filename(temp_file_token)
    temp_path = INTAKE_UPLOAD_DIR / safe_token

    if not temp_path.exists():
        return None

    conn = get_connection()
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
            source_filename,
            safe_token,
            str(temp_path),
            source_mime_type,
            "extracted" if extracted_text else "pending",
            extracted_text or "",
            now_iso(),
        ),
    )

    document_id = cur.lastrowid
    conn.commit()

    document = conn.execute(
        """
        SELECT *
        FROM tender_documents
        WHERE id = ?
        """,
        (document_id,),
    ).fetchone()

    conn.close()

    return dict(document)


@router.get("/health")
def intake_health():
    return {
        "status": "ok",
        "router": "tender_intake",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
    }


@router.post("/tenders/manual")
def create_tender_manual(payload: ManualTenderCreateRequest):
    requirements = [item.dict() for item in payload.requirements]

    if not requirements:
        requirements = [
            {
                "title": "تقديم مستندات المنافسة الأساسية",
                "category": "إداري",
                "priority": "متوسطة",
                "status": "غير مغطى",
            }
        ]

    result = create_tender_record(
        title=payload.title,
        client=payload.client,
        status=payload.status,
        readiness_score=payload.readiness_score,
        description=payload.description,
        submission_deadline=payload.submission_deadline,
        requirements=requirements,
    )

    return {
        "message": "تم إنشاء المنافسة يدويًا بنجاح",
        "creation_mode": "manual",
        **result,
    }


@router.post("/tenders/from-file/analyze")
async def analyze_tender_file(
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    file_bytes = await file.read()

    max_size_mb = 25
    if len(file_bytes) > max_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Maximum allowed size is {max_size_mb} MB",
        )

    safe_filename = sanitize_filename(file.filename)
    temp_file_token = f"intake_{uuid4().hex}_{safe_filename}"
    temp_path = INTAKE_UPLOAD_DIR / temp_file_token

    temp_path.write_bytes(file_bytes)

    extracted_text = extract_text_from_file(temp_path, file.content_type)

    openai_result = openai_file_intake(file.filename, extracted_text)
    raw_result = openai_result or fallback_file_intake(file.filename, extracted_text)

    normalized_result = normalize_intake_result(
        raw_result=raw_result,
        fallback_filename=file.filename,
        extracted_text=extracted_text,
    )

    return {
        "message": "تم تحليل ملف المنافسة",
        "provider": "openai_responses_api" if openai_result else "deterministic_fallback",
        "source_filename": file.filename,
        "source_mime_type": file.content_type,
        "temp_file_token": temp_file_token,
        "text_extracted": bool(extracted_text.strip()),
        "extracted_text_preview": extracted_text[:1200],
        "notes": notes,
        "intake_result": normalized_result,
    }


@router.post("/tenders/from-file/confirm")
def confirm_tender_from_file(payload: FileTenderConfirmRequest):
    requirements = [item.dict() for item in payload.requirements]

    if not requirements:
        requirements = [
            {
                "title": "مراجعة المتطلبات المستخرجة من كراسة المنافسة",
                "category": "إداري",
                "priority": "متوسطة",
                "status": "غير مغطى",
            }
        ]

    result = create_tender_record(
        title=payload.title,
        client=payload.client,
        status=payload.status,
        readiness_score=payload.readiness_score,
        description=payload.description,
        submission_deadline=payload.submission_deadline,
        requirements=requirements,
    )

    source_document = store_source_document_for_tender(
        tender_id=result["tender"]["id"],
        source_filename=payload.source_filename,
        source_mime_type=payload.source_mime_type,
        temp_file_token=payload.temp_file_token,
        extracted_text=payload.extracted_text,
    )

    return {
        "message": "تم إنشاء المنافسة من الملف بنجاح",
        "creation_mode": "file",
        "required_documents": payload.required_documents,
        "risk_notes": payload.risk_notes,
        "source_document": source_document,
        **result,
    }