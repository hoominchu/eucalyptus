# Eucalyptus Docs

This is one generated plan for the Eucalyptus life coach project: a workout planner powered by Notion Workers.

- [Life coach workout agent plan](life-coach-workout-agent-plan.md): Worker/tool architecture, local fixture importer, upsert behavior, validation, test plan, and production path.
- [Health worker data sources](health-worker-data-sources.md): the four MVP Notion data sources plus later health sync/debug tables.

Rule: keep this plan scoped to the workout planner. V0 uses a Notion Worker tool to import Apple Health-shaped data into the existing `Daily Summary`, `Workouts`, `Metric Catalog`, and `Worker Decisions` data sources. Worker syncs and webhooks come after the deterministic local importer works.
