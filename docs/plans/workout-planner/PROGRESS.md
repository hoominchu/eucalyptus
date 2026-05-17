# Life Coach Workout Agent Progress

## Current Status

- [x] Docs refocused on the life coach workout agent.
- [x] Plan aligned to the health/calendar worker schema.
- [x] V0 platform decision documented: local Worker tool, existing Notion data sources, deterministic fixture import.
- [x] Local dry-run importer started for the current Apple Health export shape.
- [x] First Notion upsert slice implemented for `Metric Catalog`.
- [x] `Daily Summary` and `Workouts` writes implemented and imported.
- [x] Generated `Worker Decisions` writes implemented and imported.
- [x] Notion-backed `Health Sync Runs` handoff added for mobile Apple Health uploads.

## Rule Of The Road

This project is a life coach workout agent. V0 uses a Notion Worker tool run locally through the Notion CLI to import Apple Health-shaped JSON into the existing health data sources:

- `Daily Summary`
- `Workouts`
- `Metric Catalog`
- `Worker Decisions`

Use Worker syncs later when they can target the data-source shape we need. For v0, the Worker uses the Notion client from the Worker execution context or local `NOTION_API_TOKEN` through a replaceable repository adapter. Scheduling and import logic must not call the Notion API directly.

## Checkpoint 0: Gather Prerequisites

Purpose: collect what we need before writing the Worker.

- [ ] Confirm Notion workspace has Workers enabled.
- [ ] Confirm Notion Custom Agent access.
- [ ] Install/verify Notion CLI with `ntn`.
- [ ] Confirm Node.js 22+ and npm 10+.
- [ ] Confirm local execution with `ntn workers exec --local`.
- [ ] Confirm the existing data source names and IDs:
  - [ ] `Daily Summary`
  - [ ] `Workouts`
  - [ ] `Metric Catalog`
  - [ ] `Worker Decisions`
- [x] Add `Import Key` rich-text property to `Worker Decisions`.
- [x] Add `Related Day` relation to `Worker Decisions`.
- [x] Add `Related Day` and `Related Plan` relations to `Workouts`.
- [x] Use existing `Date` as the stable upsert key for `Daily Summary`.
- [x] Use existing `HK Workout UUID` as the stable upsert key for `Workouts`.
- [x] Use existing `HealthKit Identifier` as the stable upsert key for `Metric Catalog`.
- [ ] Create `.env.local` with:
  - [ ] `NOTION_API_TOKEN`
  - [ ] `DAILY_SUMMARY_DATA_SOURCE_ID`
  - [ ] `WORKOUTS_DATA_SOURCE_ID`
  - [ ] `METRIC_CATALOG_DATA_SOURCE_ID`
  - [ ] `WORKER_DECISIONS_DATA_SOURCE_ID`
  - [x] `HEALTH_SYNC_RUNS_DATA_SOURCE_ID`
  - [ ] `DEFAULT_TIMEZONE=America/Los_Angeles`
- [ ] If using an internal integration token, share the original data sources with the integration.
- [ ] Confirm Notion Calendar is available to the agent for calendar context.
- [x] Confirm initial Apple Watch/Mac health export shape for the JSON fixture.
- [ ] Confirm whether Luma and Notion Mail are v1 context sources or later.
- [ ] Define initial coaching defaults:
  - [ ] Skill level.
  - [ ] Preferred modalities.
  - [ ] Equipment/location assumptions.
  - [ ] Workout duration target.
  - [ ] Safety constraints.
- [x] Decide whether `Health Sync Runs` is needed now or whether console logs are enough for v0.

Exit criteria:

- [ ] CLI, auth, data source IDs, and fixture requirements are ready.
- [x] `Worker Decisions` has the required `Import Key`, or a different stable key is chosen.
- [x] V0 can be built without real Apple Health sync.

## Checkpoint 1: Scaffold Worker Project

- [x] Add `importHealthFixture` to the existing Worker project.
- [x] Avoid extra dependencies for current v0 slice; use Node `fetch` and Notion CLI `--dotenv`.
- [ ] Add `@notionhq/client`, `zod`, `dotenv`, or `p-limit` only when a later implementation needs them.
- [ ] Add TypeScript config and package scripts.
- [ ] Add project structure:
  - [ ] `data/apple-health.fixture.json`
  - [x] `src/index.ts`
  - [x] `src/health/config.ts`
  - [ ] `src/health/schema.ts`
  - [x] `src/health/importHealthFixture.ts`
  - [ ] `src/health/domain/healthDecisionEngine.ts`
  - [ ] `src/health/repositories/HealthDataRepository.ts`
  - [ ] `src/health/repositories/InMemoryHealthDataRepository.ts`
  - [ ] `src/health/notion/client.ts`
  - [x] `src/health/notion/NotionHealthDataRepository.ts`
  - [ ] `src/health/notion/propertyBuilders.ts`
  - [ ] `src/health/notion/queryByKey.ts`
  - [ ] `src/health/notion/upsertPage.ts`
  - [ ] `src/health/notion/dailySummaryMapper.ts`
  - [ ] `src/health/notion/workoutMapper.ts`
  - [x] `Metric Catalog` mapper inside `src/health/notion/NotionHealthDataRepository.ts`
  - [ ] `src/health/notion/workerDecisionMapper.ts`
  - [x] `src/worker/registerHealthImportTool.ts`
- [x] Add `.env.example` without secrets.
- [x] Add focused health import normalizer tests.

Exit criteria:

- [x] Worker project loads locally.
- [x] `importHealthFixture` dry run runs with `ntn workers exec --local`.

## Checkpoint 2: Fixture Contract And Validation

- [x] Define `health-fixture.v1` normalized output in `src/health/importHealthFixture.ts`.
- [x] Validate top-level source export fields: `source`, `exported_at`, `window`, `metrics`, `workouts`.
- [ ] Validate arrays:
  - [x] `metricCatalog`
  - [x] `dailySummaries`
  - [x] `workerDecisions`
  - [x] `workouts`
- [x] Require stable `importKey` values for every normalized dry-run record.
- [ ] Validate dates, ISO timestamps, local dates, finite numbers, booleans, select values, status values, and multi-select string arrays.
- [ ] Validate relation keys before any write:
  - [ ] `workerDecisions.relatedDayImportKey`
  - [ ] `workouts.relatedDayImportKey`
  - [ ] `workouts.relatedPlanImportKey`
- [ ] Add a bad fixture test for missing relation keys.

Exit criteria:

- [ ] Dry-run validation catches malformed records before writes.
- [ ] Errors identify the bad collection, record key, and field.

## Checkpoint 3: Data Source Property Mappers

- [x] Implement `Metric Catalog` mapper.
- [x] Implement `Daily Summary` mapper.
- [x] Implement `Worker Decisions` mapper.
- [x] Implement `Workouts` mapper.
- [x] Use `HealthKit Identifier` as the Metric Catalog dedupe field.
- [x] Normalize `Metric Catalog` select and multi-select values.
- [x] Keep rich-text payloads under Notion limits.
- [x] Use relation page IDs, not relation import keys, in the final Notion payload.

Exit criteria:

- [x] Mapper output conforms to the current Notion data source schemas.
- [x] Relations are resolved after parent records are known.

## Checkpoint 4: Idempotent Upsert Layer

- [ ] Define the full `HealthDataRepository` interface.
- [ ] Implement `InMemoryHealthDataRepository` for tests and dry runs.
- [x] Implement first `NotionHealthDataRepository` slice for `Metric Catalog`.
- [x] Implement `Metric Catalog` lookup by `HealthKit Identifier`.
- [x] Implement `Daily Summary` lookup by `Date`.
- [x] Implement `Workouts` lookup by `HK Workout UUID`.
- [x] Implement `Worker Decisions` lookup by `Import Key`.
- [x] Implement page create/update helpers for `Metric Catalog`.
- [x] If a matching `Metric Catalog` row exists, update it.
- [x] If no matching `Metric Catalog` row exists, create it.
- [x] Return structured row results: `created`, `updated`, or `failed`.
- [x] Throttle Notion writes to stay under request limits.
- [x] Retry 429 responses using `Retry-After`.
- [ ] Make dry-run mode produce planned creates/updates without writing.

Exit criteria:

- [ ] Domain code depends on `HealthDataRepository`, not Notion API types.
- [x] Running the same fixture twice does not create duplicates.
- [x] Import summaries report counts by collection.

## Checkpoint 5: `importHealthFixture` Worker Tool

- [x] Register `importHealthFixture` through `src/worker/registerHealthImportTool.ts`.
- [x] Tool input:
  - [x] `path`
  - [x] `dryRun`
  - [x] nullable `only`
- [x] Import order:
  - [x] `Metric Catalog`
  - [x] `Daily Summary`
  - [x] `Worker Decisions`
  - [x] `Workouts`
- [x] Build page ID maps:
  - [x] `dailyImportKey -> pageId`
  - [x] `decisionImportKey -> pageId`
- [x] Add local dry-run command documentation.
- [x] Add local Metric Catalog write command documentation.
- [x] Import real Daily Summary and Workouts rows from `/Users/luish.ball/Downloads/20260516-134720-748.json`.
- [x] Import real generated Worker Decisions rows from `/Users/luish.ball/Downloads/20260516-134720-748.json`.

Exit criteria:

- [x] Dry run validates fixture and reports planned changes.
- [x] First write creates rows in all four data sources.
- [x] Second write updates existing rows instead of creating duplicates.
- [x] Partial import with `only` touches only selected collections.

## Checkpoint 6: Scheduling Decision Logic

- [x] Read today's `Daily Summary`.
- [x] If `Completed Workout?` is true, do nothing.
- [ ] If `Generated Calendar Event?` is true, do nothing unless rescheduling is needed.
- [x] Read recent `Workouts` for the last 7-21 days.
- [x] Compute:
  - [x] days since last workout
  - [x] recent exercise minutes
  - [x] recent muscle groups trained
  - [x] sleep/recovery score
  - [x] today's activity level
  - [x] slacking score
- [x] Pick workout modality and intensity.
- [x] Apply rotation rules so we do not overwork the same muscle group.
- [x] Write a `Worker Decisions` row for every create/skip/reschedule/rest decision.

Exit criteria:

- [x] The worker can explain why it scheduled or skipped a workout.
- [x] Decisions are deterministic for the same input snapshot.

## Checkpoint 7: Custom Agent Tools

- [ ] Implement or stub agent-callable Worker tools:
  - [ ] `find_free_time`
  - [ ] `create_calendar_event`
  - [ ] `summarize_week`
  - [ ] `detect_conflicts`
  - [ ] `sync_external_calendar`
  - [x] `importHealthFixture`
  - [x] `importHealthSyncRun`
  - [x] `recommendWorkoutToday`
  - [x] `planWorkoutFromHealthSyncRun`
- [ ] Mark read-only tools with `readOnlyHint`.
- [ ] Return structured output from every tool.
- [ ] Add agent instructions for:
  - [ ] fitness level and preference matching
  - [ ] muscle rotation
  - [ ] calendar-event creation threshold
  - [ ] safety boundaries
  - [ ] beautiful place suggestions for outdoor exercise

Exit criteria:

- [ ] Custom Agent can ask the Worker why a workout was recommended.
- [x] Custom Agent can trigger or preview scheduling intent through Worker tools.

## Checkpoint 8: Webhooks And Real Ingestion

- [x] Add Notion-backed mobile upload handoff through `Health Sync Runs`.
- [ ] Add hosted `receiveHealthPayload` Worker webhook if direct Worker ingestion becomes preferable.
- [ ] Treat webhook URL as secret.
- [ ] Add payload signature verification if the exporter supports it.
- [ ] Trigger scheduling when new healthcare data arrives.
- [ ] Trigger scheduling when a new calendar event affects a day without a workout.
- [ ] Add idempotency keys for webhook deliveries.

Exit criteria:

- [x] Real health payloads can replace local file input through `importHealthSyncRun`.
- [ ] Webhook retries do not duplicate decisions or workouts.

## Checkpoint 9: Production Path

- [ ] Phase A: local JSON importer with `ntn workers exec --local`.
- [x] Phase B: hosted Worker tool that imports a Notion-backed mobile upload sync run.
- [ ] Phase C: webhook ingestion from the Mac-side exporter.
- [ ] Phase D: future Worker syncs when the platform supports the needed existing-data-source path.
- [x] Add `Health Sync Runs` for mobile upload handoff and import audit.
- [ ] Add `Health Samples`, `Health Hourly Buckets`, and `Sleep Sessions` only when real sync/debuggability requires them.

Exit criteria:

- [ ] V0 remains deterministic and debuggable.
- [ ] Later sync/webhook phases do not require changing the four MVP data-source schemas.

## Acceptance Criteria

- [ ] Full fixture imports into all four MVP data sources.
- [ ] Re-running the fixture creates no duplicate rows.
- [ ] Dry-run mode works.
- [ ] `Related Day` and `Related Plan` relations populate correctly.
- [ ] Import summary reports created/updated/skipped/failed counts.
- [ ] Rate limits and retries are handled.
- [ ] Invalid JSON and missing relation keys fail clearly before writes.
- [ ] Worker decisions remain auditable.
- [ ] The scheduling worker can create a workout event when there is a reasonable 30-minute slot for exercise, shower/change, and snack buffer.

## Open Decisions

| Decision | Status | Notes |
| --- | --- | --- |
| Exact data source names | Open | Plan uses `Daily Summary`, `Workouts`, `Metric Catalog`, `Worker Decisions`; confirm whether UI names include `Health` prefixes. |
| Missing select options | Open | Decide whether importer creates options or requires predefined schemas. |
| `Health Sync Runs` in v0 | Decided | Use `Health Sync Runs` as the durable Notion-backed handoff for mobile uploads. |
| Mobile exporter transport | Decided | Mobile app posts JSON to `/api/ingest` in production or `server.js` locally; the endpoint stores ordered payload chunks on a `Health Sync Runs` row; Worker imports with `importHealthSyncRun`. |
| Luma source | Open | Treat as optional context after health/calendar MVP. |
| Notion Mail source | Open | Treat as optional context after health/calendar MVP. |
