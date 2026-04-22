# High-Level System Architecture: Munjiz OS

## 1. System Overview
Munjiz OS is a stateful, AI-enhanced workspace designed to streamline the tender evaluation and bid-readiness process. It acts as the central hub where tender documents are ingested, parsed for requirements, and cross-referenced against a company's internal resource repository. The architecture is designed to cleanly separate state management, business logic, file storage, and AI-driven processing to ensure reliability, auditability, and clear data flows.

## 2. Main Layers of the System
The system is composed of four primary layers:
*   **Presentation Layer (Frontend):** The user interface where users interact with the stateful workspaces, dashboards, and tasks.
*   **Application & API Layer (Backend):** The core engine handling business logic, orchestrating AI calls, and serving data to the frontend.
*   **Data & Storage Layer (Database/File Storage):** Persistent storage for relational data, authentication state, and raw document files.
*   **Intelligence Layer (AI Services):** External LLM services responsible for unstructured data processing and semantic matching.

## 3. Frontend Responsibilities
*   **Workspace Management:** UI for creating, viewing, and managing stateful tender workspaces.
*   **Document Upload & Display:** Interface for uploading tender documents (drag-and-drop) and displaying document status.
*   **Interactive Dashboards:** Visualizing gap analysis (pass/fail/gap), requirement fulfillment, and overall tender readiness.
*   **Task & Workflow Management:** UI for managing tasks assigned to SMEs and progressing the tender through workflow statuses (e.g., NEW, UNDER_REVIEW, BID_APPROVED).
*   **Client-Side State:** Managing local UI state, routing, and form validation to provide a responsive, SPA-like experience.

## 4. Backend Responsibilities
*   **API Gateway:** Serving RESTful/GraphQL endpoints for the frontend application.
*   **Workflow Orchestration:** Managing the state transitions of a tender and enforcing business rules (e.g., cannot move to SUBMISSION_READY if critical gaps exist).
*   **AI Coordination:** Wrapping and managing calls to the Intelligence Layer (OpenAI API), handling rate limiting, retries, and prompt construction.
*   **Data Processing:** Transforming raw text extracted from documents into structured `Requirement` entities.
*   **Access Control:** Enforcing authorization rules to ensure users only see data they are permitted to access.

## 5. Database Responsibilities
*   **Relational Data Integrity:** Storing core entities (Tenders, Requirements, Resources, Tasks, Users) with strict foreign key constraints.
*   **State Persistence:** Maintaining the single source of truth for the status of every tender and task.
*   **Audit Logging:** Tracking changes to critical entities (who changed a status, when a task was completed).
*   **Authentication/Authorization:** Managing user identities, sessions, and roles.

## 6. File Storage Responsibilities
*   **Secure Document Hosting:** Storing original uploaded tender documents (PDFs, Word documents, Excel sheets).
*   **Asset Storage:** Storing internal company resources if they involve files (e.g., PDF certificates, CVs).
*   **Access Provisioning:** Providing secure, authenticated, and signed URLs for the frontend to download or display documents.

## 7. AI Responsibilities
*   **Text Extraction & Parsing:** Converting unstructured PDF/Word text into meaningful chunks.
*   **Requirement Identification:** Identifying and extracting specific, discrete requirements from lengthy tender documents (e.g., identifying a clause that demands ISO 9001 certification).
*   **Semantic Matching (Basic):** Comparing extracted requirements against the internal resource database to suggest potential matches or identify obvious gaps (e.g., matching a requirement for "10 years experience" against a CV).

## 8. Deterministic vs. AI-Driven Logic
A critical architectural principle of Munjiz OS is maintaining a clear boundary between deterministic state and non-deterministic AI generation.

*   **Deterministic Business Logic (Backend/DB):**
    *   Tender workflow state transitions.
    *   Task assignment and completion status.
    *   Authentication and Authorization.
    *   Final gap status (e.g., if a task to acquire a certificate is open, the gap is deterministically 'FAIL').
    *   CRUD operations for Resources and Tasks.

*   **AI-Driven Logic (Intelligence Layer):**
    *   Drafting the initial list of requirements from a 100-page PDF.
    *   Suggesting which internal CV *might* best fit a required profile.
    *   Summarizing long paragraphs into concise task descriptions.
    *   *Note: AI outputs must always be treated as proposals that the user can review, accept, or modify within the deterministic system.*

## 9. Main Data Flow: Upload to Submission Readiness
1.  **Ingestion:** User creates a Tender and uploads a PDF. Frontend sends the file directly to File Storage, and metadata to the Backend.
2.  **Processing Trigger:** Backend receives metadata, marks Tender as `UNDER_REVIEW`, and initiates a background job.
3.  **AI Extraction:** Background job retrieves text from File Storage, constructs a prompt, and sends it to the AI Layer to extract `Requirements`.
4.  **Requirement Persistence:** AI returns structured requirements. Backend saves these to the Database, linked to the Tender.
5.  **Initial Matching:** Backend queries the Database for internal `Resources` and optionally asks the AI to suggest matches against the new `Requirements`.
6.  **Gap Analysis UI:** Frontend polls or receives an event that processing is complete. It fetches the `Requirements` and `Resources` to render the Gap Dashboard.
7.  **Task Creation:** User identifies a gap (e.g., missing CV) and creates a `Task` in the UI. Backend deterministically saves the Task linked to the Requirement.
8.  **Resolution:** An SME completes the task and links a new Resource. The gap is deterministically closed.
9.  **Readiness:** Once all critical Requirement gaps are closed, the user manually transitions the Tender status to `SUBMISSION_READY`.

## 10. Main Modules/Components for MVP
*   **Workspace Module:** Tender CRUD, Document Upload UI, Status Management.
*   **Extraction Engine:** Background worker for parsing documents and interfacing with OpenAI for requirement extraction.
*   **Resource Library:** Simple CRUD interface for managing internal company assets (Personnel profiles, Certificates, Project References).
*   **Evaluation Dashboard:** The core UI component visualizing Requirements, linked Resources, and Gaps.
*   **Task Engine:** Simple ticketing system linked to specific Requirements.

## 11. Recommended Tech Stack for MVP
*   **Frontend:** Next.js + TypeScript + Tailwind CSS
*   **Backend:** FastAPI + Python
*   **Database / File Storage / Auth:** Supabase
*   **AI:** OpenAI API
