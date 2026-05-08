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


SECTION_HEADINGS: Dict[str, List[str]] = {
    "general": ["معلومات عامة", "البيانات العامة", "بيانات عامة"],
    "description": ["وصف المنافسة", "وصف المشروع", "نبذة عن المنافسة"],
    "scope": ["نطاق العمل", "الأعمال المطلوبة", "مجال العمل"],
    "technical_requirements": ["المتطلبات الفنية", "الشروط الفنية", "المواصفات الفنية"],
    "required_documents": ["المستندات المطلوبة", "الوثائق المطلوبة", "المرفقات المطلوبة"],
    "evaluation": ["شروط التقييم", "معايير التقييم", "آلية التقييم"],
    "risks": ["المخاطر والملاحظات", "الملاحظات والمخاطر", "ملاحظات مهمة", "المخاطر"],
    "deliverables": ["مخرجات المشروع المطلوبة", "المخرجات المطلوبة", "مخرجات المشروع"],
}

ALL_SECTION_LABELS = [label for labels in SECTION_HEADINGS.values() for label in labels]


def strip_numbering(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^[\-\*\•\u2022]+\s*", "", value)
    value = re.sub(r"^[\(\[]?\d{1,3}[\)\]\.]\s*", "", value)
    return value.strip(" \t:-：")


def normalize_arabic_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("：", ":")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_labeled_value(text: str, labels: List[str]) -> str:
    if not text:
        return ""

    for label in labels:
        pattern = rf"(?:^|\n)\s*{re.escape(label)}\s*[:：]\s*([^\n]+)"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip(" \t.-")

    return ""


def detect_section_key(line: str) -> Optional[str]:
    cleaned = strip_numbering(line)
    cleaned = cleaned.strip(" :：")
    if not cleaned:
        return None

    for key, labels in SECTION_HEADINGS.items():
        for label in labels:
            if cleaned == label or cleaned.startswith(label):
                return key

    return None


def split_document_sections(text: str) -> Dict[str, str]:
    normalized = normalize_arabic_text(text)
    sections: Dict[str, List[str]] = {}
    current_key: Optional[str] = None

    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if not line:
            if current_key:
                sections.setdefault(current_key, []).append("")
            continue

        detected = detect_section_key(line)
        if detected:
            current_key = detected
            sections.setdefault(current_key, [])
            continue

        if current_key:
            sections.setdefault(current_key, []).append(line)

    return {key: "\n".join(lines).strip() for key, lines in sections.items() if "\n".join(lines).strip()}


def clean_item_line(line: str) -> str:
    line = strip_numbering(line)
    line = re.sub(r"\s+", " ", line).strip()
    line = line.strip("-–—•؛; ")
    return line


def clean_section_items(section_text: str, *, min_len: int = 4) -> List[str]:
    items: List[str] = []
    skip_prefixes = (
        "يجب على المتقدم",
        "يجب إرفاق",
        "يشمل نطاق العمل",
        "سيتم تقييم",
        "تطرح",
        "اسم المنافسة",
        "الجهة المالكة",
        "رقم المنافسة",
        "آخر موعد",
        "مدة التنفيذ",
        "مكان التنفيذ",
    )

    for raw_line in section_text.splitlines():
        line = clean_item_line(raw_line)
        if len(line) < min_len:
            continue
        if any(line.startswith(prefix) for prefix in skip_prefixes):
            continue
        if detect_section_key(line):
            continue
        if line not in items:
            items.append(line)

    return items


def build_description_from_sections(sections: Dict[str, str], extracted_text: str) -> str:
    description = sections.get("description", "").strip()
    if description:
        return re.sub(r"\s+", " ", description).strip()[:900]

    scope = sections.get("scope", "").strip()
    if scope:
        return "يشمل نطاق المنافسة: " + "، ".join(clean_section_items(scope)[:6])

    text = normalize_arabic_text(extracted_text)
    if text:
        return text[:700]

    return "تم إنشاء هذه المنافسة من ملف مرفوع وتحتاج إلى مراجعة البيانات قبل الاعتماد."


def parse_requirements_from_text(text: str) -> List[Dict[str, str]]:
    sections = split_document_sections(text)
    requirement_source = sections.get("technical_requirements", "")

    # لا نخلط نطاق العمل مع المتطلبات إلا إذا لم يوجد قسم متطلبات إطلاقًا.
    if requirement_source:
        candidate_lines = clean_section_items(requirement_source, min_len=8)
    else:
        candidate_lines = []
        lines = []
        for raw_line in text.splitlines():
            line = clean_item_line(raw_line)
            if len(line) >= 8:
                lines.append(line)

        keywords = [
            "يجب",
            "يلتزم",
            "المطلوب",
            "يشترط",
            "تقديم",
            "وجود",
            "توفر",
            "توفير",
            "خبرة",
            "شهادة",
            "خطة",
            "ضمان",
            "دعم فني",
            "must",
            "shall",
            "required",
            "requirement",
        ]

        for line in lines:
            if any(keyword.lower() in line.lower() for keyword in keywords):
                if line not in candidate_lines:
                    candidate_lines.append(line)

        if not candidate_lines:
            candidate_lines = lines[:8]

    requirements: List[Dict[str, str]] = []
    for candidate in candidate_lines[:18]:
        requirements.append(
            {
                "title": candidate[:220],
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
    """Section-aware deterministic extractor.

    This is intentionally stronger than a generic keyword fallback so the demo does
    not look like a broken chatbot if the LLM/API is unavailable. It reads Arabic
    tender sections by heading and keeps scope, requirements, documents and risks
    separated.
    """
    normalized_text = normalize_arabic_text(extracted_text)
    sections = split_document_sections(normalized_text)

    title = extract_labeled_value(
        normalized_text,
        ["اسم المنافسة", "عنوان المنافسة", "اسم المشروع", "عنوان المشروع"],
    )
    if not title:
        title = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    if not title:
        title = "منافسة جديدة من ملف"

    client = extract_labeled_value(
        normalized_text,
        ["الجهة المالكة", "الجهة", "العميل", "صاحب المشروع", "الجهة المستفيدة"],
    )
    if not client:
        client = "جهة غير محددة"

    deadline = extract_labeled_value(
        normalized_text,
        ["آخر موعد للتقديم", "موعد التقديم", "تاريخ الإغلاق", "آخر موعد", "تاريخ التقديم"],
    )
    deadline = normalize_deadline(deadline)

    description = build_description_from_sections(sections, normalized_text)
    requirements = parse_requirements_from_text(normalized_text)

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

    required_documents = clean_section_items(sections.get("required_documents", ""), min_len=3)
    if not required_documents:
        required_documents = [
            "السجل التجاري ساري المفعول",
            "شهادة ضريبة القيمة المضافة",
            "العرض الفني",
            "العرض المالي",
            "خطة تنفيذ المشروع",
        ]

    risk_notes = clean_section_items(sections.get("risks", ""), min_len=8)
    if not risk_notes:
        risk_notes = [
            "تحتاج البيانات المستخرجة إلى مراجعة بشرية قبل الاعتماد النهائي.",
            "يجب التأكد من إرفاق الأدلة الداعمة لكل متطلب قبل قرار التقديم.",
        ]

    confidence_fields = []
    if client == "جهة غير محددة":
        confidence_fields.append("client")
    if deadline == "2026-12-31":
        confidence_fields.append("submission_deadline")

    return {
        "title": title,
        "client": client,
        "description": description,
        "submission_deadline": deadline,
        "status": "UNDER_REVIEW",
        "readiness_score": 25,
        "requirements": requirements,
        "required_documents": required_documents[:20],
        "risk_notes": risk_notes[:12],
        "confidence_notes": {
            "overall": "عالية" if not confidence_fields else "متوسطة",
            "fields_need_review": confidence_fields,
            "reason": "تم استخدام محلل داخلي مدعوم بفهم أقسام كراسة المنافسة عند تعذر نتيجة OpenAI المنظمة.",
        },
    }


INTAKE_RESULT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "client": {"type": "string"},
        "description": {"type": "string"},
        "submission_deadline": {"type": "string"},
        "status": {"type": "string", "enum": ["UNDER_REVIEW"]},
        "readiness_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": ["فني", "إداري", "خبرات", "شهادات", "تقني", "عام"],
                    },
                    "priority": {"type": "string", "enum": ["عالية", "متوسطة", "منخفضة"]},
                    "status": {"type": "string", "enum": ["غير مغطى"]},
                },
                "required": ["title", "category", "priority", "status"],
            },
        },
        "required_documents": {"type": "array", "items": {"type": "string"}},
        "risk_notes": {"type": "array", "items": {"type": "string"}},
        "confidence_notes": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "overall": {"type": "string", "enum": ["عالية", "متوسطة", "منخفضة"]},
                "fields_need_review": {"type": "array", "items": {"type": "string"}},
                "reason": {"type": "string"},
            },
            "required": ["overall", "fields_need_review", "reason"],
        },
    },
    "required": [
        "title",
        "client",
        "description",
        "submission_deadline",
        "status",
        "readiness_score",
        "requirements",
        "required_documents",
        "risk_notes",
        "confidence_notes",
    ],
}


def response_to_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    try:
        chunks: List[str] = []
        for item in getattr(response, "output", []) or []:
            for content in getattr(item, "content", []) or []:
                text_value = getattr(content, "text", None)
                if text_value:
                    chunks.append(str(text_value))
        return "\n".join(chunks).strip()
    except Exception:
        return ""


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

        system_message = (
            "أنت وكيل تشغيل منافسات داخل نظام Munjiz OS. "
            "مهمتك قراءة كراسة المنافسة واستخراج بيانات قابلة للاعتماد التشغيلي. "
            "افصل بدقة بين وصف المنافسة ونطاق العمل والمتطلبات الفنية والمستندات والمخاطر. "
            "لا تستخدم اسم الملف كعنوان إذا كان داخل النص اسم منافسة واضح. "
            "لا تخلط نطاق العمل مع المتطلبات الفنية. "
            "أعد JSON مطابقًا للمخطط فقط."
        )

        user_payload = {
            "filename": filename,
            "extraction_rules": [
                "استخرج title من: اسم المنافسة / عنوان المنافسة / اسم المشروع.",
                "استخرج client من: الجهة المالكة / الجهة / العميل.",
                "استخرج submission_deadline من: آخر موعد للتقديم أو أي تاريخ إغلاق واضح.",
                "description يجب أن يكون ملخصًا مهنيًا من قسم وصف المنافسة فقط قدر الإمكان.",
                "requirements يجب أن تأتي من قسم المتطلبات الفنية أو الشروط الفنية، ولا تدرج بنود نطاق العمل إلا إذا صيغت كشرط على المتقدم.",
                "required_documents يجب أن تأتي من قسم المستندات المطلوبة.",
                "risk_notes يجب أن تأتي من قسم المخاطر والملاحظات أو تُستنتج من نصوص التحذير الموجودة فقط.",
                "استخدم جهة غير محددة فقط إذا لم تظهر الجهة في النص.",
                "استخدم 2026-12-31 فقط إذا لم يظهر موعد التقديم في النص.",
            ],
            "document_text": extracted_text[:24000],
        }

        # Primary path: Responses API with strict structured output.
        try:
            response = client.responses.create(
                model=model,
                instructions=system_message,
                input=json.dumps(user_payload, ensure_ascii=False),
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "munjiz_tender_intake_result",
                        "strict": True,
                        "schema": INTAKE_RESULT_SCHEMA,
                    }
                },
                max_output_tokens=2600,
            )
            parsed = extract_first_json_object(response_to_text(response))
            if parsed:
                return parsed
        except TypeError:
            # Older OpenAI SDKs may not support the text.format argument.
            pass

        # Compatibility path: still uses OpenAI, but relies on explicit JSON-only prompting.
        prompt = {
            "task": "استخرج بيانات منافسة من نص كراسة أو مستند مناقصة. أعد JSON فقط دون Markdown.",
            "required_schema": INTAKE_RESULT_SCHEMA,
            "rules": user_payload["extraction_rules"],
            "document_text": extracted_text[:24000],
        }

        response = client.responses.create(
            model=model,
            instructions=system_message,
            input=json.dumps(prompt, ensure_ascii=False),
            max_output_tokens=2600,
        )

        parsed = extract_first_json_object(response_to_text(response))
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

    raw_title = str(raw_result.get("title") or "").strip()
    filename_title = Path(fallback_filename).stem.replace("_", " ").replace("-", " ").strip().lower()
    if not raw_title or raw_title.lower() == filename_title or raw_title.endswith(" AR"):
        title = fallback["title"]
    else:
        title = raw_title

    raw_client = str(raw_result.get("client") or "").strip()
    if not raw_client or raw_client in ["جهة غير محددة", "غير محددة", "N/A", "na"]:
        client = fallback["client"]
    else:
        client = raw_client

    raw_description = str(raw_result.get("description") or "").strip()
    description = raw_description if len(raw_description) >= 25 else fallback["description"]

    requirements = raw_result.get("requirements")
    if not isinstance(requirements, list) or not requirements:
        requirements = fallback["requirements"]

    normalized_requirements = []
    seen_requirements = set()
    for item in requirements[:25]:
        if isinstance(item, dict):
            req_title = str(item.get("title") or "").strip()
            if not req_title:
                continue

            req_title = clean_item_line(req_title)[:220]
            if req_title in seen_requirements:
                continue
            seen_requirements.add(req_title)

            normalized_requirements.append(
                {
                    "title": req_title,
                    "category": str(item.get("category") or infer_category(req_title)).strip(),
                    "priority": str(item.get("priority") or infer_priority(req_title)).strip(),
                    "status": str(item.get("status") or "غير مغطى").strip(),
                }
            )
        elif isinstance(item, str) and item.strip():
            req_title = clean_item_line(item)[:220]
            if not req_title or req_title in seen_requirements:
                continue
            seen_requirements.add(req_title)
            normalized_requirements.append(
                {
                    "title": req_title,
                    "category": infer_category(req_title),
                    "priority": infer_priority(req_title),
                    "status": "غير مغطى",
                }
            )

    if not normalized_requirements:
        normalized_requirements = fallback["requirements"]

    required_documents = raw_result.get("required_documents")
    if not isinstance(required_documents, list) or not required_documents:
        required_documents = fallback["required_documents"]

    risk_notes = raw_result.get("risk_notes")
    if not isinstance(risk_notes, list) or not risk_notes:
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
        "status": "UNDER_REVIEW",
        "readiness_score": clamp_score(raw_result.get("readiness_score"), 25),
        "requirements": normalized_requirements,
        "required_documents": [clean_item_line(str(item)) for item in required_documents if clean_item_line(str(item))],
        "risk_notes": [clean_item_line(str(item)) for item in risk_notes if clean_item_line(str(item))],
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