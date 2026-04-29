# Munjiz OS - Technical Audit & Map

## 1. Existing Frontend Routes (Next.js)
The frontend is built using Next.js App Router (`apps/web/app`). The current routes include:

*   `/tenders` - Main tender listing (Tender Command Center).
*   `/tenders/new` - Tender intake (handles both `?mode=file` and `?mode=manual`).
*   `/tenders/[id]` - Tender detail view.
*   `/tenders/[id]/reasoning` - LLM Reasoning / Decision Memo.
*   `/tenders/[id]/executive` - Executive Decision Board & Submission Gate.
*   `/workbench` - Gap Closure Workbench (Employee view for tasks).
*   `/tasks` - Redirects to `/workbench`.
*   `/approvals` - Approval workflows.
*   `/dashboard` - General overview dashboard.
*   `/resources` - Company Resource Intelligence view.

## 2. Existing Backend Routers & Endpoints (FastAPI)
The backend is a FastAPI application (`apps/api/app`). The core routers related to the tender lifecycle are:

*   **Intake (`intake.py`)**
    *   `POST /tenders/from-file/analyze` - Parses uploaded tender documents.
    *   `POST /tenders/from-file/confirm` - Confirms and creates the tender.
    *   `POST /tenders/manual` - Manual tender creation.
*   **Tenders (`tenders.py`)**
    *   `GET /{tender_id}` - Fetch tender details.
    *   `GET /{tender_id}/requirements` - List extracted requirements.
    *   `GET /{tender_id}/analysis` - Basic tender analysis.
    *   `GET /{tender_id}/submission-gate` - Fetch gate criteria and status.
*   **Company Resources (`resources.py`)**
    *   `GET /match/tender/{tender_id}` - Match tender requirements against existing company resources/evidence.
    *   `GET /{resource_id}/documents` - List documents for a specific resource.
*   **Gap Closure (`gap_closure.py`)**
    *   `POST /tenders/{tender_id}/generate` - Generates gap tasks for unmet requirements.
    *   `GET /workbench/{owner_role}` - Fetches tasks and dashboard metrics for a specific employee role.
    *   `POST /tasks/{task_id}/evidence/upload` - Uploads evidence for a specific gap task.
    *   `POST /tasks/{task_id}/verify` - Verifies the uploaded evidence.
*   **Reasoning (`reasoning.py`)**
    *   `GET /tenders/{tender_id}/decision-memo` - Generates the LLM Decision Memo for the tender.

## 3. Data Flow: Tender Creation to Executive Decision
1.  **Intake:** A tender is created manually or via file upload (`/tenders/from-file/analyze` -> `/tenders/from-file/confirm`).
2.  **Deconstruction:** The system extracts requirements from the tender documents (`/{tender_id}/requirements`).
3.  **Resource Matching:** The system evaluates current company resources against the requirements (`/match/tender/{tender_id}`).
4.  **Gap Identification:** For unmatched requirements, gap tasks are automatically generated and assigned to operational owners (`/tenders/{tender_id}/generate`).
5.  **Gap Closure (Workbench):** Employees access `/workbench`, review their assigned tasks, upload evidence (`/evidence/upload`), and trigger verification (`/verify`).
6.  **Reasoning & Memo:** The LLM synthesizes the tender requirements, existing resources, and closed gaps into a Decision Memo (`/tenders/{tender_id}/decision-memo`).
7.  **Executive Decision Board:** The `/tenders/[id]/executive` route aggregates the overall readiness score, gap closure metrics, and the LLM reasoning to present a final Submission Gate view for executive sign-off.

## 4. Broken or Weak Points Detected
*   **Hardcoded API URLs:** The frontend contains hardcoded API base URLs (e.g., `const API_BASE_URL = "http://127.0.0.1:8000";` in `/workbench/page.tsx`). This needs to be moved to an environment variable (`NEXT_PUBLIC_API_URL`) for safer deployments.
*   **Silent Router Failures:** In `apps/api/app/main.py`, backend routers are imported using `try...except` blocks. If a router has a syntax error, it fails silently and isn't included in the API, which can lead to frustrating debugging sessions.
*   **State vs. URL Sync:** In `/workbench/page.tsx`, `tenderId` defaults to a hardcoded `"4"` if not present in the URL, and it is stored in React state. Updates to the query parameter outside of the component might not sync perfectly with the internal state.
*   **Lingering Backup Files:** There is a `gap_closure_backup.py` file in the routers directory. While not actively loaded, it represents technical debt that could cause confusion.

## 5. Safe Implementation Plan for Next Enhancement
For any new enterprise module or feature, the following sequence should be executed to ensure system stability:

1.  **Backend Data Layer (API):**
    *   Define Pydantic schemas for request/response validation in `apps/api/app/schemas`.
    *   Implement core business logic in `apps/api/app/services`, maintaining the local SQLite connection paradigm.
    *   Expose endpoints via a dedicated router in `apps/api/app/routers`, ensuring endpoints are prefixed correctly and avoid conflicting with existing routes.
    *   *Check:* Remove `try...except` for the new router in `main.py` or log the exception explicitly to catch syntax errors early.
2.  **Frontend API Integration (Web):**
    *   Create corresponding TypeScript types reflecting the backend Pydantic schemas.
    *   Implement fetch functions utilizing the existing `API_BASE_URL` pattern (until it is refactored into an `.env` variable).
3.  **Frontend UI Implementation (Web):**
    *   Create the new Next.js page in `apps/web/app/<new_route>/page.tsx`.
    *   Ensure the UI strictly adheres to the established enterprise RTL Arabic design (e.g., matching the styling of `/workbench/page.tsx`). Do not use terms like "demo".
4.  **Verification:**
    *   Verify the endpoint logic manually via Swagger (`http://127.0.0.1:8000/docs`).
    *   Verify the data flow end-to-end through the Next.js UI.
