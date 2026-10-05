# ALFRED TODO API v1

This server-to-server API exposes the existing personal TODO store to ALFRED Core. It adds no AI features. Production base URL: `https://ehalvorsen.no/todo/api/v1`. Local base URL: `http://localhost:3002/todo/api/v1` with `BASE_PATH=/todo`, or `/api/v1` without a base path.

The checked-in contract is [alfred-api.openapi.json](alfred-api.openapi.json), OpenAPI 3.0.3. No endpoint serves credentials or this application's internal storage envelope.

## Architecture and account boundary

The application uses Node.js, Express, a Vue browser UI, and a single JSON store (`data/store.json`). `wt:issues` is a JSON-encoded array. Customers, projects, tags, priorities and statuses are separate JSON-encoded arrays in the same file. There is no database service, ORM, RLS, owner column or multi-user system.

One service token represents this deployment's **single personal account**, covering both Work and Private registers. It cannot select a user, tenant, file, or another account. Unknown owner/user fields are rejected. It cannot authenticate to the browser storage API or the cabin administrator API. Browser session cookies cannot authenticate to v1. The cabin storage and login remain separate. If multi-user accounts are added later, resolve the principal to a tenant-scoped repository before running API handlers; do not add an unrestricted `user_id` filter.

Issue creation, overdue calculation, and update/timeline rules are shared with the UI in `public/js/issue-domain.mjs`; taxonomy defaults are shared in `issue-defaults.mjs`. A common repository handles both browser and integration writes.

## Authentication and permissions

Every v1 endpoint requires `Authorization: Bearer <service-token>` over HTTPS. The token is compared using fixed-length SHA-256 digests and timing-safe comparison. Tokens are never stored in the TODO file, returned, or logged by the integration.

Environment variables:

| Variable | Required/default | Purpose |
| --- | --- | --- |
| `ALFRED_API_TOKEN` | Required to enable API | Exactly 64 hexadecimal characters, generated from 32 cryptographically random bytes. With no token, all v1 requests return 401. Invalid configuration prevents startup. |
| `ALFRED_API_SCOPES` | `read,write` | Comma-separated subset of `read,write,delete`. `read` permits list/detail/events/metadata; `write` permits create/update/completion; `delete` permits deletion. |
| `BASE_PATH` | Existing production `/todo` | Existing external mount point. |
| `PORT` | Existing production `3002` | Existing service port. |
| `SESSION_SECRET` | Existing persisted secret if unset | Existing browser-session and cursor signing key. Keep stable. No new setting is required. |

Generate a token in PowerShell on the server:

```powershell
$env:ALFRED_API_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:ALFRED_API_SCOPES = 'read,write'
```

Store that value in the Windows service environment and ALFRED Core's private secret store. Shell environment variables do **not** automatically reach the Windows service. This app does not load `.env` files. Do not put a token in a URL, frontend, source file, screenshot, or committed config. Rotate by updating both services and restarting this server. Token rotation does not invalidate event cursors; changing the session signing secret does.

Deletion is disabled by default. When ready, set `ALFRED_API_SCOPES=read,write,delete`; ALFRED Core must obtain explicit user confirmation before calling DELETE. There is no bypass through PATCH: only documented fields are accepted. No new rate limiter is added to v1; infrastructure-level limits may still apply.

## Routes

All paths below are relative to `/todo/api/v1` in production.

| Method | Path | Scope | Result |
| --- | --- | --- | --- |
| GET | `/todos` | read | Paginated lightweight TODO summaries |
| GET | `/todos/:id` | read | Full TODO fields, without timeline or attachment contents; ETag header |
| POST | `/todos` | write | Create, 201, TODO and ETag |
| PATCH | `/todos/:id` | write | Partial update, 200, TODO and ETag |
| DELETE | `/todos/:id` | delete | Delete, 204; subsequent GET returns 404 |
| GET | `/metadata` | read | Status/priority keys, tag/customer/project IDs, registers and timezone |
| GET | `/events` | read | Durable incremental change feed |

Write fields: `title`, `description`, `notes`, `status`, `priority`, `register`, `customerId`, `projectId`, `tags`, `dueDate`, `links`. POST requires a nonblank title and defaults to `inbox`, `medium`, `work`. If those taxonomy keys were removed, explicitly choose valid keys from `/metadata`. IDs and timestamps are server-owned. Empty PATCH is invalid. `null` clears `dueDate`, `customerId`, or `projectId`; empty arrays clear tags/links. Links require HTTP(S) URLs and a provider name. Attachments are read-only metadata; attachment contents and the internal timeline are not exposed.

Set `status: "done"` to complete. Set an existing non-done status (for example `"inbox"` or `"ready"`) to uncomplete. There is no stored boolean completion field; response `completed` is derived from `status === "done"`. `archived` is not done, and is excluded from overdue. `completed=false` therefore includes archived records; apply a status filter if needed. Work and Private are registers, not separate user accounts.

Selecting a project sets its customer if `customerId` is omitted, matching the UI picker. A project must belong to the chosen register. Changing register clears an incompatible existing project. Explicit customer overrides are permitted, as in the UI.

## Filtering and pagination

`GET /todos` accepts only these parameters:

| Parameter | Meaning |
| --- | --- |
| `status`, `priority` | Exact stored taxonomy key |
| `completed` | `true` or `false` |
| `register` | `work` or `private` |
| `customer_id`, `project_id` | Exact existing relation ID; unmatched IDs return no results |
| `due_from`, `due_to` | Inclusive `YYYY-MM-DD` bounds; undated TODOs excluded |
| `due_today` | `true`/`false`, UTC date comparison, regardless of completion |
| `overdue` | `true`/`false`; dated before UTC today and neither done nor archived |
| `updated_since` | Exclusive ISO-8601 timestamp with explicit `Z` or offset |
| `limit` | 1–200, default 100 |
| `cursor` | Opaque signed cursor from the previous page |

All supplied filters are combined with AND. Timestamps are returned normalized to UTC ISO-8601. Due dates are date-only, not midnight deadlines or instants. **Today means UTC**, matching the existing UI's `todayStr()`. No local timezone conversion is applied to due dates.

List pages sort by immutable ID, using keyset pagination. Pass the returned cursor and optionally a new limit; filters are carried inside the cursor. If repeating filters, repeat the complete unchanged set. `page.next_cursor` is null at the end. List pages are live, not a frozen snapshot; use the initial-sync protocol below to account for concurrent changes. `updated_since` is useful for ad hoc queries, not guaranteed sync: it cannot discover deletions, and browser timestamps can come from client clocks.

## Concurrency

GET detail, POST, and PATCH return an ETag. Send `If-Match: <etag>` on PATCH or DELETE to reject a stale update with 409. Without it, writes apply in commit order (last write wins for the fields supplied). Unchanged PATCH requests are no-ops and do not emit events. Retrying a POST can create a duplicate: this version has no idempotency-key facility. Do not blindly retry a POST after an ambiguous connection failure; reconcile via the feed/list first.

The legacy browser API still saves the issue array. Its small storage-client refactor serializes local saves and sends an ETag for that whole array. A stale tab receives 409 and an instruction to reload, rather than overwriting an ALFRED edit or another tab's changes. Already-open tabs should be reloaded after deployment. No screen, workflow, or normal save behavior was redesigned.

## Durable event feed

`GET /events?cursor=...&limit=100` returns events in monotonically increasing commit sequence. Without a cursor it returns the retained journal from the beginning. `cursor=latest` returns no historical events and provides the current checkpoint. Even an empty page has a non-null `next_cursor`; persist it after processing the page. `has_more=true` means continue immediately with that cursor.

Event types: `todo.created`, `todo.updated`, `todo.completed`, `todo.uncompleted`, `todo.deleted`, plus `metadata.updated`. A completion transition emits its specific type rather than a duplicate generic update. Creation in done status is still `todo.created`, with status `done`. UI undo of deletion emits `todo.created` with the restored ID. Status transition events may include other fields in `changed_fields`.

Events contain a stable ID (`generation UUID:sequence`), sequence, server `occurred_at` timestamp, source (`ui` or `alfred`), TODO ID/status/register/changed field names, or a metadata resource name. They exclude descriptions, notes, attachment bodies, and the issue's full timeline. Treat every TODO event as an instruction to refresh that ID: GET it and upsert, or remove it locally on 404. This also handles delete-then-restore before polling. Refetch `/metadata` on `metadata.updated`.

Changes through **both** APIs enter one repository transaction. The data and journal are serialized to a temporary file, flushed, and atomically renamed together. A failed commit produces neither saved changes nor orphan events. Sequence cursors, rather than timestamps, prevent missing changes with equal timestamps. Replaying a cursor returns the same retained events; consumers should deduplicate by event ID. The journal survives service restarts and keeps deletion records. There is no automatic pruning.

The repository caches parsed state while the file is unchanged, and events use sequence offsets, so idle polls do not repeatedly parse or transmit all TODOs. This remains a single-process JSON-file application: every write rewrites the file and history grows. Do not use clustered workers or multiple writers. A transactional database/outbox is the future upgrade if volume warrants it.

### Initial sync

1. Call `/events?cursor=latest` and retain its `page.next_cursor` as **C0**.
2. Fetch `/metadata` and all `/todos` pages. Fetch individual TODO details if ALFRED needs descriptions or notes. Build a fresh local mirror, not an append-only import.
3. Starting from **C0**, consume all event pages. Refresh changed TODOs by ID; on 404 remove locally. Refetch metadata when indicated. This reconciles changes made during the initial list.
4. Commit mirror updates and the processed cursor together in ALFRED's own storage. Only then mark initial sync complete.

### Incremental sync

Poll `/events` with the last committed cursor. Process the page, persist changes and its next cursor atomically, and drain `has_more` pages. Retry the same cursor after a crash. Never advance past events that were not successfully processed. Read current TODO state rather than assuming an event is a complete historical snapshot.

A 409 `sync_reset_required` means the storage generation changed or the cursor is ahead of a restored store: rebuild with initial sync. A 400 invalid cursor means corrupt/tampered/wrong-kind cursor or changed signing secret; discard it and reinitialize after correcting configuration. The migration starts a new journal; pre-migration history is not fabricated as events.

## Deployment and migration

No SQL migration is needed. `migrations/001-alfred-events.js` is the explicit, repeatable JSON-format migration. It preserves existing values, creates a timestamped backup, and adds a private `_alfred` envelope containing the journal version, generation, and sequence. The internal envelope is inaccessible through browser storage and service endpoints.

**The implementation does not modify the live store or install a production token.** The new server deliberately refuses to start on an unmigrated store, preventing untracked writes.

On the existing Windows host, in an elevated PowerShell:

```powershell
Set-Location C:\Websites\worktracker-server
Stop-Service WorkTracker
npm run migrate:alfred
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not start the service.' }
# Keep the backup until deployment is verified.
# Set ALFRED_API_TOKEN and ALFRED_API_SCOPES in WorkTracker's NSSM environment.
# Preserve its existing PORT=3002 and BASE_PATH=/todo entries.
Start-Service WorkTracker
```

NSSM's `AppEnvironmentExtra` replaces the list when set; merge/preserve existing entries. Use the service's settings UI or your secret-deployment mechanism. Never paste the token into checked-in scripts. No Caddy change is needed: `/todo/*` already proxies to this service. Keep the backend bound/firewalled as it is and use HTTPS externally. Back up `data/store.json` and the existing session signing secret using restricted permissions. The API never needs a database credential.

This repository's scripts require Node 22.19+ (matching the deployed host and OpenAPI validator). Run `npm ci` if development dependencies changed, then `npm test` and `npm run check`. The app has no frontend build step, TypeScript configuration, or lint configuration. `seed.js` refuses to overwrite a migrated store; use API writes. Direct file edits are unsupported and bypass event tracking.

After any restore or offline data repair, with all writers stopped, run:

```powershell
npm run migrate:alfred -- --reset-sync
```

This explicitly rotates the generation and resets journal history, forcing consumers to reinitialize. Never silently truncate the event journal. For rollback, stop the service, restore the migration backup and previous application files together, then restart; that discards post-backup writes, so preserve a current backup first.

## Examples

PowerShell (use the same token already provisioned in your private environment):

```powershell
$base = 'https://ehalvorsen.no/todo/api/v1'
$headers = @{ Authorization = "Bearer $env:ALFRED_API_TOKEN" }
Invoke-RestMethod "$base/todos?completed=false&overdue=true&limit=50" -Headers $headers
Invoke-RestMethod "$base/todos?due_from=2026-10-05&due_to=2026-10-12" -Headers $headers
$created = Invoke-RestMethod "$base/todos" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ title='Prepare meeting'; register='work'; dueDate='2026-10-12' } | ConvertTo-Json)
$id = $created.data.id
Invoke-RestMethod "$base/todos/$id" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"status":"done"}'
Invoke-RestMethod "$base/events?cursor=latest" -Headers $headers
```

POSIX shell/curl:

```sh
curl --fail-with-body -H "Authorization: Bearer $ALFRED_API_TOKEN" \
  'https://ehalvorsen.no/todo/api/v1/todos?due_today=true'
curl --fail-with-body -X PATCH -H "Authorization: Bearer $ALFRED_API_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"inbox"}' \
  'https://ehalvorsen.no/todo/api/v1/todos/TODO_ID'
```

Example list envelope (actual IDs and signed cursors are opaque):

```json
{"data":[{"id":"EXAMPLE","title":"Prepare meeting","status":"inbox","completed":false,"priority":"medium","register":"work","customerId":null,"projectId":null,"tags":[],"dueDate":"2026-10-12","createdAt":"2026-10-05T12:00:00.000Z","updatedAt":"2026-10-05T12:00:00.000Z"}],"page":{"has_more":false,"next_cursor":null},"meta":{"timezone":"UTC"}}
```

Example event (inside the `data` array):

```json
{"id":"generation-id:42","sequence":42,"occurred_at":"2026-10-05T12:00:00.000Z","source":"alfred","type":"todo.completed","todo_id":"EXAMPLE","register":"work","status":"done","previous_status":"inbox","changed_fields":["status","updatedAt","timeline"]}
```

Errors use `{"error":{"code":"invalid_request","message":"..."}}`: 400 validation/invalid cursor, 401 missing/invalid token, 403 missing scope, 404 missing resource, 409 stale write/sync reset, 413 oversized request, 500 generic internal failure. No stack traces or internal secrets are returned. Requests are limited to 256 KiB JSON; individual field and pagination limits are specified in OpenAPI.

Optional host browser regression: `node tests/alfred-browser.cjs` (set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` for another machine). It verifies existing login, UI creation, serialized saves, drag-and-drop completion, register switching, and stale-write protection against an ALFRED edit.
