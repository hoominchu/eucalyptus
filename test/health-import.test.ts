import assert from "node:assert/strict";
import test from "node:test";

import {
  importHealthFixture,
  importHealthJsonText,
  normalizeAppleHealthExport,
} from "../src/health/importHealthFixture.ts";
import { normalizeNotionPageId } from "../src/health/importHealthSyncRun.ts";

const sampleExport = {
  source: "eucalyptus-mobile",
  exported_at: "2026-05-16T20:47:20.131Z",
  window: {
    from: "2026-05-15T08:00:00.000Z",
    to: "2026-05-17T06:59:59.000Z",
  },
  metrics: {
    HKQuantityTypeIdentifierStepCount: [
      {
        start: "2026-05-15T18:00:00.000Z",
        end: "2026-05-15T18:05:00.000Z",
        value: 1000,
        unit: "count",
        uuid: "steps-1",
        source: "SourceProxy",
      },
      {
        start: "2026-05-15T19:00:00.000Z",
        end: "2026-05-15T19:05:00.000Z",
        value: 750,
        unit: "count",
        uuid: "steps-2",
        source: "SourceProxy",
      },
    ],
    HKQuantityTypeIdentifierActiveEnergyBurned: [
      {
        start: "2026-05-15T18:00:00.000Z",
        end: "2026-05-15T18:30:00.000Z",
        value: 50.5,
        unit: "Cal",
        uuid: "energy-1",
        source: "SourceProxy",
      },
    ],
    HKQuantityTypeIdentifierAppleExerciseTime: [
      {
        start: "2026-05-15T18:00:00.000Z",
        end: "2026-05-15T18:30:00.000Z",
        value: 30,
        unit: "min",
        uuid: "exercise-1",
        source: "SourceProxy",
      },
    ],
    HKQuantityTypeIdentifierHeartRate: [
      {
        start: "2026-05-15T18:00:00.000Z",
        end: "2026-05-15T18:00:00.000Z",
        value: 80,
        unit: "count/min",
        uuid: "hr-1",
        source: "SourceProxy",
      },
      {
        start: "2026-05-15T18:05:00.000Z",
        end: "2026-05-15T18:05:00.000Z",
        value: 100,
        unit: "count/min",
        uuid: "hr-2",
        source: "SourceProxy",
      },
    ],
    HKQuantityTypeIdentifierVO2Max: [],
  },
  workouts: [
    {
      uuid: "workout-1",
      workoutActivityTypeName: "cycling",
      duration: {
        unit: "s",
        quantity: 1800,
      },
      totalEnergyBurned: {
        unit: "kcal",
        quantity: 120,
      },
      totalDistance: {
        unit: "meters",
        quantity: 9000,
      },
      startDate: "2026-05-15T18:00:00.000Z",
      endDate: "2026-05-15T18:30:00.000Z",
    },
  ],
};

test("normalizes Apple Health export into dry-run records", () => {
  const normalized = normalizeAppleHealthExport(sampleExport);

  assert.equal(normalized.schemaVersion, "health-fixture.v1");
  assert.equal(normalized.source, "eucalyptus-mobile");
  assert.equal(normalized.metricCatalog.length, 5);
  assert.equal(normalized.dailySummaries.length, 2);
  assert.equal(normalized.workerDecisions.length, 2);
  assert.equal(normalized.workouts.length, 1);
});

test("aggregates daily activity metrics by local date", () => {
  const normalized = normalizeAppleHealthExport(sampleExport);
  const day = normalized.dailySummaries.find(
    (summary) => summary.importKey === "daily:2026-05-15",
  );

  assert.ok(day);
  assert.equal(day.steps, 1750);
  assert.equal(day.activeEnergyKcal, 50.5);
  assert.equal(day.exerciseMinutes, 30);
  assert.equal(day.avgHeartRate, 90);
  assert.equal(day.completedWorkout, true);
  assert.equal(day.workoutCount, 1);
  assert.deepEqual(day.workoutTypes, ["cycling"]);
});

test("maps workouts to relation-ready records", () => {
  const normalized = normalizeAppleHealthExport(sampleExport);

  assert.deepEqual(normalized.workouts[0], {
    importKey: "workout:workout-1",
    name: "Cycling - 2026-05-15",
    source: "apple_health",
    status: "completed",
    hkWorkoutUuid: "workout-1",
    start: "2026-05-15T18:00:00.000Z",
    end: "2026-05-15T18:30:00.000Z",
    localDate: "2026-05-15",
    durationMinutes: 30,
    workoutActivityType: "cycling",
    modality: "cardio",
    muscleGroups: ["legs"],
    movementPattern: ["squat"],
    intensity: "moderate",
    activeEnergyKcal: 120,
    distanceKm: 9,
    relatedDayImportKey: "daily:2026-05-15",
    relatedPlanImportKey: null,
  });
});

test("generates deterministic worker decisions from daily summaries", () => {
  const normalized = normalizeAppleHealthExport(sampleExport);

  assert.deepEqual(normalized.workerDecisions[0], {
    importKey: "decision:2026-05-15-health-check",
    name: "Workout decision - 2026-05-15",
    triggeredBy: "health_data",
    triggerTimestamp: "2026-05-16T20:47:20.131Z",
    relatedDayImportKey: "daily:2026-05-15",
    decision: "skip",
    suggestedModality: "walk",
    suggestedIntensity: "light",
    suggestedMuscleGroups: ["legs"],
    avoidMuscleGroups: ["legs"],
    reason: "Completed 1 workout(s) and 30 exercise minutes today.",
    inputSnapshotJson: JSON.stringify({
      date: "2026-05-15",
      completedWorkout: true,
      steps: 1750,
      exerciseMinutes: 30,
      workoutCount: 1,
      readiness: "medium",
      slackingScore: 10,
      needsWorkout: false,
      recommendedModality: "walk",
      recommendedIntensity: "rest",
      dataCompleteness: "missing sleep",
    }),
    createdCalendarEventId: null,
    status: "proposed",
    confidence: 0.65,
  });
});

test("can normalize only selected collections", () => {
  const normalized = normalizeAppleHealthExport(sampleExport, {
    only: ["dailySummaries"],
  });

  assert.equal(normalized.metricCatalog.length, 0);
  assert.equal(normalized.dailySummaries.length, 2);
  assert.equal(normalized.workerDecisions.length, 0);
  assert.equal(normalized.workouts.length, 0);
});

test("can generate only worker decisions without selecting daily summary writes", () => {
  const normalized = normalizeAppleHealthExport(sampleExport, {
    only: ["workerDecisions"],
  });

  assert.equal(normalized.metricCatalog.length, 0);
  assert.equal(normalized.dailySummaries.length, 0);
  assert.equal(normalized.workerDecisions.length, 2);
  assert.equal(normalized.workouts.length, 0);
});

test("requires explicit collection selection for writes", async () => {
  await assert.rejects(
    importHealthFixture({
      path: "/tmp/not-read-for-scope-validation.json",
      dryRun: false,
      only: null,
    }),
    /requires an explicit only array/,
  );
});

test("imports Apple Health JSON text for remote payloads", async () => {
  const result = await importHealthJsonText({
    contents: JSON.stringify(sampleExport),
    dryRun: true,
    only: ["dailySummaries", "workouts"],
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.counts.dailySummaries, 2);
  assert.equal(result.counts.workouts, 1);
  assert.equal(result.counts.metricCatalog, 0);
  assert.equal(result.counts.workerDecisions, 0);
});

test("normalizes Notion page IDs from URLs before API calls", () => {
  assert.equal(
    normalizeNotionPageId("https://www.notion.so/3630f8240c0a81d08879fca04394525e"),
    "3630f8240c0a81d08879fca04394525e",
  );
  assert.equal(
    normalizeNotionPageId("https://www.notion.so/Juicebox/Health-3630f8240c0a81d08879fca04394525e?pvs=4"),
    "3630f8240c0a81d08879fca04394525e",
  );
  assert.equal(
    normalizeNotionPageId("3630f824-0c0a-81d0-8879-fca04394525e"),
    "3630f8240c0a81d08879fca04394525e",
  );
});

test("rejects invalid Notion page IDs", () => {
  assert.throws(
    () => normalizeNotionPageId("https://www.notion.so/not-a-page"),
    /Invalid Notion page ID or URL/,
  );
});
