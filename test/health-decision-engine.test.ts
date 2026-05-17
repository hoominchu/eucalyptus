import assert from "node:assert/strict";
import test from "node:test";

import { recommendWorkout } from "../src/health/domain/healthDecisionEngine.ts";
import type {
  DailySummaryRecord,
  WorkoutRecord,
} from "../src/health/importHealthFixture.ts";

const baseSummary: DailySummaryRecord = {
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
  workoutTypes: [],
  muscleGroupsTrained: [],
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
};

const recentLegWorkout: WorkoutRecord = {
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
};

test("recommends creating a workout for a stale low-activity day", () => {
  const result = recommendWorkout({
    dailySummaries: [baseSummary],
    workouts: [],
    targetDate: "2026-05-16",
    generatedAt: "2026-05-16T20:47:20.131Z",
  });

  assert.equal(result.decision.decision, "create_workout");
  assert.equal(result.decision.suggestedModality, "walk");
  assert.equal(result.decision.suggestedIntensity, "moderate");
  assert.equal(result.daysSinceLastWorkout, null);
  assert.match(result.decision.reason, /Create workout/);
});

test("skips scheduling when today's workout is already complete", () => {
  const result = recommendWorkout({
    dailySummaries: [
      {
        ...baseSummary,
        completedWorkout: true,
        workoutCount: 1,
        exerciseMinutes: 30,
        needsWorkout: false,
        slackingScore: 10,
      },
    ],
    workouts: [recentLegWorkout],
    targetDate: "2026-05-16",
    generatedAt: "2026-05-16T20:47:20.131Z",
  });

  assert.equal(result.decision.decision, "skip");
  assert.match(result.decision.reason, /already logged/);
});

test("rotates strength recommendation away from recently trained legs", () => {
  const result = recommendWorkout({
    dailySummaries: [
      {
        ...baseSummary,
        steps: 8_000,
        recommendedModality: "mobility",
      },
    ],
    workouts: [recentLegWorkout],
    targetDate: "2026-05-16",
    generatedAt: "2026-05-16T20:47:20.131Z",
  });

  assert.equal(result.decision.decision, "create_workout");
  assert.equal(result.decision.suggestedModality, "strength");
  assert.deepEqual(result.decision.avoidMuscleGroups, ["legs"]);
  assert.deepEqual(result.decision.suggestedMuscleGroups, ["push", "core"]);
});

test("does not recommend leg-focused cardio when legs should be avoided", () => {
  const result = recommendWorkout({
    dailySummaries: [baseSummary],
    workouts: [recentLegWorkout],
    targetDate: "2026-05-16",
    generatedAt: "2026-05-16T20:47:20.131Z",
  });

  assert.equal(result.decision.decision, "create_workout");
  assert.equal(result.decision.suggestedModality, "mobility");
  assert.deepEqual(result.decision.avoidMuscleGroups, ["legs"]);
  assert.deepEqual(result.decision.suggestedMuscleGroups, ["core", "full body"]);
});
