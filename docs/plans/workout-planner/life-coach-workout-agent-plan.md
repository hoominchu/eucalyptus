# Life Coach Workout Agent Plan

## Tools

Tools that we can use:

**Workers**: run custom code in Notion's hosted runtime. Use this for deterministic calendar and coaching logic: checking availability, creating workout events, syncing health payloads, reminders, and routing requests.

What our worker will do: if there is a reasonable 30-minute slot in the day for exercise plus shower/change/snack buffer, it will add a calendar event. The workout should match skill level, preferences, recovery, and rotation rules so we do not overwork the same muscle group or movement pattern.

Triggers:

- Healthcare data trigger: if health data shows we have been slacking, create or propose a workout event.
- Calendar event trigger: if a new event appears on a day without a workout, find a remaining slot for exercise.

**Database sync**: sync external data into Notion databases/data sources.

- V0 does not use Worker sync because the current Worker sync model creates and manages its own databases.
- We will sync Apple Health data from Apple Watch/Mac into Notion through the Worker path.
- We do not need to sync Calendar in v0 because Notion Calendar is available to the Notion agent.

**Custom agent tools via Workers**: expose actions the Notion Custom Agent can call:

```text
find_free_time()
create_calendar_event()
reschedule_meeting()
summarize_week()
detect_conflicts()
sync_external_calendar()
importHealthFixture()
```

**Webhooks**: trigger workflows when health or calendar data changes.

- Trigger the Worker when new healthcare data arrives.
- Trigger the Worker when a new event is added to a day without a workout.
- The Worker handles finding time and creating or proposing the exercise event.

## Workers

### Goal

Build a local Notion Worker project that reads a local Apple Health-shaped JSON fixture and writes it into the existing Notion data sources we already created:

- `Daily Summary`
- `Workouts`
- `Metric Catalog`
- `Worker Decisions`

This gives us a local, deterministic prototype before wiring in real Apple Health sync from the Watch/Mac.

### Important Platform Decision

Use a Worker tool run locally through the Notion CLI, not a Worker `sync` capability, for v0.

Reason: Notion Worker syncs pull external data into Notion-managed databases, and the current docs say syncs create and manage their own databases, with support for syncing to existing databases coming later. Since we already created the health data sources, v0 should use the Notion client available to the Worker and upsert rows into those existing data sources.

Workers remain the right foundation: they are TypeScript projects that can register syncs, agent tools, and webhooks. The same code can later become hosted tools, webhook receivers, or managed syncs when the platform supports the target shape.

## 1. Architecture

```text
Local Apple Health-shaped JSON file
   -> Worker tool: importHealthFixture
   -> JSON validation and normalization
   -> Health decision/import domain logic
   -> HealthDataRepository interface
      -> InMemoryHealthDataRepository for tests and dry runs
      -> NotionHealthDataRepository for current v0 persistence
         -> Notion property mappers
         -> Idempotent upsert layer
         -> Existing Notion data sources:
            - Metric Catalog
            - Daily Summary
            - Worker Decisions
            - Workouts
```

The importer must be safe to run repeatedly. A second run with the same JSON updates existing rows instead of creating duplicates.

The important boundary is that scheduling, slacking-score, rotation, validation, and fixture-normalization code never imports `@notionhq/client` or Notion page/property types. Only `NotionHealthDataRepository` knows about Notion API details.

## 2. Project Setup

Create a local Worker project:

```bash
curl -fsSL https://ntn.dev | bash
ntn login
ntn workers new health-data-worker
cd health-data-worker
```

Install helper dependencies:

```bash
npm install @notionhq/client zod dotenv p-limit
```

Suggested structure:

```text
health-data-worker/
  data/
    apple-health.fixture.json
  src/
    index.ts
    config.ts
    schema.ts
    importHealthFixture.ts
    domain/
      healthDecisionEngine.ts
    repositories/
      HealthDataRepository.ts
      InMemoryHealthDataRepository.ts
    notion/
      client.ts
      NotionHealthDataRepository.ts
      propertyBuilders.ts
      upsertPage.ts
      queryByKey.ts
    mappers/
      dailySummary.ts
      workout.ts
      metricCatalog.ts
      workerDecision.ts
```

## 3. Auth And Environment Config

Create `.env.local`:

```bash
NOTION_API_TOKEN=ntn_...

DAILY_SUMMARY_DATA_SOURCE_ID=...
WORKOUTS_DATA_SOURCE_ID=...
METRIC_CATALOG_DATA_SOURCE_ID=...
WORKER_DECISIONS_DATA_SOURCE_ID=...

DEFAULT_TIMEZONE=America/Los_Angeles
```

Setup steps:

1. Create a personal access token or internal integration token.
2. If using an internal integration, share the original data sources with the integration.
3. Copy each data source ID into `.env.local`.
4. Do not use linked data sources for the import path; use the original source data sources.

## 4. Minimal Schema Adjustment

Add one property to each of the four data sources:

| Data source | New property | Type | Purpose |
| --- | --- | --- | --- |
| `Daily Summary` | `Import Key` | Rich text | Stable upsert key, e.g. `daily:2026-05-16` |
| `Workouts` | `Import Key` | Rich text | Stable upsert key, e.g. `workout:{hk_uuid}` |
| `Metric Catalog` | `Import Key` | Rich text | Stable upsert key, e.g. `metric:stepCount` |
| `Worker Decisions` | `Import Key` | Rich text | Stable upsert key, e.g. `decision:{id}` |

This keeps imports idempotent and avoids one-off lookup logic per table.

## 5. JSON Fixture Contract

Use one local JSON file with all required datasets and stable IDs:

```json
{
  "schemaVersion": "health-fixture.v1",
  "generatedAt": "2026-05-16T18:00:00Z",
  "timezone": "America/Los_Angeles",
  "metricCatalog": [
    {
      "importKey": "metric:stepCount",
      "metric": "Steps",
      "healthKitIdentifier": "stepCount",
      "sampleKind": "quantity",
      "defaultUnit": "count",
      "aggregationStyle": "sum",
      "importLevel": "daily_only",
      "workerRelevance": ["slacking", "training_load"],
      "enabled": true,
      "privacySensitivity": "low"
    }
  ],
  "dailySummaries": [
    {
      "importKey": "daily:2026-05-16",
      "name": "2026-05-16",
      "date": "2026-05-16",
      "timezone": "America/Los_Angeles",
      "steps": 4200,
      "activeEnergyKcal": 310,
      "exerciseMinutes": 8,
      "completedWorkout": false,
      "workoutCount": 0,
      "workoutTypes": [],
      "muscleGroupsTrained": [],
      "trainingLoad": 12,
      "sleepMinutes": 395,
      "restingHr": 61,
      "hrvSdnn": 48,
      "recoveryScore": 72,
      "readiness": "medium",
      "slackingScore": 64,
      "needsWorkout": true,
      "recommendedIntensity": "moderate",
      "recommendedModality": "strength",
      "recommendationReason": "No workout in 3 days and exercise minutes are low."
    }
  ],
  "workerDecisions": [
    {
      "importKey": "decision:2026-05-16-health-check",
      "name": "Workout decision - 2026-05-16",
      "triggeredBy": "health_data",
      "triggerTimestamp": "2026-05-16T18:00:00Z",
      "relatedDayImportKey": "daily:2026-05-16",
      "decision": "create_workout",
      "suggestedModality": "strength",
      "suggestedIntensity": "moderate",
      "suggestedMuscleGroups": ["push", "core"],
      "avoidMuscleGroups": ["legs"],
      "reason": "No workout in 3 days, low exercise minutes today, legs trained recently.",
      "status": "proposed",
      "confidence": 0.82
    }
  ],
  "workouts": [
    {
      "importKey": "workout:demo-001",
      "name": "Strength - Push/Core",
      "source": "worker_generated",
      "status": "planned",
      "calendarEventId": "demo-calendar-event-001",
      "start": "2026-05-16T23:00:00Z",
      "end": "2026-05-16T23:30:00Z",
      "localDate": "2026-05-16",
      "durationMinutes": 30,
      "workoutActivityType": "functional strength",
      "modality": "strength",
      "muscleGroups": ["push", "core"],
      "movementPattern": ["push", "rotation"],
      "intensity": "moderate",
      "locationType": "home",
      "relatedDayImportKey": "daily:2026-05-16",
      "relatedPlanImportKey": "decision:2026-05-16-health-check"
    }
  ]
}
```

## 6. Worker Tool Interface

Register a local tool in `src/index.ts`:

```ts
import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { importHealthFixture } from "./importHealthFixture";

const worker = new Worker();
export default worker;

worker.tool("importHealthFixture", {
  title: "Import Health Fixture",
  description: "Imports a local Apple Health JSON fixture into existing Notion health data sources.",
  schema: j.object({
    path: j.string().describe("Path to the local JSON fixture."),
    dryRun: j.boolean().describe("Validate and preview changes without writing."),
    only: j.array(j.string()).optional().describe("Optional subset: metricCatalog, dailySummaries, workerDecisions, workouts.")
  }),
  execute: async (input, context) => {
    return await importHealthFixture(input, context);
  }
});
```

Run it locally:

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"./data/apple-health.fixture.json","dryRun":true}'
```

Then write for real:

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"./data/apple-health.fixture.json","dryRun":false}'
```

## 7. Import Order

Import in this order so relations can be populated cleanly:

1. `Metric Catalog`: independent lookup table; upsert by `Import Key`.
2. `Daily Summary`: one row per local day; upsert by `Import Key`; save `dailyImportKey -> Notion page ID`.
3. `Worker Decisions`: depends on `Daily Summary`; link `Related Day`; save `decisionImportKey -> Notion page ID`.
4. `Workouts`: depends on `Daily Summary` and optionally `Worker Decisions`; link `Related Day` and `Related Plan`.

## 8. Upsert Behavior

The current Notion API path should be behind this port:

```ts
export interface HealthDataRepository {
  upsertMetricCatalog(records: MetricCatalogRecord[], options: WriteOptions): Promise<CollectionWriteResult>;
  upsertDailySummaries(records: DailySummaryRecord[], options: WriteOptions): Promise<CollectionWriteResult>;
  upsertWorkerDecisions(records: WorkerDecisionRecord[], options: WriteOptions): Promise<CollectionWriteResult>;
  upsertWorkouts(records: WorkoutRecord[], options: WriteOptions): Promise<CollectionWriteResult>;
  getDailySummaries(range: DateRange): Promise<DailySummaryRecord[]>;
  getRecentWorkouts(input: RecentWorkoutsQuery): Promise<WorkoutRecord[]>;
  getRecentDecisions(input: RecentDecisionsQuery): Promise<WorkerDecisionRecord[]>;
}
```

Implementations:

- `InMemoryHealthDataRepository`: used for unit tests, dry-run previews, and decision-engine tests.
- `NotionHealthDataRepository`: current v0 adapter that maps records to Notion properties and performs data-source queries, page creates, and page updates.
- Future repository: Worker sync/datastore-backed implementation when the platform supports the storage path we want.

Business logic should receive a `HealthDataRepository` instance:

```ts
export async function importHealthFixture(
  input: ImportHealthFixtureInput,
  repository: HealthDataRepository
) {
  const fixture = validateFixture(input.path);
  const normalized = normalizeHealthFixture(fixture);

  return importInOrder(normalized, repository, {
    dryRun: input.dryRun,
    only: input.only
  });
}
```

The Notion adapter handles the actual upsert mechanics.

For each record:

1. Build the Notion property payload.
2. Query the target data source for a row with matching `Import Key`.
3. If found, call `pages.update`.
4. If not found, call `pages.create` with the target `data_source_id` as the parent.
5. Return a structured result: `created`, `updated`, `skipped`, or `failed`.

Recommended result:

```json
{
  "dryRun": false,
  "summary": {
    "metricCatalog": { "created": 1, "updated": 0, "failed": 0 },
    "dailySummaries": { "created": 1, "updated": 0, "failed": 0 },
    "workerDecisions": { "created": 1, "updated": 0, "failed": 0 },
    "workouts": { "created": 1, "updated": 0, "failed": 0 }
  },
  "errors": []
}
```

## 9. Property Mapping Rules

### Daily Summary Mapper

```text
importKey -> Import Key:rich_text
name -> Name:title
date -> Date:date
timezone -> Timezone:select or rich_text
steps -> Steps:number
activeEnergyKcal -> Active Energy kcal:number
exerciseMinutes -> Exercise Minutes:number
completedWorkout -> Completed Workout?:checkbox
workoutCount -> Workout Count:number
workoutTypes -> Workout Types:multi_select
muscleGroupsTrained -> Muscle Groups Trained:multi_select
trainingLoad -> Training Load:number
sleepMinutes -> Sleep Minutes:number
restingHr -> Resting HR:number
hrvSdnn -> HRV SDNN:number
recoveryScore -> Recovery Score:number
readiness -> Readiness:select
slackingScore -> Slacking Score:number
needsWorkout -> Needs Workout?:checkbox
recommendedIntensity -> Recommended Intensity:select
recommendedModality -> Recommended Modality:select
recommendationReason -> Recommendation Reason:rich_text
generatedCalendarEvent -> Generated Calendar Event?:checkbox
calendarEventId -> Calendar Event ID:rich_text
lastHealthSyncAt -> Last Health Sync At:date
dataCompleteness -> Data Completeness:select
```

### Workouts Mapper

```text
importKey -> Import Key:rich_text
name -> Name:title
source -> Source:select
status -> Status:status
hkWorkoutUuid -> HK Workout UUID:rich_text
calendarEventId -> Calendar Event ID:rich_text
start -> Start:date
end -> End:date
localDate -> Local Date:date
durationMinutes -> Duration Minutes:number
workoutActivityType -> Workout Activity Type:select
modality -> Modality:select
muscleGroups -> Muscle Groups:multi_select
movementPattern -> Movement Pattern:multi_select
intensity -> Intensity:select
activeEnergyKcal -> Active Energy kcal:number
distance -> Distance:number
avgHr -> Avg HR:number
maxHr -> Max HR:number
locationType -> Location Type:select
relatedDayImportKey -> Related Day:relation
relatedPlanImportKey -> Related Plan:relation
```

### Metric Catalog Mapper

```text
importKey -> Import Key:rich_text
metric -> Metric:title
healthKitIdentifier -> HealthKit Identifier:rich_text
sampleKind -> Sample Kind:select
defaultUnit -> Default Unit:select
aggregationStyle -> Aggregation Style:select
importLevel -> Import Level:select
workerRelevance -> Worker Relevance:multi_select
permissionRequired -> Permission Required:checkbox
enabled -> Enabled?:checkbox
privacySensitivity -> Privacy Sensitivity:select
```

### Worker Decisions Mapper

```text
importKey -> Import Key:rich_text
name -> Name:title
triggeredBy -> Triggered By:select
triggerTimestamp -> Trigger Timestamp:date
relatedDayImportKey -> Related Day:relation
decision -> Decision:select
suggestedModality -> Suggested Modality:select
suggestedIntensity -> Suggested Intensity:select
suggestedMuscleGroups -> Suggested Muscle Groups:multi_select
avoidMuscleGroups -> Avoid Muscle Groups:multi_select
reason -> Reason:rich_text
inputSnapshotJson -> Input Snapshot JSON:rich_text
createdCalendarEventId -> Created Calendar Event ID:rich_text
status -> Status:status
confidence -> Confidence:number
```

## 10. Validation Rules

Before writing anything:

- Every record has an `importKey`.
- Every relation key points to a record in the same fixture or an existing Notion row.
- Dates are valid ISO strings or local dates.
- Select/status values are allowed by the current data source.
- Multi-select arrays are arrays of strings.
- Numeric values are finite numbers.
- Rich text payloads are below Notion limits.
- Writes are throttled and 429 responses respect `Retry-After`.

## 11. Local Test Plan

### Test 1: Dry Run

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"./data/apple-health.fixture.json","dryRun":true}'
```

Expected: JSON validates, planned creates/updates are reported, and no Notion rows change.

### Test 2: First Write

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"./data/apple-health.fixture.json","dryRun":false}'
```

Expected: rows are created in all four data sources and relations are populated.

### Test 3: Idempotency

Run the same write command again.

Expected: no duplicate rows; summary reports mostly `updated`, not `created`.

### Test 4: Partial Import

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"./data/apple-health.fixture.json","dryRun":false,"only":["dailySummaries"]}'
```

Expected: only `Daily Summary` rows are touched.

### Test 5: Bad Fixture

Use a broken fixture with a missing relation key.

Expected: import fails before writing, or writes nothing in dry-run mode; the error identifies the missing key.

## 12. Production Path After Local Prototype

### Phase A: Local JSON Importer

Use local JSON and `ntn workers exec --local`.

### Phase B: Hosted Worker Tool

Deploy the worker:

```bash
ntn workers deploy
```

The hosted tool should not depend on a laptop-local file path. Its input should include a JSON payload, a URL to a JSON file, or an external object-store key.

### Phase C: Webhook Ingestion

Add a Worker webhook called `receiveHealthPayload`. A Mac-side exporter can post health JSON to the Worker webhook.

### Phase D: Future Managed Sync

When Notion supports the existing-data-source path we need, add a new repository implementation or migrate the direct upsert implementation into one or more Worker sync capabilities. The domain logic should not need to change.

## 13. Acceptance Criteria

The local worker is done when:

- It can import the full fixture into all four data sources.
- It can be run repeatedly without creating duplicates.
- It can do a dry run.
- It populates `Related Day` and `Related Plan` relations correctly.
- It reports created/updated/skipped/failed counts.
- It handles rate limits and retries.
- It fails clearly on invalid JSON or missing relation keys.
- It keeps Notion writes deterministic and auditable.

## 14. Open Decisions

1. Add `Import Key` to all four data sources now, or rely on existing per-table keys?
2. Should the importer create missing select/multi-select options, or should we predefine all options in Notion?
3. Should we create a `Health Sync Runs` data source now for import logs, or keep logs in console until real sync exists?
4. For production, should the Mac exporter send JSON via webhook, URL, or object-store key?
5. Should Luma and Notion Mail be context sources in v1 or later?

## References Checked

- [Notion Workers overview](https://developers.notion.com/workers/get-started/overview)
- [Notion Workers quickstart](https://developers.notion.com/workers/get-started/quickstart)
- [Notion Workers syncs](https://developers.notion.com/workers/guides/syncs)
- [Notion Worker agent tools](https://developers.notion.com/workers/guides/tools)
- [Using the Notion API from a Worker](https://developers.notion.com/workers/guides/api-client)
- [Notion Worker webhooks](https://developers.notion.com/workers/guides/webhooks)
- [Notion data source object](https://developers.notion.com/reference/data-source)
- [Query a data source](https://developers.notion.com/reference/query-a-data-source)
- [Notion request limits](https://developers.notion.com/reference/request-limits)
