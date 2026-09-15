# App usage analytics

## Product contract

First-party usage collection lives in the existing Supabase project; no analytics vendor or SDK key is required. The admin surface is `/analytics/app`, available only to super admins through the existing admin navigation. This is a live database-backed product feature, not a populated snapshot. Until migration and mobile rollout, the dashboard shows unavailable/no-events states rather than invented data.

Users explicitly enable **Help improve the app** in mobile Settings (English/Arabic). Default is off. Collection is authenticated; the database derives user identity from `auth.uid()`, rejects non-active accounts, and excludes explicitly flagged `users_profile.is_demo` accounts. The new account demo flag defaults false; operators must explicitly flag known demo/test accounts. Never infer it from a person's name. Raw reads/writes are denied to mobile roles. Admin pages receive only aggregate counts; event rows use internal account UUIDs, not anonymous identities.

Events: screen views, project/property views, applied search filters (no query text), successful favorites, successful contact requests, deal submission starts/successes/failures. Home navigation is normalized to Dashboard. No arbitrary metadata, personal names, phone numbers, email addresses, URLs, messages, file contents, credentials, OTPs, advertising IDs or device fingerprints are collected. Login/password recovery screens are not instrumented.

## Definitions

- Window: selected 7/30/90 UTC calendar days, including the current partial day. Platform filters apply to every metric.
- Active users: distinct participating active accounts with an accepted event in the window; not all registered accounts.
- Sessions: distinct `(user_id,session_id)` among accepted events. Client rotates after 30 minutes without a tracked interaction, app restart or account change.
- Screen views: navigation to a different allowed screen or foreground entry. Route parameter updates do not produce duplicate views.
- Feature usage: event count and distinct accounts per allowlisted action. Failures are diagnostic client observations, not authoritative financial status.
- Browse-to-contact: sessions with Properties screen view, then project/property view, then successful contact request, in that order in the selected window. It does not claim conversion for one particular property or across sessions.
- Daily chart: distinct accounts per UTC day, with zero days included. Daily user counts must not be summed to derive window users.
- Freshness: latest accepted event's received timestamp. A zero denominator is shown as unavailable, not 0% conversion.

## Delivery and privacy controls

Memory-only queue capped at 100 events; requests contain at most 50. Five-second batching, successful queue drain, stable UUID event IDs for deduplication, single concurrent flush. Failed telemetry never blocks a core workflow and retries on later activity/background flush. Queues are cleared on account/consent changes. No cross-account retry. Network loss or app termination can lose queued telemetry; counts are not exhaustive. SQL caps ingestion at 1,000 events per account/hour, accepts timestamps within 24 hours past/5 minutes future, and rejects unknown fields.

Opt-out immediately stops local collection; a successful server opt-out also deletes that account's retained events under the same preference-row lock used by ingestion. If saving fails, the UI shows unsynchronized state and asks to retry; server preference remains unchanged until saved. Other devices are stopped by the server-side consent check. Aggregates can fall after deletion. Daily cleanup expires events older than 90 days; monitor the scheduled retention job.

## Rollout

1. Apply `20260907133000_app_usage_analytics.sql` after the earlier project migrations. It adds account demo fields, protected preference/event tables, consent/ingestion/aggregate RPCs and the retention cron.
2. Deploy the dashboard/server changes.
3. Release the mobile changes separately when authorized. No native build or OTA was produced during implementation.
4. Flag known test/demo accounts explicitly. With a non-demo staging account, opt in, navigate Properties → detail → contact, and compare the dashboard to accepted events. Verify opt-out deletion and cross-account isolation.
5. Update the public privacy notice/store disclosures to accurately describe the implemented optional first-party usage analytics before enabling the release.

No production migration/deployment was performed in this implementation. Automated tests execute isolated database fixtures and mocked actual mobile service code. Real-device interaction, browser end-to-end consent and live delivery still require staging validation.
