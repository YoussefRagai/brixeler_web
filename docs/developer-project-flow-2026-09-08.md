# Developer project flow — 2026-09-08

## Scope and evidence

Fresh authenticated browser walkthrough of project creation, project overview, phases and phase inventory on the live developer dashboard. No live business forms were submitted. The local preview uses the existing backend for reads; browser edit tests are discarded without saving. Luna Max agents implement creation, project workspace routing and phase forms; parent owns integration, review controls and individual-unit edit usability.

## Audit and implementation plan

1. **Create a project — overloaded.** Five mandatory navigation steps mix shared facts, commercial terms, launch metadata, media and inventory before the project exists. Replace with Project details → Materials → Review & create. Optional information stays available in collapsed groups; creating does not imply publication or review submission.
2. **Project overview — weak guidance.** Large repeated project branding, metrics and readiness percentages do not explain the business sequence. Add a concise next-step path from shared project details to phase setup, phase inventory and review. Preserve the selected phase across navigation.
3. **Phases — hidden form and unclear continuation.** The Add phase link scrolls to a closed disclosure. Use an actual open/focus control with essential fields first, optional details collapsed, clear cancellation and pending state. Continue to that phase's inventory.
4. **Inventory — two models mixed.** Individual sellable units and reusable unit types/variants are shown on the same long page. Split them into named views, retaining the same phase and all existing import/export/edit capabilities. Editing an individual row must select it for saving; label filter saves separately.
5. **Review — buried and misleading progression.** Review controls are in Settings and “changes requested” appears as a normal forward step. Expose Review as a named tab, link missing details to their editors, show corrections as a branch back to preparation, and avoid duplicate submit actions on submitted/approved/published projects. Keep server approval and customer-visibility rules intact.

## Before screenshots

### 1. Project creation

![Project creation before changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/02-before-create-desktop.png)

### 2. Project overview

![Project overview before changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/03-before-overview.png)

### 3. Phase setup

![Phase creation before changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/04-before-phase.png)

### 4. Phase inventory

![Combined inventory before changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/05-before-inventory.png)

## Accessibility and acceptance boundaries

- Fresh AX inspection found unlabeled individual-unit inputs; labels are part of the fix. Color alone must not distinguish phase selection, availability or publication.
- Validate keyboard focus on step transitions, Add phase, error recovery and cancellation; inspect mobile and desktop reflow. Screenshots alone do not establish WCAG compliance.
- Real email recovery remains paused. No production migration/deployment, mobile build, inventory publication or real new-project creation is authorized as part of this local verification pass.
- Database tenant boundaries, phase binding, role checks and moderation stay unchanged. Complete end-to-end production save/upload verification is separate from browser previews, mocked action tests and rollback SQL contracts.

## Implemented flow

1. **Create — improved:** Project details → Materials → Review & create. Only the project name is required initially; existing commercial, launch, staged-payment and media fields remain available. Browser walkthrough confirmed summary values, back navigation and required-name focus. No create was submitted.
2. **Overview — improved:** Current completeness feeds one next action, with project setup separated from publication. Draft is not described as submitted or mobile-visible.
3. **Phases — improved:** Add/Edit opens the actual form, optional fields are collapsed, and cancel preserves entries. Phase order defaults to the next order.
4. **Inventory — improved:** Unit types and Individual units have separate views. Row edits automatically select the row; save-filter and save-changes are distinct. Local checks no longer invoke a redirecting server dry run that discarded the edited payload. The server still validates actual writes.
5. **Review — improved:** Dedicated tab with blockers and feedback; corrections return to preparation, not a fake forward stage. Submitted/published resources do not offer duplicate submit actions.

### Creation review after changes

![Three-step project review](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/06-after-create-review.png)

### Project overview and dedicated review

![Project overview after changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/07-after-overview.png)

![Dedicated review after changes](/Users/youssefragai/Documents/MCP/brixeler-web/output/audits/2026-09-08-project-flow/08-after-review.png)

Final all-JavaScript suite: 120/120 passed, including routing regression tests. Isolated database suites: ten passed. Build/type/lint results and limitations below remain separate from browser checks; no real create/import/upload was submitted.

Automated checks and exact remaining limits are recorded in TASK_LOG.md. This is a local implementation, not a production release or a claim of complete end-to-end save/upload/accessibility coverage.
