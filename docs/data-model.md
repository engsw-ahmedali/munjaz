# High-Level Data Model: Munjiz OS

## 1. High-Level Purpose of the Data Model
The data model for Munjiz OS is designed to provide a robust, stateful foundation for tracking the entire lifecycle of a tender evaluation. It ensures deterministic tracking of compliance (pass/fail/gap), orchestrates team tasks, and maintains a strict audit trail of all AI-generated extractions and human decisions. The model clearly separates the unstructured source data from the highly structured tracking of requirements and resources.

## 2. Core Entities & Relationships

### Tender
*   **Purpose:** The central workspace entity representing a specific bid opportunity.
*   **Key Fields:** Title, Issuer, Submission Deadline, Current Status (e.g., NEW, UNDER_REVIEW, BID_APPROVED), Value (Estimated), Owner ID.
*   **Important Relationships:** Has many `TenderDocuments`, `Requirements`, `Tasks`, `Risks`, `Approvals`.
*   **Centrality:** This is the root node of the workflow.

### TenderDocument
*   **Purpose:** Represents a physical file uploaded to a specific Tender workspace.
*   **Key Fields:** Filename, File URL/Path, Document Type (e.g., RFP, Q&A, Addendum), Uploaded By, Upload Date.
*   **Important Relationships:** Belongs to a `Tender`. Source of many `Requirements`.

### Requirement
*   **Purpose:** A discrete, atomic rule or condition extracted from a TenderDocument that the company must fulfill.
*   **Key Fields:** Description (e.g., "Must have ISO 27001"), Category (e.g., Technical, Financial, Legal), Is Mandatory (Boolean), *Source Quote* (Traceable), *Source Page/Location* (Traceable).
*   **Important Relationships:** Belongs to a `Tender`. Extracted from a `TenderDocument`. Has one `Gap` (initially) or many `Matches`.
*   **Centrality:** The core unit of work for evaluation.

### Resource
*   **Purpose:** An internal company asset that can be used to satisfy a Requirement.
*   **Key Fields:** Resource Name, Resource Type (e.g., CV, Certificate, Product Spec, Past Project), Details (JSON blob or text), Expiry Date.
*   **Important Relationships:** Can be linked to many `Requirements` via a `Match`.

### Match
*   **Purpose:** A junction entity representing a successful link between a specific Requirement and a specific Resource that satisfies it.
*   **Key Fields:** Confidence Score (if AI suggested), Match Status (e.g., AI_Suggested, Human_Verified, Rejected), Rationale/Justification.
*   **Important Relationships:** Links one `Requirement` to one `Resource`.

### Gap
*   **Purpose:** Represents a deficiency where a Requirement is not met by existing internal Resources.
*   **Key Fields:** Severity (e.g., Critical, Minor), Resolution Strategy (text), Status (e.g., Open, In_Progress, Closed).
*   **Important Relationships:** Belongs to one `Requirement`. Often triggers the creation of a `Task`.

### Task
*   **Purpose:** An actionable item assigned to a team member, usually to resolve a Gap or clarify a Requirement.
*   **Key Fields:** Title, Description, Assignee ID, Due Date, Status (e.g., Todo, In_Progress, Done).
*   **Important Relationships:** Belongs to a `Tender`. Optionally linked to a specific `Gap` or `Requirement`.

### Clarification
*   **Purpose:** A question or point of confusion that needs to be sent to the Tender Issuer, or internal Q&A.
*   **Key Fields:** Question Text, Answer Text, Deadline for Q&A, Status (e.g., Draft, Submitted, Answered).
*   **Important Relationships:** Belongs to a `Tender`. Optionally linked to a specific `Requirement`.

### Risk
*   **Purpose:** A potential issue or threat associated with the Tender that needs monitoring.
*   **Key Fields:** Description, Probability (e.g., Low, High), Impact (e.g., Low, High), Mitigation Plan.
*   **Important Relationships:** Belongs to a `Tender`.

### Approval
*   **Purpose:** A formal sign-off record required to transition the Tender to critical stages (e.g., Bid Approved, Submission Ready).
*   **Key Fields:** Approval Type (e.g., Go/No-Go, Final Submission), Approver ID, Decision (e.g., Approved, Rejected), Comments, Timestamp.
*   **Important Relationships:** Belongs to a `Tender`.

### AuditLog
*   **Purpose:** An immutable record of critical actions taken within the system for compliance and traceability.
*   **Key Fields:** Action (e.g., "Status Changed", "Requirement Extracted", "Task Completed"), User ID (or "AI System"), Entity Type, Entity ID, Timestamp, Previous Value, New Value.
*   **Important Relationships:** Generic link to any core entity.

## 3. Practical Relationships & Workflow Centrality

The data model is highly relational, centered around the **Tender**. 
When a **TenderDocument** is ingested, AI generates multiple **Requirements**. Each **Requirement** is the nexus of the evaluation. 
Initially, every Requirement might generate a **Gap**. As users or AI evaluate the internal knowledge base, they create **Matches** by linking **Resources** to the Requirement. 
If a Match cannot be found, the Gap remains open, and a **Task** is created and assigned to a user to procure the missing Resource (e.g., update a CV, get a quote from a vendor). 
Throughout this process, **Clarifications** are logged for ambiguous requirements, and overall **Risks** are tracked at the Tender level. 
Before submitting, formal **Approvals** must be secured. Every step is recorded in the **AuditLog**.

## 4. Traceability to Source Evidence

To build trust in the system, specifically when AI is used for extraction, certain fields must be explicitly traceable to source evidence:
*   **Requirement.**`Source Quote`: The exact verbatim text from the PDF.
*   **Requirement.**`Source Page/Location`: The page number or bounding box in the original `TenderDocument`.
*   **Match.**`Rationale`: The explicit reasoning (whether generated by AI or written by a human) explaining *why* the Resource satisfies the Requirement.
