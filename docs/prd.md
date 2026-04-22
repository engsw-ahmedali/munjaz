# Product Requirements Document: Munjiz OS

## 1. Project Title
Munjiz OS

## 2. Problem Statement
Companies frequently miss out on lucrative tender opportunities or submit substandard bids due to the complexity and volume of tender requirements. Analyzing lengthy tender documents, cross-referencing them against scattered internal resources (CVs, past projects, certificates), identifying gaps, and tracking bid readiness is currently a manual, error-prone, and time-consuming process.

## 3. Solution Overview
Munjiz OS is an agentic tender-readiness system. It acts as a stateful workspace designed to streamline the tender lifecycle. The system ingests tender documents, intelligently extracts core requirements, and evaluates them against the company's existing internal knowledge base (personnel, products, past performance). Munjiz OS highlights compliance gaps, orchestrates task creation to address those gaps, and provides a clear path to decide whether a tender is ready for a successful submission. 

*Note: This is a stateful tender workspace system, not a conversational chatbot.*

## 4. Target Users
* **Bid Managers / Proposal Managers:** Oversee the entire tender process, track progress, and make the final call on bid submissions.
* **Subject Matter Experts (SMEs):** Provide technical input, update resource profiles, and complete specific tasks assigned to close gaps.
* **Sales / Business Development Executives:** Identify new tenders and monitor the pipeline of potential opportunities.
* **Executives / Management:** Review high-level bid readiness and approve strategic bids.

## 5. Core User Journey
1. **Intake:** A user creates a new tender workspace and uploads the relevant tender documents (RFPs, RFQs).
2. **Analysis:** The system agents process the documents, extracting specific requirements (e.g., "requires ISO 27001", "needs 3 senior engineers with 10+ years experience").
3. **Evaluation:** The system compares extracted requirements against the company's internal resource database to determine current readiness.
4. **Gap Identification & Action:** The workspace highlights missing requirements (gaps) and allows users to generate actionable tasks assigned to team members to resolve them.
5. **Decision & Progression:** As gaps are closed, the tender moves through various workflow statuses until it is either abandoned (No Bid) or deemed ready for submission.

## 6. Main Features for MVP
* **Tender Workspace Creation:** Ability to create a dedicated, stateful workspace for a specific tender opportunity.
* **Document Ingestion:** Basic upload functionality for tender documents (PDF/Word).
* **Requirement Extraction:** Automated extraction of key criteria (certifications, personnel profiles, past project references) from uploaded documents.
* **Resource Matching (Basic):** Comparison of extracted requirements against a simplified internal database of company resources.
* **Gap Analysis Dashboard:** A clear visual representation of what requirements are met and what is missing.
* **Task Management:** Ability to manually or automatically create tasks linked to specific gaps and assign them to users.
* **Status Tracking:** Manual progression of the tender through defined workflow statuses.

## 7. Out of Scope for MVP
* Automated bid writing or proposal generation.
* Complex integrations with external ERP or CRM systems (e.g., Salesforce, SAP).
* Advanced user permission and role-based access control (RBAC) down to the field level.
* Real-time collaborative document editing.
* Chatbot or conversational interfaces.
* Multi-language support.

## 8. Success Criteria
* **Time to Evaluate:** Reduce the time it takes to perform an initial go/no-go evaluation of a tender by 50%.
* **Gap Visibility:** 100% of identified mandatory requirements are tracked with a clear pass/fail/gap status.
* **User Adoption:** Target users are able to complete the core user journey for a mock tender without critical errors or assistance.

## 9. Core Entities
* **Tender:** The central object representing the opportunity (Title, Deadline, Issuer, Status).
* **Document:** Files associated with a Tender (RFPs, Addendums).
* **Requirement:** A specific, atomic criteria extracted from a Document.
* **Resource:** Internal company assets used to satisfy Requirements (Employee Profiles, Company Certificates, Past Project Records).
* **Task:** Action items created to address gaps or missing Requirements.
* **User:** Individuals interacting with the system.

## 10. Main Workflow Statuses
A Tender will progress through the following statuses:
* **NEW:** Tender created, documents uploaded, awaiting initial analysis.
* **UNDER_REVIEW:** System is extracting requirements and users are evaluating initial gaps.
* **NO_BID:** Decision made not to pursue the tender.
* **CONDITIONAL_BID:** Proceeding with the bid, pending resolution of critical gaps.
* **BID_APPROVED:** Go-decision confirmed, resources committed.
* **BID_IN_PROGRESS:** Active work on closing gaps and preparing submission materials.
* **BLOCKED:** Progress halted due to external or internal dependencies.
* **SUBMISSION_READY:** All critical gaps closed, bid package complete and approved for dispatch.
* **SUBMITTED:** Bid officially submitted to the issuer.
