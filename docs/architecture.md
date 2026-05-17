# Architecture

## Health Sync To Calendar Flow

```mermaid
flowchart TD
  A["Phone App<br/>Apple Health export"] -->|"POST JSON + ingest token"| B["Vercel API<br/>/api/ingest"]

  B -->|"auth check"| B1["Validate token"]
  B1 -->|"store payload chunks"| C["Notion DB<br/>Health Sync Runs"]
  C -->|"new page created"| D["Notion Agent Trigger"]

  D -->|"pageId or page URL"| E["Eucalyptus Worker Tool<br/>planWorkoutFromHealthSyncRun"]

  E --> E1["Normalize pageId"]
  E1 --> E2["Read Health Sync Run payload"]
  E2 --> E3["Import health records<br/>Daily Summary, Metrics,<br/>Workouts, Decisions"]
  E3 --> E4["Recommend workout"]
  E4 --> E5["Return schedulingIntent<br/>title, duration, reason,<br/>muscle groups, idempotency key"]

  E5 --> D

  D -->|"read availability"| F["Notion Calendar"]
  F -->|"open slot / conflicts"| D

  D -->|"create event if allowed"| G["Calendar Event"]
  G --> G1["Zesty title<br/>Quick Full-Body Burn"]
  G --> G2["Notes<br/>workout plan, reason,<br/>details, idempotency key"]

  D -->|"fallback if no calendar write"| H["Health Sync Runs update/comment<br/>suggested event details"]
```

The phone app uploads Apple Health-shaped JSON to Vercel. Vercel stores the payload in Notion as a `Health Sync Runs` row, which triggers the Notion agent. The agent calls the Eucalyptus Worker to normalize the upload, write health planning records, and return a scheduling intent. The agent then uses calendar access to create or suggest the workout event.
