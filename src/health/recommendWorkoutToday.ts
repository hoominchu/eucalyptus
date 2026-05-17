import { loadHealthImportConfig } from "./config.ts";
import {
  normalizeAppleHealthExport,
  readAppleHealthExport,
  type NormalizedHealthFixture,
  type WorkerDecisionRecord,
} from "./importHealthFixture.ts";
import { recommendWorkout } from "./domain/healthDecisionEngine.ts";
import {
  NotionHealthDataRepository,
  type CollectionWriteResult,
} from "./notion/NotionHealthDataRepository.ts";

export type RecommendWorkoutTodayInput = {
  path: string;
  targetDate: string | null;
  dryRun: boolean;
};

export type RecommendWorkoutTodayResult = {
  dryRun: boolean;
  targetDate: string;
  decision: WorkerDecisionRecord;
  facts: {
    completedWorkout: boolean;
    steps: number;
    exerciseMinutes: number;
    readiness: "low" | "medium" | "high";
    slackingScore: number;
    daysSinceLastWorkout: number | null;
    recentExerciseMinutes: number;
    recentMuscleGroups: string[];
  };
  writeResult: CollectionWriteResult | null;
};

export async function recommendWorkoutToday(
  input: RecommendWorkoutTodayInput,
): Promise<RecommendWorkoutTodayResult> {
  const fixture = await readAppleHealthExport(input.path);
  const records = normalizeAppleHealthExport(fixture, {
    only: ["dailySummaries", "workouts"],
  });

  return recommendWorkoutFromRecords({
    records,
    targetDate: input.targetDate,
    dryRun: input.dryRun,
  });
}

export async function recommendWorkoutFromRecords(input: {
  records: Pick<
    NormalizedHealthFixture,
    "dailySummaries" | "workouts" | "generatedAt"
  >;
  targetDate: string | null;
  dryRun: boolean;
}): Promise<RecommendWorkoutTodayResult> {
  const recommendation = recommendWorkout({
    dailySummaries: input.records.dailySummaries,
    workouts: input.records.workouts,
    targetDate: input.targetDate,
    generatedAt: input.records.generatedAt,
  });
  const writeResult = input.dryRun
    ? null
    : await writeRecommendation(recommendation.decision);

  return {
    dryRun: input.dryRun,
    targetDate: recommendation.targetDate,
    decision: recommendation.decision,
    facts: {
      completedWorkout: recommendation.dailySummary.completedWorkout,
      steps: recommendation.dailySummary.steps,
      exerciseMinutes: recommendation.dailySummary.exerciseMinutes,
      readiness: recommendation.dailySummary.readiness,
      slackingScore: recommendation.dailySummary.slackingScore,
      daysSinceLastWorkout: recommendation.daysSinceLastWorkout,
      recentExerciseMinutes: recommendation.recentExerciseMinutes,
      recentMuscleGroups: recommendation.recentMuscleGroups,
    },
    writeResult,
  };
}

async function writeRecommendation(
  decision: WorkerDecisionRecord,
): Promise<CollectionWriteResult> {
  const config = loadHealthImportConfig();
  const repository = new NotionHealthDataRepository(config);

  return repository.upsertWorkerDecisions([decision]);
}
