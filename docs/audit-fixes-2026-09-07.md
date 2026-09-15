# Audit remediation implementation — 7 September 2026

## Implemented

- F1: shared developer support queue/conversation in admin and developer portals; tenant/role checks, atomic replies, unread flags and audit.
- F2: mobile resale edits preserve associations and persist intentional project selection.
- F3/F10: ordinary unit edits preserve images; explicit project/phase media removal ignores retained URLs; replacement uploads take precedence.
- F4: audience approvals omit nonexistent legacy flag; rejected live audiences return to draft; approval controls are available.
- F5: failed mobile submissions reject without clearing the wizard. Stable fresh submission UUID reconciles ambiguous committed responses while the wizard remains open; changed payload cannot silently overwrite the saved result.
- F6: paged server-filtered catalogue plus independent owned/saved retrieval removes the 50-row ceiling. Existing aggregation still loads all matching pages; this is not infinite scrolling.
- F7: ticket-specific generation guard and cleared/loading state prevent stale replies/messages crossing conversations.
- F8: source-locked, actor-bound transactional mobile stage transition with durable idempotency receipt and rollback tests.
- F9: partial project creation remains explicitly reusable after listing failure, without duplicate query parameters or draft overriding retained project.
- F11: operational exports and business analytics now use `workspace_operations`; SalesClaim financial grain is labeled, reports paginate beyond default API row limits.
- Security: short-lived issuer/grant-bound impersonation, persisted grant revocation on exit, one-time invalidation of old developer cookies; exact-phone OTP compare-and-set; displayed-version Growth approval compare-and-set; shared formula-safe CSV serializer. XLSX remains string-typed. Fresh independent review reported no surviving bypass in that security patch scope.
- App usage analytics: opt-in mobile events, protected Supabase ingestion/retention and super-admin `/analytics/app`; see `app-usage-analytics.md`.

## Partially completed / external prerequisites

F12's optional developer CRM/API integration surface (credentials, webhooks, provider imports, mappings and sync scheduling) is intentionally removed from the dashboard release. No provider-specific adapter, delivery worker, or fake connected/import status is shipped.

Fresh submission recovery currently lasts while its wizard is open, not across app termination. Known test accounts require explicit demo flags. Password-leak protection and query-plan/index tuning from the audit are operational follow-ups, not blindly applied production changes.

## Migration order and deployment safety

1. `20260907130000_mobile_deal_transition.sql`
2. `20260907131000_support_workflow.sql`
3. `20260907133000_app_usage_analytics.sql`
4. `20260907134000_retire_developer_integrations.sql`

All four passed a fresh baseline replay, nine rollback-only SQL suites and error-level database lint, then were applied to production Supabase `zihysavpjeyurshpohqf` on 2026-09-07. The follow-up dry-run is up to date. The never-production-applied webhook-worker migration was removed. Release snapshot `b426d68` excludes unrelated WhatsApp source/tests/migration while retaining the audited exact-phone update guard. No mobile build or OTA was performed. New developer session format deliberately requires existing users to sign in once after rollout.

## Validation

Behavioral tests cover originals and legitimate controls: substituted OTP phone denied/unchanged phone succeeds; stale/concurrent approval denied/current independent approval works; revoked/demoted issuer and missing/expired grant denied/normal login remains; malicious CSV shapes escaped/ordinary CSV and XLSX preserved. Independent security reviewer ran the actual mocked-boundary regression suite.

Web tests, lint, TypeScript and production build; mobile typecheck/security-policy/reliability suites; all isolated database suites are the release evidence. CI test commands now include added JS/SQL suites. Tests use fixtures/mocks; no live OTP send, invitation, campaign, browser write workflow or real-device interaction was attempted. Those are staging release gates, not claimed passes.

Only first-party application and test/docs changes for this work should be released. Preserve unrelated existing dirty files. No assertion of exhaustive security coverage or every-button signoff is made.
