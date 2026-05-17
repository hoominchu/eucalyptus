# Eucalyptus Docs

This is one generated plan for the Eucalyptus life coach project: a workout planner powered by Notion Workers.

- [Life coach workout agent plan](life-coach-workout-agent-plan.md): Worker/tool architecture, local fixture importer, upsert behavior, validation, test plan, and production path.
- [Health worker data sources](health-worker-data-sources.md): the four MVP Notion data sources plus later health sync/debug tables.

Rule: keep this plan scoped to the workout planner. V0 uses a Notion Worker tool to import Apple Health-shaped data into the existing `Daily Summary`, `Workouts`, `Metric Catalog`, and `Worker Decisions` data sources. Worker syncs and webhooks come after the deterministic local importer works.

The deployed Worker is named `eucalyptus`. Connect that Worker in Notion when adding these tools to a Custom Agent.

## Current Local Dry Run

The repo now exposes a local Worker tool that parses the current Apple Health export shape and normalizes it into decision-ready records without writing to Notion:

```bash
ntn workers exec importHealthFixture \
  --local \
  -d '{"path":"/Users/luish.ball/Downloads/20260516-134720-748.json","dryRun":true,"only":null}'
```

Current dry-run coverage:

- `Metric Catalog`
- `Daily Summary`
- generated `Worker Decisions`
- `Workouts`

Current write coverage:

- `Metric Catalog`, deduped by the existing `HealthKit Identifier` property
- `Daily Summary`, deduped by the existing `Date` property
- `Worker Decisions`, deduped by the `Import Key` property
- `Workouts`, deduped by the existing `HK Workout UUID` property

Create `.env.local` with at least:

```bash
NOTION_API_TOKEN=secret_...
WORKER_NOTION_API_TOKEN=secret_... # hosted Worker env alias
DAILY_SUMMARY_DATA_SOURCE_ID=...
WORKOUTS_DATA_SOURCE_ID=...
METRIC_CATALOG_DATA_SOURCE_ID=...
WORKER_DECISIONS_DATA_SOURCE_ID=...
HEALTH_SYNC_RUNS_DATA_SOURCE_ID=...
NOTION_VERSION=2026-03-11
```

Then run the full idempotent local import:

```bash
ntn workers exec importHealthFixture \
  --local \
  --dotenv .env.local \
  -d '{"path":"/Users/luish.ball/Downloads/20260516-134720-748.json","dryRun":false,"only":["metricCatalog","dailySummaries","workerDecisions","workouts"]}'
```

Then preview or write the current workout recommendation:

```bash
ntn workers exec recommendWorkoutToday \
  --local \
  --dotenv .env.local \
  -d '{"path":"/Users/luish.ball/Downloads/20260516-134720-748.json","targetDate":null,"dryRun":true}'
```

Set `dryRun:false` to upsert the recommendation into `Worker Decisions`.

## Mobile Upload Sync Runs

The mobile app can POST Apple Health JSON to the deployed `/api/ingest` endpoint or to `server.js` during local testing. When `NOTION_API_TOKEN` and `HEALTH_SYNC_RUNS_DATA_SOURCE_ID` are set, the endpoint stores the payload in a `Health Sync Runs` row as ordered Notion page chunks. That gives the Worker a durable Notion-backed handoff for uploads that arrive on a random cadence.

Run the ingest server locally:

```bash
node --env-file=.env.local server.js
```

The production endpoint shape is:

```text
https://eucalyptus-gamma.vercel.app/api/ingest
```

Then import the latest uploaded sync run:

```bash
ntn workers exec importHealthSyncRun \
  --local \
  --dotenv .env.local \
  -d '{"pageId":null,"dryRun":false,"only":["metricCatalog","dailySummaries","workerDecisions","workouts"]}'
```

The hosted `eucalyptus` Worker currently exposes this same `importHealthSyncRun` tool after deployment.

To import the latest upload and return a calendar scheduling intent for the Notion Custom Agent:

```bash
ntn workers exec planWorkoutFromHealthSyncRun \
  --local \
  --dotenv .env.local \
  -d '{"pageId":null,"targetDate":null,"dryRun":false}'
```

If the Custom Agent omits input, the tool defaults to latest health upload, latest date, and `dryRun:true`.
It can also pass partial input such as `{"dryRun":true}` and omitted fields will use the same defaults.

The Worker does not write calendar events directly. It returns `schedulingIntent` with `shouldSchedule`, title, duration, reason, and idempotency key. The Notion Custom Agent should use its Calendar connection to create the event only when `shouldSchedule` is true.

The live Notion schema needs `Worker Decisions.Import Key`, `Worker Decisions.Related Day`, `Workouts.Related Day`, and `Workouts.Related Plan`; the current workspace has those properties.
