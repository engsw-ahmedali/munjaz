# Implementation Build Order: Munjiz OS MVP

## 1. Why Build Order Matters for this Project
In a hackathon setting, building an agentic workspace risks failing if too much time is spent on AI wrappers before the underlying state engine exists. Munjiz OS is fundamentally a deterministic state machine augmented by AI. The build order must prioritize establishing the deterministic core data structures first. If the AI extraction fails during a demo, the UI and state management must still function with manual input to prove the concept. 

## 2. Recommended Implementation Phases

### Phase 1: The Deterministic Foundation (No AI)
*   **Goal:** Establish the core data models, the internal resource repository, and the basic manual CRUD operations. 
*   **What to build:**
    *   Database schema setup (Tenders, Requirements, Resources, Tasks).
    *   Seed script for the Internal Resource Repository (mock CVs, certs).
    *   Basic API endpoints for creating a Tender and manually adding Requirements.
    *   Barebones UI to view a Tender and manually link a Resource to a Requirement.
*   **Why here:** AI needs a place to put its structured data. We must build the "bucket" before we turn on the "firehose." This phase proves the deterministic state logic works before introducing non-deterministic LLMs.

### Phase 2: The Agentic Pipeline (AI Integration)
*   **Goal:** Automate the extraction of structured requirements from unstructured documents.
*   **What to build:**
    *   File upload handler (PDF to raw text).
    *   LLM Prompt Engineering: Crafting the system prompt to return strict JSON matching our `Requirement` schema.
    *   Backend worker/service to route text to the OpenAI API and save the resulting JSON array to the database.
*   **Why here:** Now that the database can accept Requirements, we can replace manual entry with AI extraction. This is the hardest technical hurdle and the core "wow" factor, so it must be tackled early enough to leave room for iteration.

### Phase 3: The Gap Dashboard & Core Loop (First End-to-End Workflow)
*   **Goal:** Connect the AI output to the human-in-the-loop workflow. This phase produces the first end-to-end usable workflow.
*   **What to build:**
    *   The primary Evaluation Dashboard UI displaying extracted Requirements.
    *   Gap Detection logic (deterministically highlighting Requirements without a linked Resource).
    *   Task Creation UI linked to specific Gaps.
    *   The "Match Resource" dropdown UI to close Gaps.
*   **Why here:** This connects Phase 1 (State) and Phase 2 (AI). Completing this phase means we have a fully demonstrable product. A user can upload a PDF, see AI extract requirements, and manually resolve gaps using seeded resources.

### Phase 4: Lifecycle & Gate Logic (Business Rules)
*   **Goal:** Enforce the stateful workflow and prove this is a rigid workspace, not just a list.
*   **What to build:**
    *   Tender status update buttons (e.g., "Mark as Under Review", "Mark as Ready").
    *   Submission Gate Logic: Backend and frontend validation preventing the status from changing to `SUBMISSION_READY` if any mandatory Gap remains unlinked/open.
*   **Why here:** This elevates the project from a "cool AI trick" to a "professional enterprise tool." It ensures the deterministic readiness evaluation is actively enforcing business rules.

### Phase 5: UI Polish & Optional AI Sugar
*   **Goal:** Make the demo look premium and add high-impact, low-effort features. *This must only happen after Phase 4 is complete.*
*   **What to build:**
    *   Tailwind styling improvements, animations, and loading states (e.g., "AI is analyzing...").
    *   (Optional) AI Matching Suggestions: Using the LLM to pre-select the best resource from the dropdown.
    *   Error handling and empty states.
*   **Why here:** UI polish and "nice-to-have" AI features are useless if the core pipeline breaks. We reserve this for the final stretch to ensure the foundational demo is guaranteed to work.
