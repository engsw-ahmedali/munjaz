# MVP Scope: Munjiz OS

## 1. MVP Goal
The primary goal of the Munjiz OS hackathon MVP is to prove the core value proposition: that an agentic system can ingest a complex tender document, automatically extract structured requirements, statefully compare them against an internal resource repository, and provide a deterministic workspace to manage the resulting gaps. It must demonstrate a transition from a manual, document-heavy process to a highly structured, data-driven workflow.

## 2. What Must Be Built in the MVP
The MVP will deliver a professional, fully functional core loop:
*   **Persistent Tender Workspace:** A central, stateful hub to create, manage, and track a specific tender opportunity.
*   **Real Tender Document Upload:** Ability to upload and process real PDF tender documents.
*   **Structured Requirement Extraction:** An AI-driven backend engine that accurately extracts distinct, actionable requirements from the uploaded documents.
*   **Internal Company Resource Repository:** A real but limited database of company assets (CVs, certificates, project references) seeded with demo data.
*   **Requirement-to-Resource Matching:** The ability to link extracted requirements to specific internal resources to prove compliance.
*   **Gap Detection:** A dashboard that deterministically identifies and highlights requirements that lack a matching resource.
*   **Task Creation:** A functional workflow to create and assign actionable tasks to resolve identified gaps.
*   **Deterministic Readiness Evaluation:** A clear, logic-based evaluation of the tender's overall readiness based on closed vs. open gaps.
*   **Persistent Tender Lifecycle & Submission Gate Logic:** Controlled status transitions (e.g., preventing a transition to `SUBMISSION_READY` if critical gaps remain unresolved).

## 3. Optional (If Time Allows)
*   **Automated AI Matching Suggestions:** Having the LLM proactively suggest which internal resource best fits a requirement to accelerate the matching process.
*   **Source Traceability UI:** Visually mapping an extracted requirement back to the exact quote or page number in the original PDF.

## 4. Explicitly Out of Scope for MVP
The following items are deferred to future phases. These represent advanced expansions of the platform, not a reduction in the core quality or legitimacy of the MVP:
*   **Advanced Data Integrations:** Deep integrations with external enterprise systems (Workday, Salesforce, SAP) are out of scope; the internal repository will operate standalone for the MVP.
*   **Complex Auth & RBAC:** Granular role-based access control is deferred; standard authentication is sufficient.
*   **Automated Proposal Generation:** The system evaluates and guarantees readiness, but drafting the final bid narrative is out of scope.
*   **Conversational Interfaces:** Munjiz OS is a structured workspace; open-ended chatbots are explicitly excluded.

## 5. User-Facing Flows That Must Work End-to-End
1.  **Ingestion & Extraction:** User creates a Tender, uploads an RFP PDF, and the system autonomously populates the workspace with structured requirements.
2.  **Evaluation & Gap Resolution:** User reviews the gap dashboard, utilizes the internal resource repository to match resources to requirements, and creates tasks for any missing assets.
3.  **Lifecycle Progression:** As tasks are completed and gaps are deterministically closed, the user navigates the tender through its controlled status transitions, ultimately clearing the submission gate logic.

## 6. Minimum Demo Scenario for Hackathon Judging
1.  **Setup:** Introduce the internal resource repository (seeded with specific company demo data) and a real, complex RFP document.
2.  **Action:** Upload the RFP into the persistent Tender Workspace.
3.  **Extraction:** Demonstrate the system accurately parsing the document into a structured requirement checklist.
4.  **Gap Management:** Highlight a detected gap (e.g., missing ISO certification), create a task to address it, and demonstrate matching a resource to close the gap.
5.  **Readiness Gate:** Show the deterministic readiness evaluation preventing submission until the final critical gap is resolved, proving the system's robust state management.

## 7. Technical Priorities for the MVP
*   **Extraction Accuracy:** The core AI pipeline must reliably return highly structured, accurate requirement data from unstructured PDFs.
*   **State Integrity:** The persistent lifecycle and submission gate logic must be robust and unbreakable.
*   **Professional UX:** The interface must feel like a premium enterprise tool, prioritizing clarity, data density, and responsiveness.

## 8. Risks If We Overbuild Too Early
*   **Compromising Core Workflows:** Focusing on advanced integrations or generative proposal writing could detract from perfecting the deterministic extraction and gap detection loop.
*   **Misinterpreting the Product:** Adding generic AI chatbot features could lead users or judges to misunderstand the system as a simple text wrapper rather than a stateful architectural solution.

## 9. Final Recommended MVP Boundary
Focus the engineering effort on perfecting the **Document -> Requirement Extraction pipeline** and the **Deterministic Gap & Task Workflow**. The MVP succeeds by proving that the chaotic tender process can be transformed into a rigorous, logic-driven, and agentically-assisted operational workspace.
