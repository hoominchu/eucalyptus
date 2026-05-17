import type {
  DailySummaryRecord,
  WorkerDecisionRecord,
  WorkoutRecord,
} from "../importHealthFixture.ts";

export type WorkoutRecommendationInput = {
  dailySummaries: DailySummaryRecord[];
  workouts: WorkoutRecord[];
  targetDate?: string | null;
  generatedAt: string;
};

export type WorkoutRecommendationResult = {
  targetDate: string;
  dailySummary: DailySummaryRecord;
  recentWorkouts: WorkoutRecord[];
  daysSinceLastWorkout: number | null;
  recentExerciseMinutes: number;
  recentMuscleGroups: string[];
  decision: WorkerDecisionRecord;
};

export function recommendWorkout(
  input: WorkoutRecommendationInput,
): WorkoutRecommendationResult {
  const dailySummary = selectDailySummary(input.dailySummaries, input.targetDate);
  const recentWorkouts = selectRecentWorkouts(input.workouts, dailySummary.date, 21);
  const lastWorkout = recentWorkouts[recentWorkouts.length - 1] ?? null;
  const daysSinceLastWorkout =
    lastWorkout === null ? null : daysBetween(lastWorkout.localDate, dailySummary.date);
  const recentExerciseMinutes = round(
    recentWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0),
  );
  const recentMuscleGroups = sortedUnique(
    recentWorkouts.flatMap((workout) => workout.muscleGroups),
  );
  const avoidMuscleGroups = muscleGroupsFromLastDays(
    recentWorkouts,
    dailySummary.date,
    2,
  );
  const decision = pickDecision({
    dailySummary,
    recentWorkouts,
    daysSinceLastWorkout,
    recentExerciseMinutes,
    recentMuscleGroups,
    avoidMuscleGroups,
    generatedAt: input.generatedAt,
  });

  return {
    targetDate: dailySummary.date,
    dailySummary,
    recentWorkouts,
    daysSinceLastWorkout,
    recentExerciseMinutes,
    recentMuscleGroups,
    decision,
  };
}

function selectDailySummary(
  dailySummaries: DailySummaryRecord[],
  targetDate?: string | null,
): DailySummaryRecord {
  if (dailySummaries.length === 0) {
    throw new Error("Cannot recommend a workout without daily summaries.");
  }

  const sorted = [...dailySummaries].sort((a, b) => a.date.localeCompare(b.date));
  const selected = targetDate
    ? sorted.find((summary) => summary.date === targetDate)
    : sorted[sorted.length - 1];

  if (!selected) {
    throw new Error(`No Daily Summary found for ${targetDate}.`);
  }

  return selected;
}

function selectRecentWorkouts(
  workouts: WorkoutRecord[],
  targetDate: string,
  windowDays: number,
): WorkoutRecord[] {
  return workouts
    .filter((workout) => {
      const ageDays = daysBetween(workout.localDate, targetDate);

      return ageDays >= 0 && ageDays <= windowDays;
    })
    .sort((a, b) => a.end.localeCompare(b.end));
}

function pickDecision(input: {
  dailySummary: DailySummaryRecord;
  recentWorkouts: WorkoutRecord[];
  daysSinceLastWorkout: number | null;
  recentExerciseMinutes: number;
  recentMuscleGroups: string[];
  avoidMuscleGroups: string[];
  generatedAt: string;
}): WorkerDecisionRecord {
  const summary = input.dailySummary;
  const hasRecentWorkout =
    input.daysSinceLastWorkout !== null && input.daysSinceLastWorkout <= 1;
  const shouldCreateWorkout =
    !summary.completedWorkout &&
    (summary.needsWorkout ||
      summary.slackingScore >= 65 ||
      input.daysSinceLastWorkout === null ||
      input.daysSinceLastWorkout >= 2);
  const shouldRest =
    !summary.completedWorkout &&
    !shouldCreateWorkout &&
    (summary.readiness === "low" || hasRecentWorkout);
  const decision = summary.completedWorkout
    ? "skip"
    : shouldCreateWorkout
      ? "create_workout"
      : shouldRest
        ? "rest_day"
        : "skip";
  const suggestedModality =
    decision === "create_workout"
      ? pickModality(summary, input.recentMuscleGroups, input.avoidMuscleGroups)
      : summary.recommendedModality;
  const suggestedIntensity =
    decision === "create_workout"
      ? pickIntensity(summary)
      : "light";
  const suggestedMuscleGroups =
    suggestedModality === "strength"
      ? nextStrengthMuscleGroups(input.avoidMuscleGroups)
      : suggestedModality === "mobility" || suggestedModality === "yoga"
        ? ["core", "full body"]
        : ["legs"];
  const reason = decisionReason({
    summary,
    decision,
    daysSinceLastWorkout: input.daysSinceLastWorkout,
    recentExerciseMinutes: input.recentExerciseMinutes,
    avoidMuscleGroups: input.avoidMuscleGroups,
  });

  return {
    importKey: `decision:${summary.date}-workout-recommendation`,
    name: `Workout recommendation - ${summary.date}`,
    triggeredBy: "daily_check",
    triggerTimestamp: input.generatedAt,
    relatedDayImportKey: summary.importKey,
    decision,
    suggestedModality,
    suggestedIntensity,
    suggestedMuscleGroups,
    avoidMuscleGroups: input.avoidMuscleGroups,
    reason,
    inputSnapshotJson: JSON.stringify({
      date: summary.date,
      completedWorkout: summary.completedWorkout,
      steps: summary.steps,
      exerciseMinutes: summary.exerciseMinutes,
      readiness: summary.readiness,
      recoveryScore: summary.recoveryScore,
      slackingScore: summary.slackingScore,
      needsWorkout: summary.needsWorkout,
      daysSinceLastWorkout: input.daysSinceLastWorkout,
      recentExerciseMinutes: input.recentExerciseMinutes,
      recentMuscleGroups: input.recentMuscleGroups,
      avoidMuscleGroups: input.avoidMuscleGroups,
    }),
    createdCalendarEventId: null,
    status: "proposed",
    confidence: decision === "create_workout" ? 0.82 : 0.7,
  };
}

function pickModality(
  summary: DailySummaryRecord,
  recentMuscleGroups: string[],
  avoidMuscleGroups: string[],
): WorkerDecisionRecord["suggestedModality"] {
  if (summary.readiness === "low") {
    return "mobility";
  }
  if (
    avoidMuscleGroups.includes("legs") &&
    (summary.recommendedModality === "walk" || summary.recommendedModality === "run")
  ) {
    return "mobility";
  }
  if (!recentMuscleGroups.includes("full body") && summary.steps >= 5_000) {
    return "strength";
  }

  return summary.recommendedModality;
}

function pickIntensity(
  summary: DailySummaryRecord,
): WorkerDecisionRecord["suggestedIntensity"] {
  if (summary.readiness === "low") {
    return "light";
  }
  if (summary.slackingScore >= 80 && summary.readiness === "high") {
    return "hard";
  }
  if (summary.recommendedIntensity === "hard") {
    return "hard";
  }

  return "moderate";
}

function decisionReason(input: {
  summary: DailySummaryRecord;
  decision: WorkerDecisionRecord["decision"];
  daysSinceLastWorkout: number | null;
  recentExerciseMinutes: number;
  avoidMuscleGroups: string[];
}): string {
  if (input.summary.completedWorkout) {
    return `Skip scheduling: ${input.summary.workoutCount} workout(s) and ${input.summary.exerciseMinutes} exercise minutes are already logged for ${input.summary.date}.`;
  }
  if (input.decision === "rest_day") {
    return `Rest day: readiness is ${input.summary.readiness}, slacking score is ${input.summary.slackingScore}, and recent exercise minutes are ${input.recentExerciseMinutes}.`;
  }
  if (input.decision === "create_workout") {
    const daysText =
      input.daysSinceLastWorkout === null
        ? "no recent workout found"
        : `${input.daysSinceLastWorkout} day(s) since the last workout`;
    const avoidText =
      input.avoidMuscleGroups.length === 0
        ? "no muscle groups need avoidance"
        : `avoid ${input.avoidMuscleGroups.join(", ")}`;

    return `Create workout: ${daysText}, ${input.summary.steps} steps today, readiness is ${input.summary.readiness}, slacking score is ${input.summary.slackingScore}; ${avoidText}.`;
  }

  return `Skip scheduling: activity is sufficient for now with ${input.summary.steps} steps, ${input.summary.exerciseMinutes} exercise minutes, and readiness ${input.summary.readiness}.`;
}

function muscleGroupsFromLastDays(
  workouts: WorkoutRecord[],
  targetDate: string,
  days: number,
): string[] {
  return sortedUnique(
    workouts
      .filter((workout) => {
        const ageDays = daysBetween(workout.localDate, targetDate);

        return ageDays >= 0 && ageDays <= days;
      })
      .flatMap((workout) => workout.muscleGroups),
  );
}

function nextStrengthMuscleGroups(avoidMuscleGroups: string[]): string[] {
  if (!avoidMuscleGroups.includes("legs")) {
    return ["legs"];
  }
  if (!avoidMuscleGroups.includes("push")) {
    return ["push", "core"];
  }
  if (!avoidMuscleGroups.includes("pull")) {
    return ["pull", "core"];
  }

  return ["core", "full body"];
}

function daysBetween(fromDate: string, toDate: string): number {
  const oneDayMs = 24 * 60 * 60 * 1_000;

  return Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / oneDayMs);
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
