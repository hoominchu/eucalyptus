import {
  importHealthSyncRun,
  type ImportHealthSyncRunResult,
} from "./importHealthSyncRun.ts";
import {
  recommendWorkoutFromRecords,
  type RecommendWorkoutTodayResult,
} from "./recommendWorkoutToday.ts";

export type PlanWorkoutFromHealthSyncRunInput = {
  pageId: string | null;
  targetDate: string | null;
  dryRun: boolean;
};

export type WorkoutSchedulingIntent = {
  shouldSchedule: boolean;
  action: "create_calendar_event" | "skip" | "rest_day";
  targetDate: string;
  title: string;
  durationMinutes: number;
  modality: string;
  intensity: string;
  suggestedMuscleGroups: string[];
  avoidMuscleGroups: string[];
  reason: string;
  calendarInstructions: string;
  idempotencyKey: string;
};

export type PlanWorkoutFromHealthSyncRunResult = {
  dryRun: boolean;
  imported: ImportHealthSyncRunResult;
  recommendation: RecommendWorkoutTodayResult;
  schedulingIntent: WorkoutSchedulingIntent;
};

export async function planWorkoutFromHealthSyncRun(
  input: PlanWorkoutFromHealthSyncRunInput,
): Promise<PlanWorkoutFromHealthSyncRunResult> {
  const imported = await importHealthSyncRun({
    pageId: input.pageId,
    dryRun: input.dryRun,
    only: ["metricCatalog", "dailySummaries", "workerDecisions", "workouts"],
  });
  const recommendation = await recommendWorkoutFromRecords({
    records: imported.importResult.records,
    targetDate: input.targetDate,
    dryRun: input.dryRun,
  });

  return {
    dryRun: input.dryRun,
    imported,
    recommendation,
    schedulingIntent: buildSchedulingIntent(recommendation),
  };
}

function buildSchedulingIntent(
  recommendation: RecommendWorkoutTodayResult,
): WorkoutSchedulingIntent {
  const decision = recommendation.decision;
  const shouldSchedule = decision.decision === "create_workout";
  const durationMinutes = pickDurationMinutes(
    decision.suggestedModality,
    decision.suggestedIntensity,
  );
  const title = shouldSchedule
    ? workoutTitle(decision.suggestedModality, decision.suggestedIntensity)
    : `No workout to schedule - ${recommendation.targetDate}`;

  return {
    shouldSchedule,
    action: shouldSchedule
      ? "create_calendar_event"
      : decision.decision === "rest_day"
        ? "rest_day"
        : "skip",
    targetDate: recommendation.targetDate,
    title,
    durationMinutes,
    modality: decision.suggestedModality,
    intensity: decision.suggestedIntensity,
    suggestedMuscleGroups: decision.suggestedMuscleGroups,
    avoidMuscleGroups: decision.avoidMuscleGroups,
    reason: decision.reason,
    calendarInstructions: shouldSchedule
      ? [
          `Find a free ${durationMinutes}-minute slot on ${recommendation.targetDate}.`,
          "Avoid conflicts and leave practical buffer for changing or showering.",
          `Create a calendar event titled "${title}" only if the user has allowed calendar writes.`,
          `Use this idempotency key in the event notes: ${decision.importKey}.`,
        ].join(" ")
      : "Do not create a calendar event for this result.",
    idempotencyKey: decision.importKey,
  };
}

function workoutTitle(modality: string, intensity: string): string {
  const label = modality === "walk"
    ? "Walk"
    : modality === "run"
      ? "Run"
      : modality === "strength"
        ? "Strength"
        : modality === "mobility"
          ? "Mobility"
          : "Yoga";

  return `${titleCase(intensity)} ${label}`;
}

function pickDurationMinutes(modality: string, intensity: string): number {
  if (modality === "mobility" || modality === "yoga") {
    return 25;
  }
  if (intensity === "hard") {
    return 45;
  }
  if (intensity === "light") {
    return 25;
  }

  return 35;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
