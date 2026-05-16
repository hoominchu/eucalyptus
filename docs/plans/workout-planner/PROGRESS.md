# Life Coach Workout Agent Progress

## Current Status

- [x] Docs refocused on the life coach workout agent.
- [x] Plan aligned to the health/calendar worker schema.
- [x] V0 platform decision documented: local Worker tool, existing Notion data sources, deterministic fixture import.
- [ ] Worker implementation not started.

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
- [ ] Add `Import Key` rich-text property to each of the four data sources.
- [ ] Create `.env.local` with:
  - [ ] `NOTION_API_TOKEN`
  - [ ] `DAILY_SUMMARY_DATA_SOURCE_ID`
  - [ ] `WORKOUTS_DATA_SOURCE_ID`
  - [ ] `METRIC_CATALOG_DATA_SOURCE_ID`
  - [ ] `WORKER_DECISIONS_DATA_SOURCE_ID`
  - [ ] `DEFAULT_TIMEZONE=America/Los_Angeles`
- [ ] If using an internal integration token, share the original data sources with the integration.
- [ ] Confirm Notion Calendar is available to the agent for calendar context.
- [ ] Confirm initial Apple Watch/Mac health export shape for the JSON fixture.
- [ ] Confirm whether Luma and Notion Mail are v1 context sources or later.
- [ ] Define initial coaching defaults:
  - [ ] Skill level.
  - [ ] Preferred modalities.
  - [ ] Equipment/location assumptions.
  - [ ] Workout duration target.
  - [ ] Safety constraints.
- [ ] Decide whether `Health Sync Runs` is needed now or whether console logs are enough for v0.

Exit criteria:

- [ ] CLI, auth, data source IDs, and fixture requirements are ready.
- [ ] The four MVP data sources have the required `Import Key`.
- [ ] V0 can be built without real Apple Health sync.

## Checkpoint 1: Scaffold Worker Project

- [ ] Create the local Worker project with `ntn workers new health-data-worker`.
- [ ] Add dependencies: `@notionhq/client`, `zod`, `dotenv`, and `p-limit`.
- [ ] Add TypeScript config and package scripts.
- [ ] Add project structure:
  - [ ] `data/apple-health.fixture.json`
  - [ ] `src/index.ts`
  - [ ] `src/config.ts`
  - [ ] `src/schema.ts`
  - [ ] `src/importHealthFixture.ts`
  - [ ] `src/domain/healthDecisionEngine.ts`
  - [ ] `src/repositories/HealthDataRepository.ts`
  - [ ] `src/repositories/InMemoryHealthDataRepository.ts`
  - [ ] `src/notion/client.ts`
  - [ ] `src/notion/NotionHealthDataRepository.ts`
  - [ ] `src/notion/propertyBuilders.ts`
  - [ ] `src/notion/queryByKey.ts`
  - [ ] `src/notion/upsertPage.ts`
  - [ ] `src/mappers/dailySummary.ts`
  - [ ] `src/mappers/workout.ts`
  - [ ] `src/mappers/metricCatalog.ts`
  - [ ] `src/mappers/workerDecision.ts`
- [ ] Add `.env.example` without secrets.
- [ ] Add a Worker module-load smoke test.

Exit criteria:

- [ ] Worker project loads locally.
- [ ] A sample tool runs with `ntn workers exec --local`.

## Checkpoint 2: Fixture Contract And Validation

- [ ] Define `health-fixture.v1` in `src/schema.ts`.
- [ ] Validate top-level fields: `schemaVersion`, `generatedAt`, `timezone`.
- [ ] Validate arrays:
  - [ ] `metricCatalog`
  - [ ] `dailySummaries`
  - [ ] `workerDecisions`
  - [ ] `workouts`
- [ ] Require stable `importKey` values for every record.
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

- [ ] Implement `Metric Catalog` mapper.
- [ ] Implement `Daily Summary` mapper.
- [ ] Implement `Worker Decisions` mapper.
- [ ] Implement `Workouts` mapper.
- [ ] Include `Import Key` in every mapper.
- [ ] Normalize select and multi-select values.
- [ ] Keep rich-text payloads under Notion limits.
- [ ] Use relation page IDs, not relation import keys, in the final Notion payload.

Exit criteria:

- [ ] Mapper output conforms to the current Notion data source schemas.
- [ ] Relations are resolved after parent records are known.

## Checkpoint 4: Idempotent Upsert Layer

- [ ] Define the `HealthDataRepository` interface.
- [ ] Implement `InMemoryHealthDataRepository` for tests and dry runs.
- [ ] Implement `NotionHealthDataRepository` as the only module allowed to call Notion API methods.
- [ ] Implement `queryByKey` against a data source's `Import Key`.
- [ ] Implement `upsertPage`.
- [ ] If a matching row exists, update it.
- [ ] If no matching row exists, create it.
- [ ] Return structured row results: `created`, `updated`, `skipped`, or `failed`.
- [ ] Throttle Notion writes to stay under request limits.
- [ ] Retry 429 responses using `Retry-After`.
- [ ] Make dry-run mode produce planned creates/updates without writing.

Exit criteria:

- [ ] Domain code depends on `HealthDataRepository`, not Notion API types.
- [ ] Running the same fixture twice does not create duplicates.
- [ ] Import summaries report counts by collection.

## Checkpoint 5: `importHealthFixture` Worker Tool

- [ ] Register `importHealthFixture` in `src/index.ts`.
- [ ] Tool input:
  - [ ] `path`
  - [ ] `dryRun`
  - [ ] optional `only`
- [ ] Import order:
  - [ ] `Metric Catalog`
  - [ ] `Daily Summary`
  - [ ] `Worker Decisions`
  - [ ] `Workouts`
- [ ] Build page ID maps:
  - [ ] `dailyImportKey -> pageId`
  - [ ] `decisionImportKey -> pageId`
- [ ] Add local dry-run command documentation.
- [ ] Add local write command documentation.

Exit criteria:

- [ ] Dry run validates fixture and reports planned changes.
- [ ] First write creates rows in all four data sources.
- [ ] Second write updates existing rows instead of creating duplicates.
- [ ] Partial import with `only` touches only selected collections.

## Checkpoint 6: Scheduling Decision Logic

- [ ] Read today's `Daily Summary`.
- [ ] If `Completed Workout?` is true, do nothing.
- [ ] If `Generated Calendar Event?` is true, do nothing unless rescheduling is needed.
- [ ] Read recent `Workouts` for the last 7-21 days.
- [ ] Compute:
  - [ ] days since last workout
  - [ ] recent exercise minutes
  - [ ] recent muscle groups trained
  - [ ] sleep/recovery score
  - [ ] today's activity level
  - [ ] slacking score
- [ ] Pick workout modality and intensity.
- [ ] Apply rotation rules so we do not overwork the same muscle group.
- [ ] Write a `Worker Decisions` row for every create/skip/reschedule/rest decision.

Exit criteria:

- [ ] The worker can explain why it scheduled or skipped a workout.
- [ ] Decisions are deterministic for the same input snapshot.

## Checkpoint 7: Custom Agent Tools

- [ ] Implement or stub agent-callable Worker tools:
  - [ ] `find_free_time`
  - [ ] `create_calendar_event`
  - [ ] `summarize_week`
  - [ ] `detect_conflicts`
  - [ ] `sync_external_calendar`
  - [ ] `importHealthFixture`
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
- [ ] Custom Agent can trigger or preview scheduling logic through Worker tools.

## Checkpoint 8: Webhooks And Real Ingestion

- [ ] Add `receiveHealthPayload` Worker webhook for Mac-side health export.
- [ ] Treat webhook URL as secret.
- [ ] Add payload signature verification if the exporter supports it.
- [ ] Trigger scheduling when new healthcare data arrives.
- [ ] Trigger scheduling when a new calendar event affects a day without a workout.
- [ ] Add idempotency keys for webhook deliveries.

Exit criteria:

- [ ] Real health payloads can replace local file input.
- [ ] Webhook retries do not duplicate decisions or workouts.

## Checkpoint 9: Production Path

- [ ] Phase A: local JSON importer with `ntn workers exec --local`.
- [ ] Phase B: hosted Worker tool that accepts a JSON payload, URL, or object-store key.
- [ ] Phase C: webhook ingestion from the Mac-side exporter.
- [ ] Phase D: future Worker syncs when the platform supports the needed existing-data-source path.
- [ ] Add `Health Samples`, `Health Hourly Buckets`, `Sleep Sessions`, and `Health Sync Runs` only when real sync/debuggability requires them.

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
| `Health Sync Runs` in v0 | Open | Helpful for audit, but console logs may be enough until real sync. |
| Mac exporter transport | Open | Webhook JSON, URL to file, or object-store key. |
| Luma source | Open | Treat as optional context after health/calendar MVP. |
| Notion Mail source | Open | Treat as optional context after health/calendar MVP. |
