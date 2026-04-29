import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from app.routers.resources import (
    calculate_resource_match_score,
    get_resource_capabilities,
    get_resource_documents,
)
from app.services.db import get_connection


router = APIRouter(prefix="/reasoning", tags=["reasoning"])


COMPLETED_TASK_STATUSES = {
    "completed",
    "done",
    "closed",
    "مكتملة",
    "مغلق",
    "مغلقة",
    "تم",
}


def row_to_dict(row) -> Dict[str, Any]:
    return dict(row) if row else {}


def safe_percent(value: int) -> int:
    return max(0, min(100, int(value)))


def load_tender_bundle(tender_id: int) -> Dict[str, Any]:
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

    requirements = conn.execute(
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

    tasks = conn.execute(
        """
        SELECT *
        FROM tasks
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

    resources = conn.execute(
        """
        SELECT *
        FROM company_resources
        WHERE status = 'active'
        ORDER BY id
        """
    ).fetchall()

    tender_documents_count = 0
    try:
        tender_documents_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM tender_documents
            WHERE tender_id = ?
            """,
            (tender_id,),
        ).fetchone()[0]
    except Exception:
        tender_documents_count = 0

    bundle = {
        "conn": conn,
        "tender": row_to_dict(tender),
        "requirements": [row_to_dict(row) for row in requirements],
        "tasks": [row_to_dict(row) for row in tasks],
        "resources": [row_to_dict(row) for row in resources],
        "tender_documents_count": tender_documents_count,
    }

    return bundle


def build_resource_matches(bundle: Dict[str, Any]) -> Dict[str, Any]:
    conn = bundle["conn"]
    requirements = bundle["requirements"]
    resources = bundle["resources"]

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
            key=lambda item: (item["match_score"], item["documents_count"]),
            reverse=True,
        )

        best_match = resource_matches[0] if resource_matches else None
        best_score = best_match["match_score"] if best_match else 0

        total_best_score += best_score

        if best_match and best_match["documents_count"] > 0 and best_score >= 45:
            requirements_with_usable_evidence += 1

        if best_match and best_score >= 85:
            decision = "مدعوم بقوة من موارد الشركة"
        elif best_match and best_score >= 60:
            decision = "مدعوم جزئيًا من موارد الشركة"
        elif best_match:
            decision = "توجد مؤشرات دعم ضعيفة"
        else:
            decision = "لا يوجد مورد مناسب"

        matched_requirements.append(
            {
                "requirement_id": requirement["id"],
                "requirement_title": requirement["title"],
                "requirement_category": requirement["category"],
                "requirement_priority": requirement["priority"],
                "current_requirement_status": requirement["status"],
                "decision": decision,
                "best_score": best_score,
                "best_match": best_match,
                "matches_count": len(resource_matches),
                "matches": resource_matches[:5],
            }
        )

    requirements_count = len(requirements)

    if requirements_count:
        resource_readiness_score = round(total_best_score / requirements_count)
        resource_evidence_coverage_score = round(
            (requirements_with_usable_evidence / requirements_count) * 100
        )
    else:
        resource_readiness_score = 0
        resource_evidence_coverage_score = 0

    return {
        "requirements": matched_requirements,
        "resource_readiness_score": safe_percent(resource_readiness_score),
        "resource_evidence_coverage_score": safe_percent(resource_evidence_coverage_score),
        "requirements_with_usable_evidence": requirements_with_usable_evidence,
        "resources_checked": len(resources),
    }


def build_gate_scores(bundle: Dict[str, Any], resource_result: Dict[str, Any]) -> Dict[str, Any]:
    tender = bundle["tender"]
    requirements = bundle["requirements"]
    tasks = bundle["tasks"]

    open_tasks = [
        task
        for task in tasks
        if str(task.get("status", "")).strip() not in COMPLETED_TASK_STATUSES
    ]

    critical_open_tasks = [
        task
        for task in open_tasks
        if str(task.get("priority", "")).strip() == "عالية"
    ]

    total_requirements = len(requirements)
    covered_requirements = [
        requirement
        for requirement in requirements
        if str(requirement.get("status", "")).strip() in {"مغطى", "مغطى كليًا", "مكتمل"}
    ]

    partially_covered_requirements = [
        requirement
        for requirement in requirements
        if str(requirement.get("status", "")).strip() in {"مغطى جزئيًا", "جزئي"}
    ]

    if total_requirements:
        documents_coverage_score = round(
            (
                len(covered_requirements)
                + (len(partially_covered_requirements) * 0.5)
            )
            / total_requirements
            * 100
        )
    else:
        documents_coverage_score = 0

    internal_readiness_score = int(tender.get("readiness_score") or 0)

    resource_readiness_score = resource_result["resource_readiness_score"]
    resource_evidence_coverage_score = resource_result["resource_evidence_coverage_score"]

    if (
        internal_readiness_score >= 90
        and documents_coverage_score >= 90
        and resource_readiness_score >= 85
        and resource_evidence_coverage_score >= 90
        and len(critical_open_tasks) == 0
    ):
        decision = "جاهز للتقديم"
        gate_status = "PASSED"
        confidence = "عالية جدًا"
    elif (
        internal_readiness_score >= 70
        and resource_readiness_score >= 65
        and len(critical_open_tasks) <= 1
    ):
        decision = "دخول مشروط"
        gate_status = "CONDITIONAL"
        confidence = "متوسطة"
    else:
        decision = "غير جاهز للتقديم"
        gate_status = "BLOCKED"
        confidence = "منخفضة"

    return {
        "internal_readiness_score": safe_percent(internal_readiness_score),
        "documents_coverage_score": safe_percent(documents_coverage_score),
        "resource_readiness_score": safe_percent(resource_readiness_score),
        "resource_evidence_coverage_score": safe_percent(resource_evidence_coverage_score),
        "open_tasks_count": len(open_tasks),
        "critical_open_tasks_count": len(critical_open_tasks),
        "total_requirements": total_requirements,
        "gate_status": gate_status,
        "decision": decision,
        "confidence": confidence,
    }


def build_deterministic_reasoning_memo(
    bundle: Dict[str, Any],
    resource_result: Dict[str, Any],
    scores: Dict[str, Any],
) -> Dict[str, Any]:
    tender = bundle["tender"]
    requirements = resource_result["requirements"]

    requirement_reasoning = []
    risk_notes = []
    recommended_actions = []

    for requirement in requirements:
        best_match = requirement.get("best_match")

        if best_match:
            document_sentence = (
                "ويوجد مستند داعم مرتبط بهذا المورد."
                if best_match["documents_count"] > 0
                else "لكن المورد يحتاج إلى مستند داعم قبل استخدامه كدليل رسمي."
            )

            requirement_reasoning.append(
                {
                    "requirement_id": requirement["requirement_id"],
                    "requirement_title": requirement["requirement_title"],
                    "reasoning": (
                        f"تم ربط المتطلب بأفضل مورد مطابق وهو: {best_match['resource_name']} "
                        f"بدرجة مطابقة {best_match['match_score']}%. {document_sentence}"
                    ),
                    "best_resource": best_match["resource_name"],
                    "match_score": best_match["match_score"],
                    "documents_count": best_match["documents_count"],
                }
            )

            if best_match["documents_count"] == 0:
                risk_notes.append(
                    f"المتطلب ({requirement['requirement_title']}) لديه مورد مطابق لكنه يحتاج إلى مستند داعم."
                )
                recommended_actions.append(
                    f"رفع مستند داعم للمورد: {best_match['resource_name']}."
                )
        else:
            requirement_reasoning.append(
                {
                    "requirement_id": requirement["requirement_id"],
                    "requirement_title": requirement["requirement_title"],
                    "reasoning": "لم يتم العثور على مورد شركة مناسب يدعم هذا المتطلب.",
                    "best_resource": None,
                    "match_score": 0,
                    "documents_count": 0,
                }
            )

            risk_notes.append(
                f"لا يوجد مورد مناسب للمتطلب: {requirement['requirement_title']}."
            )
            recommended_actions.append(
                f"إضافة مورد شركة أو مستند داعم يغطي المتطلب: {requirement['requirement_title']}."
            )

    if scores["critical_open_tasks_count"] > 0:
        risk_notes.append("توجد مهام حرجة مفتوحة قد تمنع التقديم.")
        recommended_actions.append("إغلاق المهام الحرجة قبل اعتماد قرار التقديم.")

    if scores["documents_coverage_score"] < 90:
        risk_notes.append("تغطية أدلة مستندات المنافسة أقل من الحد الآمن.")
        recommended_actions.append("رفع أو تحديث مستندات المنافسة حتى تصل تغطية الأدلة إلى 90% أو أعلى.")

    if not risk_notes:
        risk_notes.append("لا توجد مخاطر حرجة ظاهرة في هذه المرحلة.")

    if not recommended_actions:
        recommended_actions.append("تنفيذ مراجعة نهائية للمستندات واعتماد نسخة التقديم.")

    executive_memo = (
        f"بعد تحليل المنافسة ({tender['title']}) للجهة ({tender['client']}), "
        f"تظهر بوابة القرار أن الحالة هي: {scores['decision']} بثقة {scores['confidence']}. "
        f"بلغت الجاهزية الداخلية {scores['internal_readiness_score']}%، "
        f"وتغطية أدلة المنافسة {scores['documents_coverage_score']}%، "
        f"كما بلغت جاهزية موارد الشركة {scores['resource_readiness_score']}% "
        f"وتغطية أدلة الموارد {scores['resource_evidence_coverage_score']}%. "
        f"قام الوكيل بفحص {resource_result['resources_checked']} موردًا من موارد الشركة، "
        f"ووجد أن {resource_result['requirements_with_usable_evidence']} من أصل "
        f"{scores['total_requirements']} متطلبات لديها موارد مدعومة بأدلة. "
        f"بناءً على ذلك، يوصى باتباع الإجراء التالي: {recommended_actions[0]}"
    )

    bid_strategy = (
        "استراتيجية الدخول المقترحة هي الدخول بثقة مع إبراز الموارد الداخلية المدعومة بالأدلة، "
        "واستخدام شهادات الإنجاز والقوالب الفنية كمواد داعمة في العرض. يجب الحفاظ على نسخة مراجعة نهائية "
        "تربط كل متطلب بالمورد والمستند الداعم قبل التقديم."
        if scores["gate_status"] == "PASSED"
        else "استراتيجية الدخول المقترحة هي الدخول المشروط فقط بعد معالجة المخاطر المفتوحة ورفع الأدلة الناقصة."
    )

    return {
        "executive_memo": executive_memo,
        "bid_strategy": bid_strategy,
        "risk_notes": risk_notes,
        "recommended_actions": recommended_actions,
        "requirement_reasoning": requirement_reasoning,
    }


def try_generate_llm_memo(context: Dict[str, Any]) -> Optional[str]:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5.5")

    if not api_key:
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        prompt = {
            "task": "اكتب مذكرة قرار تنفيذية عربية احترافية لمنافسة بناءً على بيانات الجاهزية والموارد والأدلة.",
            "rules": [
                "لا تخترع أي مورد أو مستند غير موجود في البيانات.",
                "اذكر سبب القرار بوضوح.",
                "اكتب بأسلوب مستشار مناقصات محترف.",
                "استخدم لغة عربية واضحة ومباشرة.",
                "لا تتجاوز 350 كلمة.",
            ],
            "context": context,
        }

        response = client.responses.create(
            model=model,
            instructions=(
                "أنت وكيل ذكي متخصص في تحليل جاهزية التقديم على المنافسات. "
                "مهمتك تحويل بيانات الجاهزية والموارد والأدلة إلى مذكرة قرار تنفيذية دقيقة."
            ),
            input=json.dumps(prompt, ensure_ascii=False),
            max_output_tokens=900,
        )

        return response.output_text
    except Exception:
        return None


@router.get("/tenders/{tender_id}/decision-memo")
def get_tender_decision_memo(tender_id: int):
    bundle = load_tender_bundle(tender_id)

    try:
        resource_result = build_resource_matches(bundle)
        scores = build_gate_scores(bundle, resource_result)

        deterministic = build_deterministic_reasoning_memo(
            bundle=bundle,
            resource_result=resource_result,
            scores=scores,
        )

        context_for_llm = {
            "tender": bundle["tender"],
            "scores": scores,
            "resource_summary": {
                "resources_checked": resource_result["resources_checked"],
                "requirements_with_usable_evidence": resource_result[
                    "requirements_with_usable_evidence"
                ],
                "resource_readiness_score": resource_result["resource_readiness_score"],
                "resource_evidence_coverage_score": resource_result[
                    "resource_evidence_coverage_score"
                ],
            },
            "requirements": resource_result["requirements"],
            "risk_notes": deterministic["risk_notes"],
            "recommended_actions": deterministic["recommended_actions"],
        }

        llm_memo = try_generate_llm_memo(context_for_llm)

        provider = "openai_responses_api" if llm_memo else "deterministic_reasoning_fallback"

        return {
            "tender_id": bundle["tender"]["id"],
            "tender_title": bundle["tender"]["title"],
            "client": bundle["tender"]["client"],
            "generated_at": datetime.utcnow().isoformat(),
            "provider": provider,
            "model": os.getenv("OPENAI_MODEL", "gpt-5.5") if llm_memo else None,
            "decision": scores["decision"],
            "gate_status": scores["gate_status"],
            "confidence": scores["confidence"],
            "scores": scores,
            "executive_memo": llm_memo or deterministic["executive_memo"],
            "bid_strategy": deterministic["bid_strategy"],
            "risk_notes": deterministic["risk_notes"],
            "recommended_actions": deterministic["recommended_actions"],
            "requirement_reasoning": deterministic["requirement_reasoning"],
            "resource_matches": resource_result["requirements"],
            "engine": "munjiz_reasoning_layer_v1",
        }
    finally:
        bundle["conn"].close()