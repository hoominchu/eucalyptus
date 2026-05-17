# Health Worker Data Sources

## Data Model Principle

Model this as two layers:

1. HealthKit-shaped canonical data for dedupe, provenance, and audit.
2. Worker-shaped aggregate data for fast decisions like "am I slacking?", "what muscle group should I avoid?", and "should today be cardio, strength, mobility, or rest?"

The worker should not dump the full Apple Health firehose into Notion for v0. It should write a decision-ready view that can drive scheduling.

Code should treat these data sources as a persistence adapter, not as the domain model itself. The decision engine should depend on normalized records and a `HealthDataRepository` interface. The current Notion API implementation is just the v0 adapter behind that interface.

## MVP Data Sources

Start with four existing data sources:

1. `Daily Summary`
2. `Workouts`
3. `Metric Catalog`
4. `Worker Decisions`

Use `Health Sync Runs` now for mobile upload handoff and import audit. Add `Health Samples`, `Health Hourly Buckets`, and `Sleep Sessions` later only when real sync needs dedupe/debuggability beyond the aggregate fixture.

## `Daily Summary`

Purpose: one row per local day. This is the scheduling worker's primary read model.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `2026-05-16` |
| `Import Key` | Rich text | `daily:2026-05-16` |
| `Date` | Date | Local date, not UTC-only |
| `Timezone` | Select / text | Example: `America/Los_Angeles` |
| `Steps` | Number | Daily total |
| `Active Energy kcal` | Number | Daily active calories |
| `Exercise Minutes` | Number | Apple exercise minutes or computed equivalent |
| `Stand Minutes / Hours` | Number | Optional |
| `Walking + Running Distance` | Number | Miles or km |
| `Flights Climbed` | Number | Optional |
| `Workout Count` | Number | Completed workouts that day |
| `Completed Workout?` | Checkbox | Fast worker filter |
| `Workout Types` | Multi-select | `strength`, `run`, `walk`, `yoga`, `cycling` |
| `Muscle Groups Trained` | Multi-select | `legs`, `push`, `pull`, `core`, `full body` |
| `Training Load` | Number | Worker-computed score |
| `Last Workout At` | Date | Denormalized from `Workouts` |
| `Sleep Minutes` | Number | Total sleep |
| `Sleep Start` | Date | Optional |
| `Sleep End` | Date | Optional |
| `Sleep Quality Score` | Number | Worker-computed |
| `Resting HR` | Number | Daily value |
| `HRV SDNN` | Number | Daily average/latest |
| `Avg Heart Rate` | Number | Optional aggregate only |
| `VO2 Max` | Number | Optional latest |
| `Recovery Score` | Number | Worker-computed |
| `Readiness` | Select | `low`, `medium`, `high` |
| `Slacking Score` | Number | 0-100 |
| `Needs Workout?` | Checkbox | Main scheduling trigger |
| `Recommended Intensity` | Select | `rest`, `light`, `moderate`, `hard` |
| `Recommended Modality` | Select | `walk`, `run`, `strength`, `mobility`, `yoga` |
| `Recommendation Reason` | Rich text | Human-readable explanation |
| `Generated Calendar Event?` | Checkbox | Prevent duplicate scheduling |
| `Calendar Event ID` | Rich text | ID from Notion Calendar or external calendar |
| `Last Health Sync At` | Date | Data freshness |
| `Data Completeness` | Select | `complete`, `partial`, `missing sleep`, `missing activity` |

This table is intentionally denormalized. The worker should not have to roll up thousands of health samples just to decide whether to schedule a 30-minute workout.

## `Workouts`

Purpose: track actual and scheduled sessions for rotation, fatigue, and "do not overwork the same body part."

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `Strength - Push`, `Outdoor Walk`, `Run` |
| `Import Key` | Rich text | `workout:{hk_uuid}` or `workout:{generated_id}` |
| `Source` | Select | `apple_health`, `worker_generated`, `calendar`, `manual` |
| `Status` | Status | `planned`, `completed`, `skipped`, `rescheduled` |
| `HK Workout UUID` | Rich text | Dedupe key for Apple Health workouts |
| `Calendar Event ID` | Rich text | Dedupe key for generated events |
| `Start` | Date | Start timestamp |
| `End` | Date | End timestamp |
| `Local Date` | Date | Relation/filter helper |
| `Duration Minutes` | Number |  |
| `Workout Activity Type` | Select | `walking`, `running`, `traditional strength`, `functional strength`, `cycling`, `yoga` |
| `Modality` | Select | `cardio`, `strength`, `mobility`, `recovery` |
| `Muscle Groups` | Multi-select | `legs`, `push`, `pull`, `core`, `shoulders` |
| `Movement Pattern` | Multi-select | `squat`, `hinge`, `push`, `pull`, `carry`, `rotation` |
| `Intensity` | Select | `easy`, `moderate`, `hard` |
| `RPE` | Number | Optional manual/perceived effort |
| `Active Energy kcal` | Number | From HealthKit workout summary |
| `Total Energy kcal` | Number | Optional |
| `Distance` | Number | For cardio |
| `Avg HR` | Number | Aggregate only |
| `Max HR` | Number | Aggregate only |
| `Location Type` | Select | `home`, `gym`, `outdoor`, `office`, `travel` |
| `Related Day` | Relation to `Daily Summary` | One workout to one day |
| `Related Plan` | Relation to `Worker Decisions` | What created/recommended it |
| `Notes` | Rich text |  |

## `Metric Catalog`

Purpose: define how each Apple Health metric should be interpreted.

| Property | Type | Notes |
| --- | --- | --- |
| `Metric` | Title | `Steps`, `Active Energy`, `HRV SDNN` |
| `HealthKit Identifier` | Rich text | Stable upsert key, e.g. `HKQuantityTypeIdentifierStepCount` |
| `Sample Kind` | Select | `quantity`, `category`, `workout` |
| `Default Unit` | Select | `count`, `kcal`, `min`, `bpm`, `ms` |
| `Aggregation Style` | Select | `sum`, `average`, `latest`, `min/max`, `interval` |
| `Import Level` | Select | `daily_only`, `hourly_bucket`, `raw`, `workout_only`, `ignore` |
| `Worker Relevance` | Multi-select | `slacking`, `recovery`, `training_load`, `rotation`, `sleep` |
| `Permission Required` | Checkbox | Whether HealthKit permission is required |
| `Enabled?` | Checkbox | Whether the worker imports/uses this metric |
| `Privacy Sensitivity` | Select | `low`, `medium`, `high` |

Example MVP metrics:

| Metric | Import level | Why |
| --- | --- | --- |
| Steps | Daily plus optional hourly | Slacking/activity baseline |
| Active energy | Daily | Activity intensity |
| Exercise minutes | Daily | Primary "did I exercise?" signal |
| Workouts | Raw workout summaries | Rotation and scheduling |
| Sleep analysis | Sleep-session summary | Recovery/readiness |
| Resting HR | Daily latest/avg | Recovery |
| HRV SDNN | Daily avg/latest | Recovery |
| Heart rate | Hourly/workout aggregate only | Avoid raw noise |
| VO2 Max | Latest | Long-term fitness trend |
| Walking/running distance | Daily | Cardio/activity trend |

## `Worker Decisions`

Purpose: audit why the worker did or did not create a workout event.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `Workout decision - 2026-05-16` |
| `Import Key` | Rich text | `decision:2026-05-16-health-check` |
| `Triggered By` | Select | `health_data`, `calendar_event`, `manual`, `daily_check` |
| `Trigger Timestamp` | Date |  |
| `Related Day` | Relation to `Daily Summary` |  |
| `Decision` | Select | `create_workout`, `skip`, `reschedule`, `rest_day` |
| `Suggested Modality` | Select | `walk`, `run`, `strength`, `mobility`, `yoga` |
| `Suggested Intensity` | Select | `light`, `moderate`, `hard` |
| `Suggested Muscle Groups` | Multi-select |  |
| `Avoid Muscle Groups` | Multi-select | Based on recent training |
| `Reason` | Rich text | Example: `No workout in 3 days, low steps today, legs trained yesterday` |
| `Input Snapshot JSON` | Rich text | Frozen decision context |
| `Created Calendar Event ID` | Rich text |  |
| `Status` | Status | `proposed`, `created`, `failed`, `dismissed` |
| `Confidence` | Number | Optional |

## Later Data Sources

### `Health Samples`

Purpose: canonical import/dedupe table that preserves the HealthKit shape without becoming the worker's main query target.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `{identifier} - {start}` |
| `HK UUID` | Rich text | Primary dedupe key |
| `Sample Kind` | Select | `quantity`, `category`, `workout`, `correlation`, `series` |
| `Identifier` | Rich text / relation to `Metric Catalog` | Example: `stepCount` |
| `Start` | Date | HealthKit sample start |
| `End` | Date | HealthKit sample end |
| `Local Date` | Date | Worker-computed |
| `Value` | Number | For quantity samples |
| `Unit` | Select / text | `count`, `kcal`, `min`, `bpm`, `ms` |
| `Category Value` | Rich text / select | Sleep stages, symptoms, etc. |
| `Aggregation Role` | Select | `sum`, `avg`, `min`, `max`, `latest`, `interval` |
| `Source Name` | Rich text | Apple Watch, iPhone, third-party app |
| `Source Bundle ID` | Rich text | Provenance |
| `Device` | Rich text | Optional |
| `Metadata JSON` | Rich text | Non-queryable extras |
| `Deleted?` | Checkbox | HealthKit deleted objects |
| `Raw Hash` | Rich text | Extra dedupe/change detection |
| `Imported At` | Date |  |
| `Sync Batch` | Relation to `Health Sync Runs` |  |

Use this table sparingly. For high-frequency metrics like heart rate, store hourly buckets or short-lived debug rows instead of every raw point.

### `Health Hourly Buckets`

Purpose: preserve time-of-day insight without storing every raw sample.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `{metric} - {bucket start}` |
| `Metric` | Relation to `Metric Catalog` |  |
| `Bucket Start` | Date |  |
| `Bucket End` | Date |  |
| `Local Date` | Date |  |
| `Sum` | Number | For cumulative metrics |
| `Average` | Number | For discrete metrics |
| `Min` | Number | Optional |
| `Max` | Number | Optional |
| `Latest` | Number | Optional |
| `Sample Count` | Number |  |
| `Source Breakdown` | Rich text | Optional JSON |
| `Related Day` | Relation to `Daily Summary` |  |

### `Sleep Sessions`

Purpose: deeper sleep insight if denormalized sleep fields in `Daily Summary` are not enough.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `Sleep - 2026-05-15` |
| `Sleep Date` | Date | Usually the wake-up date |
| `Start` | Date |  |
| `End` | Date |  |
| `Duration Minutes` | Number |  |
| `Time in Bed Minutes` | Number |  |
| `Asleep Minutes` | Number |  |
| `Awake Minutes` | Number |  |
| `REM Minutes` | Number | If available |
| `Core Minutes` | Number | If available |
| `Deep Minutes` | Number | If available |
| `Sleep Efficiency` | Number | Worker-computed |
| `Related Day` | Relation to `Daily Summary` |  |
| `Recovery Impact` | Select | `positive`, `neutral`, `negative` |

### `Health Sync Runs`

Purpose: track import health and avoid duplicate processing.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | `Health upload - 20260516-161200-000.json` |
| `Metric` | Relation to `Metric Catalog` | Optional for metric-scoped syncs |
| `Payload File` | Files | Optional. The current mobile path stores JSON as ordered page-content chunks because Notion file-property attachment was not reliable in validation. |
| `Started At` | Date |  |
| `Completed At` | Date |  |
| `Status` | Status | `uploaded`, `running`, `success`, `failed`, `partial` |
| `Samples Added` | Number |  |
| `Samples Updated` | Number |  |
| `Samples Deleted` | Number |  |
| `Last Sample Start` | Date |  |
| `Last Sample End` | Date |  |
| `Anchor Ref` | Rich text | Store actual HealthKit anchor, file upload ID, or `notion-inline:{filename}` pointer |
| `Error` | Rich text |  |

For mobile uploads, each row can contain child code blocks whose captions start with `eucalyptus-health-payload:v1:`. The Worker reconstructs those chunks in order and imports the JSON through the same normalizer used by `importHealthFixture`.

## How The Worker Should Query It

For scheduling, the worker should mostly read:

1. `Daily Summary` for today and the last 7-14 days.
2. `Workouts` for completed workouts in the last 7-21 days.
3. `Worker Decisions` to avoid duplicate suggestions.
4. Calendar availability from Notion Calendar or the calendar source available to the agent.

Decision flow:

```text
1. Load today's Daily Summary.
2. If Completed Workout? is true, do nothing.
3. If Generated Calendar Event? is true, do nothing unless rescheduling is needed.
4. Load last 14 days of Workouts.
5. Compute:
   - days since last workout
   - recent exercise minutes
   - recent muscle groups trained
   - sleep/recovery score
   - today's activity level
6. Pick modality:
   - low recovery -> walk/mobility
   - no workout for 2-3 days -> moderate workout
   - recent legs -> avoid legs
   - recent push -> avoid push
   - good recovery + low recent load -> strength/cardio
7. Find calendar slot.
8. Create event.
9. Write Worker Decision and update Daily Summary.
```

## Slacking Score Formula

MVP scoring model:

```text
Slacking Score =
  +35 if no completed workout in last 3 days
  +20 if today's exercise minutes < 10
  +15 if today's steps are below personal baseline
  +15 if weekly exercise minutes are below target
  +10 if active energy is below baseline
  -20 if recovery score is low
  -15 if sleep was poor
```

| Score | Action |
| --- | --- |
| `0-29` | No action |
| `30-49` | Suggest light movement |
| `50-69` | Schedule workout if free slot exists |
| `70+` | Strongly prioritize workout |

## Rotation Logic

The `Workouts` data source owns muscle rotation because Apple Health does not reliably know `push/pull/legs` for every workout. Infer rotation from workout type or from the exercise plan the worker generated.

| Recent pattern | Next suggestion |
| --- | --- |
| Legs trained in last 48h | Avoid legs; suggest upper/core/cardio |
| Push trained in last 48h | Suggest pull/legs/cardio |
| Hard cardio yesterday | Suggest mobility/light strength |
| Poor sleep + high resting HR | Suggest walk/mobility |
| No strength in 7 days | Suggest full-body strength |
| No cardio in 5 days | Suggest zone 2 walk/run/cycle |

## Notion-Specific Guidance

Use relations and rollups for UI convenience, but do not make rollups the worker's source of truth. For reliable automation, compute important values in the worker and write them directly to `Daily Summary`:

- `Slacking Score`
- `Recovery Score`
- `Needs Workout?`
- `Recommended Modality`
- `Generated Calendar Event?`

## Notes

- Start with Notion Calendar because the Notion agent can leverage it natively.
- Luma can become a later data source.
- Apple Watch health data should enter through the health ingestion path.
- Notion Mail can become a later context source.
- The agent may suggest beautiful places to exercise when location and schedule make that useful.
