import assert from "node:assert/strict";
import test from "node:test";

import {
  dailySummaryToNotionProperties,
  metricCatalogToNotionProperties,
  workerDecisionToNotionProperties,
  workoutToNotionProperties,
} from "../src/health/notion/NotionHealthDataRepository.ts";

test("maps metric catalog records to Notion page properties", () => {
  assert.deepEqual(
    metricCatalogToNotionProperties({
      importKey: "metric:HKQuantityTypeIdentifierStepCount",
      metric: "Steps",
      healthKitIdentifier: "HKQuantityTypeIdentifierStepCount",
      sampleKind: "quantity",
      defaultUnit: "count",
      aggregationStyle: "sum",
      importLevel: "daily_only",
      workerRelevance: ["slacking"],
      enabled: true,
      privacySensitivity: "low",
      sampleCount: 12,
    }),
    {
      Metric: {
        title: [
          {
            text: {
              content: "Steps",
            },
          },
        ],
      },
      "HealthKit Identifier": {
        rich_text: [
          {
            text: {
              content: "HKQuantityTypeIdentifierStepCount",
            },
          },
        ],
      },
      "Sample Kind": {
        select: {
          name: "quantity",
        },
      },
      "Default Unit": {
        select: {
          name: "count",
        },
      },
      "Aggregation Style": {
        select: {
          name: "sum",
        },
      },
      "Import Level": {
        select: {
          name: "daily_only",
        },
      },
      "Worker Relevance": {
        multi_select: [
          {
            name: "slacking",
          },
        ],
      },
      "Permission Required": {
        checkbox: true,
      },
      "Enabled?": {
        checkbox: true,
      },
      "Privacy Sensitivity": {
        select: {
          name: "low",
        },
      },
    },
  );
});

test("maps daily summaries to existing Notion properties", () => {
  const properties = dailySummaryToNotionProperties({
    importKey: "daily:2026-05-16",
    name: "2026-05-16",
    date: "2026-05-16",
    timezone: "America/Los_Angeles",
    steps: 2744,
    activeEnergyKcal: 100.4,
    exerciseMinutes: 1,
    standMinutes: 5,
    walkingRunningDistanceKm: 1.89,
    cyclingDistanceKm: 0,
    workoutCount: 0,
    completedWorkout: false,
    workoutTypes: ["stairClimbing"],
    muscleGroupsTrained: ["legs"],
    trainingLoad: 11.04,
    lastWorkoutAt: null,
    restingHr: 66,
    hrvSdnn: 26.53,
    avgHeartRate: 74.41,
    vo2Max: null,
    recoveryScore: 62,
    readiness: "medium",
    slackingScore: 81,
    needsWorkout: true,
    recommendedIntensity: "moderate",
    recommendedModality: "walk",
    recommendationReason: "No completed workout detected.",
    dataCompleteness: "missing sleep",
    lastHealthSyncAt: "2026-05-16T20:47:20.131Z",
  });

  assert.deepEqual(properties["Workout Types"], {
    multi_select: [{ name: "walk" }],
  });
  assert.deepEqual(properties["Date"], {
    date: { start: "2026-05-16" },
  });
  assert.deepEqual(properties["Last Workout At"], {
    date: null,
  });
});

test("maps workouts to existing Notion properties", () => {
  const properties = workoutToNotionProperties({
    importKey: "workout:workout-1",
    name: "Stair Climbing - 2026-05-16",
    source: "apple_health",
    status: "completed",
    hkWorkoutUuid: "workout-1",
    start: "2026-05-16T18:00:00.000Z",
    end: "2026-05-16T18:30:00.000Z",
    localDate: "2026-05-16",
    durationMinutes: 30,
    workoutActivityType: "stairClimbing",
    modality: "cardio",
    muscleGroups: ["legs"],
    movementPattern: ["squat"],
    intensity: "hard",
    activeEnergyKcal: 120,
    distanceKm: null,
    relatedDayImportKey: "daily:2026-05-16",
    relatedPlanImportKey: null,
  }, {
    relatedDayPageId: "daily-page-id",
  });

  assert.deepEqual(properties["Workout Activity Type"], {
    select: { name: "walking" },
  });
  assert.deepEqual(properties.Status, {
    status: { name: "completed" },
  });
  assert.deepEqual(properties.Distance, {
    number: null,
  });
  assert.deepEqual(properties["Related Day"], {
    relation: [{ id: "daily-page-id" }],
  });
  assert.deepEqual(properties["Related Plan"], {
    relation: [],
  });
});

test("maps worker decisions to relation-aware Notion properties", () => {
  const properties = workerDecisionToNotionProperties({
    importKey: "decision:2026-05-16-health-check",
    name: "Workout decision - 2026-05-16",
    triggeredBy: "health_data",
    triggerTimestamp: "2026-05-16T20:47:20.131Z",
    relatedDayImportKey: "daily:2026-05-16",
    decision: "create_workout",
    suggestedModality: "walk",
    suggestedIntensity: "moderate",
    suggestedMuscleGroups: ["legs"],
    avoidMuscleGroups: [],
    reason: "No completed workout detected.",
    inputSnapshotJson: "{\"date\":\"2026-05-16\"}",
    createdCalendarEventId: null,
    status: "proposed",
    confidence: 0.72,
  }, {
    relatedDayPageId: "daily-page-id",
  });

  assert.deepEqual(properties["Import Key"], {
    rich_text: [{ text: { content: "decision:2026-05-16-health-check" } }],
  });
  assert.deepEqual(properties["Related Day"], {
    relation: [{ id: "daily-page-id" }],
  });
  assert.deepEqual(properties["Created Calendar Event ID"], {
    rich_text: [],
  });
});
