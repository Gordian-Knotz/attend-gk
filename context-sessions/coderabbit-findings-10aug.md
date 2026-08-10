# CodeRabbit findings - full codebase, 10 Aug 2026

CLI v0.7.2, free allowance. 142 files, 22,588 lines, 90 findings.


## CRITICAL

### 1. `src/app/admin/staff/actions.ts`

In @src/app/admin/staff/actions.ts around lines 17 - 35, Add runtime validation at the start of inviteStaff: reject roles outside the staff/manager allow-list and invalid email formats. After creating the admin service client, verify any non-null input.siteId belongs to employee.orgId via the sites query, returning the ownership error when no matching site is found.

### 2. `src/app/admin/staff/actions.ts`

In @src/app/admin/staff/actions.ts around lines 58 - 66, Before the employees upsert in the relevant staff action, read the existing row by authUser.id and compare its org_id with employee.orgId. Reject the invite with an error before calling upsert when the row belongs to a different organization; otherwise preserve the existing upsert and error handling.

### 3. `src/app/dashboard/actions.ts`

In @src/app/dashboard/actions.ts around lines 42 - 68, Update the server-side validation in the punch action around the site lookup and haversineMeters call: require input.lat and input.lng to be finite numeric coordinates before calculating distance, returning an error for invalid values. When employee.site_id is set, also reject the punch if the sites query errors or returns no row instead of silently continuing; only proceed to insertion after a valid site and finite geofence distance pass validation.

### 4. `src/app/dashboard/checkin-widget.tsx`

In @src/app/dashboard/checkin-widget.tsx around lines 61 - 87, Update flushQueue to use an in-flight ref that skips overlapping executions, and re-read the queue before persisting remaining items so events enqueued during awaits are preserved. When constructing the QueuedEvent payload in handlePress, assign crypto.randomUUID() to clientId, then propagate that field through the attendance request and enforce server-side deduplication with a unique attendance_events constraint.

### 5. `supabase/migrations/0001_init_schema.sql`

In @supabase/migrations/0001_init_schema.sql around lines 296 - 301, Restrict the “devices: select in org” policy on biometric_devices so ordinary employees cannot read webhook_secret, while preserving administrator access. Prefer revoking authenticated column-level SELECT access to webhook_secret, or otherwise move the secret to an inaccessible table; ensure the final migration chain does not leave the current org-wide read policy exposing it.


## MAJOR

### 1. `context & sessions/10-live-db-bringup.md`

In @context & sessions/10-live-db-bringup.md around lines 131 - 134, Replace the personal email in the live database bring-up documentation and the setup-admin seed flow with a non-personal placeholder, and update the SQL to obtain the administrator email from a psql variable or environment-provided value rather than hardcoding it. Preserve the existing administrator setup behavior while ensuring the committed document and supabase/setup-admin.sql contain no real personal address.

### 2. `postcss.config.mjs`

In @postcss.config.mjs around lines 1 - 3, Update the PostCSS config object to use a plugin map with "@tailwindcss/postcss" mapped to an empty options object, then default-export the existing config via its config symbol. Run npm run build to verify the configuration works.

### 3. `README.md`

In @README.md around lines 83 - 102, Add migration 0007_geofence_enforcement.sql to the ordered manual migration list in the README after 0006_notifications.sql, preserving the existing setup instructions and describing it as the geofence enforcement migration.

### 4. `scripts/seed-demo-data.mjs`

In @scripts/seed-demo-data.mjs around lines 156 - 172, Update the staff seeding flow around the per-iteration listUsers call to retrieve all Auth users before the STAFF loop, handling pagination beyond the default page size, then reuse that complete user collection for each email lookup. Preserve the existing createUser behavior for genuinely missing users and avoid repeated listUsers requests inside the loop.

### 5. `scripts/seed-demo-data.mjs`

In @scripts/seed-demo-data.mjs around lines 202 - 230, Update the on-leave branch in the history loop to build the leave date key from date’s local year, month, and day components instead of date.toISOString().slice(0, 10). Keep start_date and end_date using that local date key so they match the attendance date generated for the same iteration.

### 6. `src/app/admin/devices/remove-device-button.tsx`

In @src/app/admin/devices/remove-device-button.tsx around lines 27 - 29, Add an accessible name to the icon-only Button using an aria-label such as “Remove device,” while preserving the existing handleClick, loading disabled state, and icon rendering.

### 7. `src/app/admin/organizations/page.tsx`

In @src/app/admin/organizations/page.tsx around lines 36 - 43, Update the data-loading logic in the admin organizations page around the Promise.all queries to capture each query’s error alongside its data, derive a loadFailed state when any error is present, and render a Callout with variant="critical" when loading fails instead of treating failed queries as empty results.

### 8. `src/app/admin/page.tsx`

In @src/app/admin/page.tsx around lines 70 - 76, Update the date and cutoff calculations around now, todayStart, todayEnd, todayDateStr, and pastCutoff to use the organization or site time zone rather than the server time zone. Apply the same timezone-aware handling to the additional date logic and the current-time callout, ensuring kpi, exceptions, trendData, and displayed admin time all use the selected local timezone consistently.

### 9. `src/app/admin/page.tsx`

In @src/app/admin/page.tsx around lines 84 - 117, Update the Promise.all destructuring in the admin page to capture each query’s error alongside its data, then check for any error before deriving empty-state data or KPIs. Render the page’s failure state when a query fails, ensuring backend errors are not presented as the “No staff yet” onboarding state.

### 10. `src/app/admin/reports/page.tsx`

In @src/app/admin/reports/page.tsx around lines 51 - 77, Update the parallel queries in the reports page to retain each Supabase query’s error alongside its data, then check for any error before building siteNameById, employees, or rendering report results. Render the page’s error state when a query fails, and only use the existing empty-array fallbacks when successful queries legitimately return no rows; prevent ExportButton from receiving empty report data caused by a query failure.

### 11. `src/app/admin/schedule/actions.ts`

In @src/app/admin/schedule/actions.ts around lines 20 - 32, Update the shift time parsing before the ordering check in the relevant action to strictly validate the date and start/end time components, rejecting invalid dates, invalid clock values, and normalized calendar values. Resolve the site’s configured IANA time zone, construct both timestamps in that zone rather than the server local zone, and only then compare them and call toISOString() for the shifts insert.

### 12. `src/app/admin/schedule/delete-shift-button.tsx`

In @src/app/admin/schedule/delete-shift-button.tsx around lines 25 - 28, Update the Button rendered by the delete-shift component to include an accessible name describing the delete action, such as an aria-label, while preserving its existing loading, click, and disabled behavior.

### 13. `src/app/admin/sites/actions.ts`

In @src/app/admin/sites/actions.ts around lines 35 - 49, Update deleteSite to scope the Supabase sites delete by both siteId and the authenticated employee’s org_id, then request or otherwise inspect the affected row count. Return an error instead of success when zero rows are deleted, while preserving the existing database-error handling and revalidation behavior for successful deletions.

### 14. `src/app/admin/sites/delete-site-button.tsx`

In @src/app/admin/sites/delete-site-button.tsx around lines 35 - 37, Add an accessible name to the icon-only Button in the delete-site control by setting its aria-label using the available siteName value, such as “Remove” followed by the site name. Keep the existing loading, click, and disabled behavior unchanged.

### 15. `src/app/admin/staff/remove-staff-button.tsx`

In @src/app/admin/staff/remove-staff-button.tsx around lines 32 - 35, Update the Button rendered in the remove-staff control to include an aria-label that clearly identifies the remove action and incorporates employeeName, while preserving the existing loading, click, and disabled behavior.

### 16. `src/app/checkin/checkin-client.tsx`

In @src/app/checkin/checkin-client.tsx around lines 61 - 78, Update flushQueue to stop replay at the first recordAttendance failure, preserving the failed item and unprocessed queue tail in order; add an in-flight guard so concurrent flushes cannot overlap. Generate and persist a client event ID for each queued event, and use it with database-side idempotency in recordAttendance before considering offline replay reliable.

### 17. `src/app/dashboard/actions.ts`

In @src/app/dashboard/actions.ts around lines 10 - 17, Validate the client-supplied occurredAt in the action that persists this event before writing to the database: reject unparseable timestamps, values beyond the allowed future clock-skew window, and values older than the maximum supported offline-queue age. Preserve occurredAt as the authoritative ordering timestamp for values within that sanity window, and reuse existing project constants or validation utilities where available.

### 18. `src/app/dashboard/leave-request-dialog.tsx`

In @src/app/dashboard/leave-request-dialog.tsx around lines 31 - 33, Update todayStr() to import and reuse the shared localDateKey() helper from attendance-series.ts, passing it the current Date instead of slicing toISOString(). Preserve todayStr()’s existing string-returning behavior so both date inputs use the local calendar date.

### 19. `src/app/dashboard/page.tsx`

In @src/app/dashboard/page.tsx around lines 103 - 107, Update every toLocaleDateString and toLocaleTimeString call in the dashboard page, including the formatting near today and the shift/event sections, to pass the site or organization time zone explicitly via the timeZone option. Reuse the existing configured time-zone value and preserve the current locale and display options.

### 20. `src/app/dashboard/page.tsx`

In @src/app/dashboard/page.tsx around lines 71 - 100, Capture the error values from all four Supabase queries in the Promise.all destructuring, then use the relevant query error when rendering each dashboard card. In particular, update the upcoming-shifts rendering to show a distinct failure message when its query error is set, while retaining “No shifts scheduled in the next 7 days.” only when the query succeeds with no rows; apply the same error-versus-empty distinction to the other query-backed sections as appropriate.

### 21. `src/app/login/page.tsx`

In @src/app/login/page.tsx around lines 70 - 74, Update routeSignedInUser to validate the attacker-controlled next value before router.push. Allow only same-origin relative paths with optional query and hash, rejecting javascript: schemes and external URLs; preserve the existing refresh and return behavior for accepted destinations.

### 22. `src/app/onboarding/onboarding-form.tsx`

In @src/app/onboarding/onboarding-form.tsx around lines 18 - 33, Update handleSubmit to trim orgName before passing it to provisionOrganization, matching the existing trimmed-input validation. Wrap the provisioning call and success navigation in try/catch/finally so rejected server actions or network failures set a user-facing error, while setLoading(false) always executes; preserve the existing result.error handling and avoid navigating after a failure.

### 23. `src/components/callout.tsx`

In @src/components/callout.tsx around lines 20 - 32, Update the critical branch in the Callout component to add its dark-mode counterpart: retain bg-pac-ink for the default theme, and apply dark:bg-pac-graphite with the CTA band’s hairline dark-mode border utility to the same panel element. Preserve the existing text, layout, and className handling.

### 24. `src/components/motion/bento.tsx`

In @src/components/motion/bento.tsx around lines 70 - 124, Update the motion logic around paint and handleMove to cache the .bento-card elements and their bounding rectangles, then schedule at most one paint execution via requestAnimationFrame per frame using the latest pointer coordinates. Avoid repeated querySelectorAll and getBoundingClientRect calls during pointer events, and only update --glow-x, --glow-y, or --glow-intensity when the computed value differs from the card’s current value.

### 25. `src/components/reactbits/AnimatedContent.tsx`

In @src/components/reactbits/AnimatedContent.tsx around lines 110 - 127, Update the effect in AnimatedContent to store onComplete and onDisappearanceComplete in refs, invoke the current ref values from the timeline callbacks, and remove both callback props from the effect dependency array so inline callback identities do not recreate the animation or ScrollTrigger.

### 26. `src/components/reactbits/GlareHover.tsx`

In @src/components/reactbits/GlareHover.tsx at line 1, Add the "use client" directive at the top of the GlareHover component module, before imports, so its useRef hook and mouse event handlers are valid when imported by App Router components.

### 27. `src/components/reactbits/RotatingText.tsx`

In @src/components/reactbits/RotatingText.tsx around lines 80 - 106, Guard currentText access in the elements useMemo and the screen-reader text around line 188 so empty or shortened texts do not call split on undefined; provide the component’s safe empty-state behavior. Add an effect keyed by texts.length and currentTextIndex that resets the index to 0 whenever it exceeds the last available entry, while preserving normal indexing for non-empty texts.

### 28. `src/components/site/contact-form.tsx`

In @src/components/site/contact-form.tsx around lines 25 - 32, Update handleSubmit so it no longer discards form values or sets status to "sent" via the timeout; connect it to a validated backend or route handler that submits the request and only set "sent" after a successful response. Until that handler exists, disable submission and avoid displaying the success message that claims the request was received.

### 29. `src/components/site/faq.tsx`

In @src/components/site/faq.tsx around lines 25 - 26, Update the FAQ answer for “What devices can my team use to clock in?” to remove claims about the mobile app and fingerprint/face terminals, leaving only currently supported browser-based and kiosk QR flows or clearly labeling unsupported paths as planned.

### 30. `src/components/ui/dialog.tsx`

In @src/components/ui/dialog.tsx around lines 42 - 45, Update the class list passed by DialogContent to include a viewport-relative maximum height and vertical auto-scrolling, while preserving the existing positioning, sizing, animation, and caller-provided className behavior.

### 31. `src/components/ui/tabs.tsx`

In @src/components/ui/tabs.tsx around lines 44 - 62, Update TabsTrigger and TabsContent to add visible focus indicators using the existing focus-visible ring pattern from the Button component. Preserve the current active, disabled, and layout classes while ensuring keyboard focus on both the tab trigger and focusable content panel is visibly indicated.

### 32. `src/lib/attendance.ts`

In @src/lib/attendance.ts around lines 6 - 15, Update classifyCheckIn to accept an explicit IANA timezone and derive the check-in hour and minute by formatting occurredAtIso in that timezone, rather than using Date.getHours(). Update its callers to pass the organization or site timezone, preserving the existing cutoff comparison semantics.

### 33. `src/lib/attendance-series.ts`

In @src/lib/attendance-series.ts around lines 100 - 116, Update the leave-count calculation around the onLeave Set so employees whose IDs are already present in checkIns are excluded from the filtered leave set before computing its size. Keep the existing workforce and date-range filtering, then use the adjusted onLeave count in the settled absent calculation.

### 34. `src/lib/powersync/connector.ts`

In @src/lib/powersync/connector.ts around lines 97 - 119, Update the fatal-code handling in the transaction processing flow around the catch block to discard only the rejected entry and continue processing subsequent entries, rather than calling transaction.complete() and returning immediately. Ensure the transaction is completed once after all entries have been processed so unrelated later writes remain queued for upload.

### 35. `src/lib/powersync/schema.ts`

In @src/lib/powersync/schema.ts around lines 55 - 68, Resolve the duplicate offline-queue ownership for attendance events: either route check-in punches through the PowerSync `attendance_events` table or remove its insert-only offline role, or explicitly document the distinct surfaces and rationale. Align retry and upload behavior so `attendance_events` and the `attendpac:offline-queue` managed by `checkin-widget.tsx` do not independently represent the same punch ledger.

### 36. `src/lib/supabase/employee.ts`

In @src/lib/supabase/employee.ts around lines 24 - 32, Update the employee lookup query to destructure both data and error, then handle error before the !data check by logging the database failure and propagating a distinguishable error result. Preserve returning null only when the query succeeds without an employee row.

### 37. `src/lib/supabase/middleware.ts`

In @src/lib/supabase/middleware.ts around lines 10 - 15, Restrict the missing Supabase environment-variable bypass in the middleware to non-production environments by adding the existing environment check to the condition around NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. In production, do not return NextResponse.next({ request }) when either variable is missing, preserving route protection.

### 38. `src/lib/timesheet.ts`

In @src/lib/timesheet.ts around lines 130 - 133, Update the escape helper to detect fields beginning with =, +, -, @, tab, or carriage return and prefix the configured tab-guard or apostrophe before applying CSV quoting. Preserve existing escaping for quotes, commas, and newlines, and ensure the guard applies to user-provided fullName and siteName values.

### 39. `supabase/migrations/0001_init_schema.sql`

In @supabase/migrations/0001_init_schema.sql around lines 230 - 231, Update the “attendance: self insert” policy to require the inserted org_id matches the authenticated user’s employees.org_id, rather than validating only employee_id. Ensure client-supplied org_id cannot target another organization; preserve the existing self-insert constraint and consider the employee-row trigger only if needed to cover admin writes.

### 40. `supabase/migrations/0001_init_schema.sql`

In @supabase/migrations/0001_init_schema.sql around lines 274 - 288, Update the `summary: select in org` and `leave: select own or org` policies so staff can select only their own rows, managers can select rows from their site, and `org_admin`/`super_admin` users can select the entire organization. Reuse the existing employee role and site/org lookup conventions from the migration, while preserving the separate admin management policy.

### 41. `supabase/migrations/0002_self_serve_signup.sql`

In @supabase/migrations/0002_self_serve_signup.sql around lines 48 - 55, Update the employees insert in the self-serve signup migration to use a neutral placeholder for full_name instead of selecting auth.users.email, then extend the onboarding form to collect and persist the admin’s real name alongside the organization name. Ensure the placeholder is replaced with the submitted name during onboarding.

### 42. `supabase/migrations/0003_fix_super_admin_scope.sql`

In @supabase/migrations/0003_fix_super_admin_scope.sql around lines 13 - 162, Define the proposed security-definer helpers current_role_is and can_admin_org near the start of the migration, including stable SQL behavior, public search_path, and authenticated execute grants. Replace the repeated current_employee role/org predicates in each affected policy with can_admin_org for organization-scoped checks, preserving super_admin access and the existing shifts employee-to-organization validation; use current_role_is only where a direct role check is required.

### 43. `supabase/migrations/0007_geofence_enforcement.sql`

In @supabase/migrations/0007_geofence_enforcement.sql around lines 11 - 16, Update the migration header comment around the claims that the trigger “closes that hole” to explicitly warn that enforcement is incomplete: clients can bypass the geofence by submitting source 'biometric' or a null site_id because the existing insert policy only constrains employee_id. Add this warning next to the described exemptions and revise the equivalent claim in the later referenced comment block, without changing the trigger logic.

### 44. `supabase/powersync-setup.sql`

In @supabase/powersync-setup.sql around lines 19 - 22, Update the CREATE ROLE statement for powersync_role to omit LOGIN and the placeholder PASSWORD, creating the role without login by default. Add a separate explicit ALTER ROLE password step that operators must customize and run after replacing the placeholder, while preserving REPLICATION and BYPASSRLS.

### 45. `supabase/powersync-setup.sql`

In @supabase/powersync-setup.sql around lines 24 - 25, Replace the broad SELECT grant in the PowerSync setup with grants limited to the four tables included in the publication, and remove the ALTER DEFAULT PRIVILEGES statement so future public tables are not exposed to powersync_role. Preserve the existing publication scope and role configuration.

### 46. `supabase/setup-admin.sql`

In @supabase/setup-admin.sql at line 1, Remove the hardcoded personal email and name from the admin setup script, and parameterize those values for the organization-admin user. Apply the same parameter references consistently in the related update and insert statements identified by the diff, while preserving the existing setup behavior.


## MINOR

### 1. `context & sessions/01-codebase-comparison.md`

In @context & sessions/01-codebase-comparison.md around lines 40 - 51, Update the Next.js 15 migration rationale around the v1 Supabase server client to state that synchronous cookies() access remains supported by default but emits a warning, while cacheComponents makes it throw; describe v1 as requiring migration to the asynchronous API rather than claiming it immediately failed on Next.js 15.

### 2. `context & sessions/02-merge-decisions.md`

In @context & sessions/02-merge-decisions.md around lines 12 - 15, Update the “Runtime incompatibility” statement in the v1 Supabase server discussion to clarify that synchronous cookies() access warns by default and throws only when cacheComponents is enabled. State that v1 must use await cookies() for full Next.js 15 compatibility, while preserving the affected-component context.

### 3. `context & sessions/06-next-steps.md`

In @context & sessions/06-next-steps.md around lines 24 - 27, Update item 1 in the unverified migrations list to include migration 0007 alongside 0005 and 0006, preserving the existing scratch-project execution guidance and reflecting the 0005–0007 sequence.

### 4. `context & sessions/07-ui-motion-layer.md`

In @context & sessions/07-ui-motion-layer.md around lines 282 - 289, Update the “Backdrop only” and “Card glare” dial-back steps in the 10 Aug hero rebuild section to match the current src/app/page.tsx state: remove instructions to delete HeroBackdrop and alter HeroPreview’s GlareHover branch, while retaining only applicable cleanup guidance and the existing HeroThreads-based implementation.

### 5. `context & sessions/07-ui-motion-layer.md`

In @context & sessions/07-ui-motion-layer.md around lines 185 - 199, Remove the duplicate CTA band row from the motion inventory, keeping the complete entry that includes CtaTexture, BlurLabel, and RevealHeading and deleting the later entry with only BlurLabel and RevealHeading.

### 6. `context & sessions/README.md`

In @context & sessions/README.md at line 117, Remove the hardcoded personal email address from the committed notes and refer to the account by its role, such as the bootstrap super-admin account. Keep the actual address only in environment-local configuration or a secret store.

### 7. `context & sessions/README.md`

In @context & sessions/README.md around lines 59 - 63, Update the installation approval instruction in the README to use the repository’s pnpm command, replacing the npm install-scripts invocation with `pnpm approve-builds @journeyapps/wa-sqlite` while preserving the surrounding explanation.

### 8. `README.md`

In @README.md at line 230, Remove the stray "# attend-gk" text from README.md so it no longer renders as unrelated documentation content.

### 9. `scripts/seed-demo-data.mjs`

In @scripts/seed-demo-data.mjs around lines 232 - 235, Update the late check-in generation in the outcome-based timing logic near randomTimeOn so its earliest possible time is at least the 7:15 AM threshold enforced by classifyCheckIn, while preserving the existing present-window behavior and late time spread.

### 10. `src/app/admin/devices/page.tsx`

In @src/app/admin/devices/page.tsx around lines 90 - 92, Update the webhook secret rendering in the devices table around the webhook_secret column to handle null values safely before calling slice. First verify the column constraint in the initial schema; if webhook_secret is nullable, render an appropriate fallback while preserving the existing truncated display for non-null secrets.

### 11. `src/app/admin/devices/register-device-dialog.tsx`

In @src/app/admin/devices/register-device-dialog.tsx around lines 38 - 59, Update handleSubmit so registerDevice rejection is caught, the error is surfaced through setError, and setLoading(false) always runs in a finally block; preserve the existing success and result.error behavior.

### 12. `src/app/admin/devices/remove-device-button.tsx`

In @src/app/admin/devices/remove-device-button.tsx around lines 14 - 23, Update handleClick so the removeDevice(deviceId) call is wrapped in try/catch/finally: preserve the existing error alert and router.refresh behavior, handle rejected promises without leaving them unhandled, and move setLoading(false) into finally so loading always clears.

### 13. `src/app/admin/dismiss-notice-button.tsx`

In @src/app/admin/dismiss-notice-button.tsx around lines 14 - 22, Update handleClick so the dismissNotice call is wrapped with cleanup that always invokes setLoading(false), including when dismissNotice rejects; preserve the existing error alert, early return, and router.refresh behavior for resolved results.

### 14. `src/app/admin/organizations/page.tsx`

In @src/app/admin/organizations/page.tsx at line 137, Update the date formatting in the organization list around the created_at rendering to use an explicit locale and time zone with toLocaleDateString, ensuring server-rendered output is deterministic across deployment environments.

### 15. `src/app/admin/page.tsx`

In @src/app/admin/page.tsx around lines 257 - 262, Update the React key in the siteStats.map render to use the row’s unique site id (`site.id`) instead of `site.name`, preserving the existing statistics and markup.

### 16. `src/app/admin/reports/page.tsx`

In @src/app/admin/reports/page.tsx around lines 130 - 131, Update the periodLabel construction in the reports page to call toLocaleDateString with an explicit locale and date format for both windowStart and now, ensuring the page header and CSV rows use the same unambiguous representation regardless of server locale. Leave the fileName generation via localDateKey unchanged.

### 17. `src/app/admin/schedule/delete-shift-button.tsx`

In @src/app/admin/schedule/delete-shift-button.tsx around lines 14 - 22, Update handleClick so the deleteShift operation always clears the loading state, including when deleteShift rejects, by moving setLoading(false) into a finally block around the awaited operation while preserving the existing error alert and router.refresh behavior.

### 18. `src/app/admin/schedule/shift-dialog.tsx`

In @src/app/admin/schedule/shift-dialog.tsx around lines 32 - 34, Update todayStr to construct the YYYY-MM-DD value from the current Date instance’s local year, month, and day parts instead of using toISOString, preserving zero-padding for month and day.

### 19. `src/app/admin/sites/delete-site-button.tsx`

In @src/app/admin/sites/delete-site-button.tsx around lines 20 - 31, Update handleClick so the deleteSite(siteId) call is wrapped with try/catch/finally: preserve the existing success and error-result handling, handle rejected promises without leaving an unhandled rejection, and move setLoading(false) into finally so loading always clears.

### 20. `src/app/admin/staff/actions.ts`

In @src/app/admin/staff/actions.ts around lines 37 - 40, Update the user lookup in the staff action around admin.auth.admin.listUsers to paginate through every users page before matching input.email, using the API’s pagination options and continuing until all pages are retrieved. Perform the existing email comparison against the complete user set, preserving the current listError handling and downstream authUser flow.

### 21. `src/app/checkin/sign-out-button.tsx`

In @src/app/checkin/sign-out-button.tsx around lines 11 - 15, Update handleSignOut to call supabase.auth.signOut with the local scope, inspect the returned error, and display the error without calling router.push or router.refresh when sign-out fails. Preserve navigation and refresh only after a successful sign-out.

### 22. `src/app/dashboard/actions.ts`

In @src/app/dashboard/actions.ts around lines 115 - 126, Update the validation before the leave_requests insert to reject invalid startDate or endDate values, while preserving the existing end-before-start check for valid dates. Also validate input.leaveType against the established allow-list matching the database constraint, and return an error before inserting when either validation fails.

### 23. `src/app/dashboard/checkin-widget.tsx`

In @src/app/dashboard/checkin-widget.tsx around lines 29 - 36, Update readQueue to validate that the parsed localStorage value is an array before returning it; return an empty array for valid non-array JSON such as objects, numbers, or null. Preserve the existing parse-failure and server-side fallbacks so the flush path always receives a QueuedEvent[].

### 24. `src/app/dashboard/leave-request-dialog.tsx`

In @src/app/dashboard/leave-request-dialog.tsx around lines 42 - 63, Update handleSubmit to compare the submitted startDate and endDate before calling requestLeave, set an appropriate error and stop submission when the end date precedes the start date; also ensure requestLeave in the server actions validates and rejects the same ordering. Reset the dialog error whenever it closes, such as in the close handler or open-state transition, so stale errors are not shown on reopening.

### 25. `src/components/admin/stub-page.tsx`

In @src/components/admin/stub-page.tsx around lines 7 - 10, Update the placeholder paragraph in the stub page component to remove the outdated Supabase schema and auth prerequisite claim, leaving only a concise message that the {what} screen is not available yet.

### 26. `src/components/admin/topbar.tsx`

In @src/components/admin/topbar.tsx around lines 45 - 49, Update handleSignOut to call supabase.auth.signOut with scope set to local, check the returned error, display it and return when present, and only execute router.push and router.refresh after a successful sign-out.

### 27. `src/components/admin/topbar.tsx`

In @src/components/admin/topbar.tsx around lines 54 - 58, Add explicit aria-label values to both DropdownMenuTrigger buttons in the topbar: the mobile menu trigger containing Menu and the account trigger displaying initials. Use clear labels describing each action so assistive technology can identify the controls.

### 28. `src/components/reactbits/GlareHover.tsx`

In @src/components/reactbits/GlareHover.tsx around lines 52 - 60, Update animateIn to force a layout reflow after applying the non-animated reset background position and before enabling the transition and writing the animated end position; read a layout property from the overlay element to ensure the reset is committed on every hover.

### 29. `src/components/site/hero-preview.tsx`

In @src/components/site/hero-preview.tsx around lines 74 - 76, Update the Live indicator spans in the hero preview to honor reduced-motion preferences by adding a reduced-motion override to the span using animate-ping, or conditionally rendering it without animation when useReducedMotion() returns true; preserve the existing indicator appearance and animation for users without that preference.

### 30. `src/components/site/industry-tabs.tsx`

In @src/components/site/industry-tabs.tsx around lines 132 - 152, Remove the id prop from TabsTrigger so Radix can preserve its generated trigger ID and aria-labelledby association with TabsContent. Apply industry.id to the appropriate child span instead to retain hash-navigation behavior without overriding the trigger’s generated identifier.

### 31. `src/components/site/stat-tiles.tsx`

In @src/components/site/stat-tiles.tsx around lines 27 - 30, Update the tile class construction in the stat-tile rendering flow so mobile left borders apply only to the second column, while the first tile in each mobile row has no left border. Add a horizontal separator for the second mobile row, and at the md breakpoint restore left borders between every column without mobile row separators.

### 32. `src/components/theme-toggle.tsx`

In @src/components/theme-toggle.tsx around lines 15 - 17, Update the theme toggle render flow so the button always retains its accessible label and is not marked aria-hidden while unmounted. In the component’s existing button markup, keep the real label and conditionally render only the icon based on mounted, preserving the mounted behavior and button styling.

### 33. `src/components/ui/dialog.tsx`

In @src/components/ui/dialog.tsx around lines 22 - 24, Add motion-reduce:animate-none to the class lists for both the dialog overlay and content, alongside their existing transition animation classes, so reduced-motion users receive no fade or zoom animation.

### 34. `src/components/ui/select.tsx`

In @src/components/ui/select.tsx around lines 46 - 69, Update SelectContent around SelectPrimitive.Content to add the available-height max constraint and vertical-only scrolling with horizontal overflow hidden. Preserve the existing h-[var(--radix-select-trigger-height)] class on the popper SelectPrimitive.Viewport.

### 35. `src/lib/powersync/connector.ts`

In @src/lib/powersync/connector.ts around lines 24 - 31, Update the FATAL_PG_CODES constant to include PostgreSQL SQLSTATE 22P02 for malformed UUID errors. Keep the existing 42501 and specific integrity codes unchanged, and do not add the generic 23000 code.

### 36. `src/lib/supabase/middleware.ts`

In @src/lib/supabase/middleware.ts around lines 47 - 51, Update PROTECTED_PATHS to include “/api” so the middleware actually guards the routes claimed by the section comment, and preserve the existing protected paths. Also make the isProtected matching segment-aware so paths like “/admin-preview” are not matched as “/admin”, while retaining protection for the base paths and their descendants.

### 37. `supabase/migrations/0002_self_serve_signup.sql`

In @supabase/migrations/0002_self_serve_signup.sql around lines 37 - 38, Update the signup function around org_name validation and v_slug generation: reject NULL, blank, or punctuation-only names before inserting, preserving a trimmed non-empty organizations.name; generate the slug with the normalized name and a gen_random_uuid() suffix instead of the 6-character md5(random()) suffix, while keeping the existing slug format.

### 38. `supabase/setup-admin.sql`

In @supabase/setup-admin.sql around lines 37 - 48, After the site lookup in the setup script, validate that v_site_id was populated before updating or inserting the employee row. If no site exists for v_org_id, raise a clear exception and stop execution; otherwise preserve the existing employee update/insert flow with the valid site ID.

### 39. `supabase/setup-admin.sql`

In @supabase/setup-admin.sql around lines 12 - 13, Update the prerequisite comment in setup-admin.sql to state that all migrations in supabase/migrations/ must be applied before running it, while retaining the requirement that supabase/seed.sql has run at least once.


