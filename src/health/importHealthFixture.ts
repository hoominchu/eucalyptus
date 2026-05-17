import { readFile } from "node:fs/promises";

import { loadHealthImportConfig } from "./config.ts";
import {
  NotionHealthDataRepository,
  type CollectionWriteResult,
} from "./notion/NotionHealthDataRepository.ts";

export type HealthImportCollection =
  | "metricCatalog"
  | "dailySummaries"
  | "workerDecisions"
  | "workouts";

export type ImportHealthFixtureInput = {
  path: string;
  dryRun: boolean;
  only: HealthImportCollection[] | null;
};

export type ImportHealthJsonTextInput = {
  contents: string;
  dryRun: boolean;
  only: HealthImportCollection[] | null;
};

export type MetricCatalogRecord = {
  importKey: string;
  metric: string;
  healthKitIdentifier: string;
  sampleKind: "quantity" | "workout";
  defaultUnit: string;
  aggregationStyle: string;
  importLevel: string;
  workerRelevance: string[];
  enabled: boolean;
  privacySensitivity: "low" | "medium" | "high";
  sampleCount: number;
};

export type DailySummaryRecord = {
  importKey: string;
  name: string;
  date: string;
  timezone: string;
  steps: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standMinutes: number;
  walkingRunningDistanceKm: number;
  cyclingDistanceKm: number;
  workoutCount: number;
  completedWorkout: boolean;
  workoutTypes: string[];
  muscleGroupsTrained: string[];
  trainingLoad: number;
  lastWorkoutAt: string | null;
  restingHr: number | null;
  hrvSdnn: number | null;
  avgHeartRate: number | null;
  vo2Max: number | null;
  recoveryScore: number | null;
  readiness: "low" | "medium" | "high";
  slackingScore: number;
  needsWorkout: boolean;
  recommendedIntensity: "rest" | "light" | "moderate" | "hard";
  recommendedModality: "walk" | "run" | "strength" | "mobility" | "yoga";
  recommendationReason: string;
  dataCompleteness: "complete" | "partial" | "missing sleep" | "missing activity";
  lastHealthSyncAt: string;
};

export type WorkoutRecord = {
  importKey: string;
  name: string;
  source: "apple_health";
  status: "completed";
  hkWorkoutUuid: string;
  start: string;
  end: string;
  localDate: string;
  durationMinutes: number;
  workoutActivityType: string;
  modality: "cardio" | "strength" | "mobility" | "recovery";
  muscleGroups: string[];
  movementPattern: string[];
  intensity: "easy" | "moderate" | "hard";
  activeEnergyKcal: number | null;
  distanceKm: number | null;
  relatedDayImportKey: string;
  relatedPlanImportKey: string | null;
};

export type WorkerDecisionRecord = {
  importKey: string;
  name: string;
  triggeredBy: "health_data" | "calendar_event" | "manual" | "daily_check";
  triggerTimestamp: string;
  relatedDayImportKey: string;
  decision: "create_workout" | "skip" | "reschedule" | "rest_day";
  suggestedModality: "walk" | "run" | "strength" | "mobility" | "yoga";
  suggestedIntensity: "light" | "moderate" | "hard";
  suggestedMuscleGroups: string[];
  avoidMuscleGroups: string[];
  reason: string;
  inputSnapshotJson: string;
  createdCalendarEventId: string | null;
  status: "proposed" | "created" | "failed" | "dismissed";
  confidence: number | null;
};

export type NormalizedHealthFixture = {
  schemaVersion: "health-fixture.v1";
  source: string;
  generatedAt: string;
  timezone: string;
  window: {
    from: string;
    to: string;
  };
  metricCatalog: MetricCatalogRecord[];
  dailySummaries: DailySummaryRecord[];
  workerDecisions: WorkerDecisionRecord[];
  workouts: WorkoutRecord[];
};

export type ImportHealthFixtureResult = {
  dryRun: boolean;
  source: string;
  generatedAt: string;
  timezone: string;
  window: {
    from: string;
    to: string;
  };
  counts: {
    metricCatalog: number;
    dailySummaries: number;
    workerDecisions: number;
    workouts: number;
  };
  plannedWrites: {
    metricCatalog: number;
    dailySummaries: number;
    workerDecisions: number;
    workouts: number;
  };
  writeResults: {
    metricCatalog: CollectionWriteResult | null;
    dailySummaries: CollectionWriteResult | null;
    workerDecisions: CollectionWriteResult | null;
    workouts: CollectionWriteResult | null;
  };
  records: NormalizedHealthFixture;
};

type AppleHealthExport = {
  source: string;
  exported_at: string;
  window: {
    from: string;
    to: string;
  };
  metrics: Record<string, HealthSample[]>;
  workouts: HealthWorkout[];
  workerDecisions?: HealthWorkerDecision[];
};

type HealthSample = {
  start: string;
  end: string;
  value: number;
  unit: string;
  uuid: string;
  source: string;
};

type HealthWorkout = {
  workoutActivityTypeName?: string;
  duration?: Quantity;
  totalEnergyBurned?: Quantity;
  totalDistance?: Quantity;
  startDate: string;
  endDate: string;
  uuid: string;
};

type HealthWorkerDecision = WorkerDecisionRecord;

type Quantity = {
  unit: string;
  quantity: number;
};

type MetricDefinition = {
  metric: string;
  defaultUnit: string;
  aggregationStyle: string;
  importLevel: string;
  workerRelevance: string[];
  privacySensitivity: "low" | "medium" | "high";
};

type MutableDailySummary = Omit<
  DailySummaryRecord,
  | "completedWorkout"
  | "trainingLoad"
  | "recoveryScore"
  | "readiness"
  | "slackingScore"
  | "needsWorkout"
  | "recommendedIntensity"
  | "recommendedModality"
  | "recommendationReason"
  | "dataCompleteness"
> & {
  heartRateValues: number[];
  hrvValues: number[];
  restingHrSamples: HealthSample[];
  vo2MaxSamples: HealthSample[];
};

const DEFAULT_TIMEZONE = "America/Los_Angeles";

const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  HKQuantityTypeIdentifierStepCount: {
    metric: "Steps",
    defaultUnit: "count",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["slacking"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierHeartRate: {
    metric: "Heart Rate",
    defaultUnit: "bpm",
    aggregationStyle: "average",
    importLevel: "daily_only",
    workerRelevance: ["recovery"],
    privacySensitivity: "medium",
  },
  HKQuantityTypeIdentifierRestingHeartRate: {
    metric: "Resting HR",
    defaultUnit: "bpm",
    aggregationStyle: "latest",
    importLevel: "daily_only",
    workerRelevance: ["recovery"],
    privacySensitivity: "medium",
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    metric: "HRV SDNN",
    defaultUnit: "ms",
    aggregationStyle: "average",
    importLevel: "daily_only",
    workerRelevance: ["recovery"],
    privacySensitivity: "medium",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    metric: "Active Energy",
    defaultUnit: "kcal",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["slacking", "training_load"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierBasalEnergyBurned: {
    metric: "Basal Energy",
    defaultUnit: "kcal",
    aggregationStyle: "sum",
    importLevel: "ignore",
    workerRelevance: [],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    metric: "Walking + Running Distance",
    defaultUnit: "km",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["slacking", "training_load"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierDistanceCycling: {
    metric: "Cycling Distance",
    defaultUnit: "km",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["training_load"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    metric: "Exercise Minutes",
    defaultUnit: "min",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["slacking", "training_load"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierAppleStandTime: {
    metric: "Stand Minutes",
    defaultUnit: "min",
    aggregationStyle: "sum",
    importLevel: "daily_only",
    workerRelevance: ["slacking"],
    privacySensitivity: "low",
  },
  HKQuantityTypeIdentifierBodyMass: {
    metric: "Body Mass",
    defaultUnit: "kg",
    aggregationStyle: "latest",
    importLevel: "ignore",
    workerRelevance: [],
    privacySensitivity: "high",
  },
  HKQuantityTypeIdentifierVO2Max: {
    metric: "VO2 Max",
    defaultUnit: "mL/min/kg",
    aggregationStyle: "latest",
    importLevel: "daily_only",
    workerRelevance: ["recovery", "training_load"],
    privacySensitivity: "medium",
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    metric: "Respiratory Rate",
    defaultUnit: "breaths/min",
    aggregationStyle: "average",
    importLevel: "daily_only",
    workerRelevance: ["recovery"],
    privacySensitivity: "medium",
  },
  HKQuantityTypeIdentifierOxygenSaturation: {
    metric: "Oxygen Saturation",
    defaultUnit: "%",
    aggregationStyle: "average",
    importLevel: "daily_only",
    workerRelevance: ["recovery"],
    privacySensitivity: "medium",
  },
};

export async function importHealthFixture(
  input: ImportHealthFixtureInput,
): Promise<ImportHealthFixtureResult> {
  validateWriteScope(input);

  const fixture = await readAppleHealthExport(input.path);

  return importAppleHealthExport(fixture, input);
}

export async function importHealthJsonText(
  input: ImportHealthJsonTextInput,
): Promise<ImportHealthFixtureResult> {
  validateWriteScope(input);

  const parsed: unknown = JSON.parse(input.contents);
  const fixture = parseAppleHealthExport(parsed);

  return importAppleHealthExport(fixture, input);
}

async function importAppleHealthExport(
  fixture: AppleHealthExport,
  input: {
    dryRun: boolean;
    only: HealthImportCollection[] | null;
  },
): Promise<ImportHealthFixtureResult> {
  const records = normalizeAppleHealthExport(fixture, {
    timezone: DEFAULT_TIMEZONE,
    only: input.only,
  });
  const writeResults = input.dryRun
    ? {
        metricCatalog: null,
        dailySummaries: null,
        workerDecisions: null,
        workouts: null,
      }
    : await writeSelectedCollections(records);

  return {
    dryRun: input.dryRun,
    source: records.source,
    generatedAt: records.generatedAt,
    timezone: records.timezone,
    window: records.window,
    counts: {
      metricCatalog: records.metricCatalog.length,
      dailySummaries: records.dailySummaries.length,
      workerDecisions: records.workerDecisions.length,
      workouts: records.workouts.length,
    },
    plannedWrites: {
      metricCatalog: records.metricCatalog.length,
      dailySummaries: records.dailySummaries.length,
      workerDecisions: records.workerDecisions.length,
      workouts: records.workouts.length,
    },
    writeResults,
    records,
  };
}

function validateWriteScope(input: {
  dryRun: boolean;
  only: HealthImportCollection[] | null;
}): void {
  if (input.dryRun || input.only !== null) {
    return;
  }

  throw new Error(
    "dryRun:false requires an explicit only array. Use only:[\"metricCatalog\",\"dailySummaries\",\"workerDecisions\",\"workouts\"] to write all implemented collections.",
  );
}

async function writeSelectedCollections(
  records: NormalizedHealthFixture,
): Promise<ImportHealthFixtureResult["writeResults"]> {
  const config = loadHealthImportConfig();
  const repository = new NotionHealthDataRepository(config);
  const metricCatalog =
    records.metricCatalog.length === 0
      ? null
      : await repository.upsertMetricCatalog(records.metricCatalog);
  const dailySummaries =
    records.dailySummaries.length === 0
      ? null
      : await repository.upsertDailySummaries(records.dailySummaries);
  const dailyPageIdsByImportKey = pageIdsByImportKey(dailySummaries);
  const workerDecisions =
    records.workerDecisions.length === 0
      ? null
      : await repository.upsertWorkerDecisions(records.workerDecisions, {
          dailyPageIdsByImportKey,
        });
  const workerDecisionPageIdsByImportKey = pageIdsByImportKey(workerDecisions);
  const workouts =
    records.workouts.length === 0
      ? null
      : await repository.upsertWorkouts(records.workouts, {
          dailyPageIdsByImportKey,
          workerDecisionPageIdsByImportKey,
        });

  return {
    metricCatalog,
    dailySummaries,
    workerDecisions,
    workouts,
  };
}

function pageIdsByImportKey(
  result: CollectionWriteResult | null,
): Map<string, string> {
  const pageIds = new Map<string, string>();

  for (const record of result?.results ?? []) {
    if (record.pageId !== null) {
      pageIds.set(record.importKey, record.pageId);
    }
  }

  return pageIds;
}

export async function readAppleHealthExport(
  path: string,
): Promise<AppleHealthExport> {
  const contents = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(contents);

  return parseAppleHealthExport(parsed);
}

export function normalizeAppleHealthExport(
  fixture: AppleHealthExport,
  options: {
    timezone?: string;
    only?: HealthImportCollection[] | null;
  } = {},
): NormalizedHealthFixture {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const only = new Set(options.only ?? [
    "metricCatalog",
    "dailySummaries",
    "workerDecisions",
    "workouts",
  ]);
  const dailyMap = buildDailyMap(fixture, timezone);
  const workouts = only.has("workouts")
    ? normalizeWorkouts(fixture.workouts, dailyMap, timezone)
    : [];

  for (const workout of workouts) {
    const day = dailyMap.get(workout.localDate);
    if (!day) {
      continue;
    }

    day.workoutCount += 1;
    day.workoutTypes = sortedUnique([...day.workoutTypes, workout.workoutActivityType]);
    day.muscleGroupsTrained = sortedUnique([
      ...day.muscleGroupsTrained,
      ...workout.muscleGroups,
    ]);
    day.lastWorkoutAt =
      day.lastWorkoutAt === null || workout.end > day.lastWorkoutAt
        ? workout.end
        : day.lastWorkoutAt;
  }

  const finalizedDailySummaries = Array.from(dailyMap.values()).map(finalizeDailySummary);
  const dailySummaries = only.has("dailySummaries")
    ? finalizedDailySummaries
    : [];
  const workerDecisions = only.has("workerDecisions")
    ? (fixture.workerDecisions?.length ?? 0) > 0
      ? fixture.workerDecisions ?? []
      : finalizedDailySummaries.map(buildWorkerDecision)
    : [];

  return {
    schemaVersion: "health-fixture.v1",
    source: fixture.source,
    generatedAt: fixture.exported_at,
    timezone,
    window: fixture.window,
    metricCatalog: only.has("metricCatalog")
      ? buildMetricCatalog(fixture.metrics)
      : [],
    dailySummaries,
    workerDecisions,
    workouts,
  };
}

function parseAppleHealthExport(value: unknown): AppleHealthExport {
  if (!isRecord(value)) {
    throw new Error("Apple Health export must be a JSON object.");
  }

  if (typeof value.source !== "string") {
    throw new Error("Apple Health export is missing source.");
  }
  if (typeof value.exported_at !== "string" || !isValidDate(value.exported_at)) {
    throw new Error("Apple Health export is missing a valid exported_at.");
  }
  if (!isRecord(value.window)) {
    throw new Error("Apple Health export is missing window.");
  }
  if (
    typeof value.window.from !== "string" ||
    !isValidDate(value.window.from) ||
    typeof value.window.to !== "string" ||
    !isValidDate(value.window.to)
  ) {
    throw new Error("Apple Health export window must include valid from/to timestamps.");
  }
  if (!isRecord(value.metrics)) {
    throw new Error("Apple Health export is missing metrics.");
  }
  if (!Array.isArray(value.workouts)) {
    throw new Error("Apple Health export is missing workouts.");
  }

  return {
    source: value.source,
    exported_at: value.exported_at,
    window: {
      from: value.window.from,
      to: value.window.to,
    },
    metrics: parseMetrics(value.metrics),
    workouts: value.workouts.map(parseWorkout),
    workerDecisions: Array.isArray(value.workerDecisions)
      ? value.workerDecisions.map(parseWorkerDecision)
      : [],
  };
}

function parseMetrics(metrics: Record<string, unknown>): Record<string, HealthSample[]> {
  const parsed: Record<string, HealthSample[]> = {};

  for (const [identifier, samples] of Object.entries(metrics)) {
    if (!Array.isArray(samples)) {
      throw new Error(`Metric ${identifier} must be an array.`);
    }

    parsed[identifier] = samples.map((sample, index) =>
      parseHealthSample(identifier, index, sample),
    );
  }

  return parsed;
}

function parseHealthSample(
  identifier: string,
  index: number,
  value: unknown,
): HealthSample {
  if (!isRecord(value)) {
    throw new Error(`Metric ${identifier}[${index}] must be an object.`);
  }

  const sample = {
    start: value.start,
    end: value.end,
    value: value.value,
    unit: value.unit,
    uuid: value.uuid,
    source: value.source,
  };

  if (
    typeof sample.start !== "string" ||
    !isValidDate(sample.start) ||
    typeof sample.end !== "string" ||
    !isValidDate(sample.end) ||
    typeof sample.value !== "number" ||
    !Number.isFinite(sample.value) ||
    typeof sample.unit !== "string" ||
    typeof sample.uuid !== "string" ||
    typeof sample.source !== "string"
  ) {
    throw new Error(`Metric ${identifier}[${index}] has an invalid sample shape.`);
  }

  return sample as HealthSample;
}

function parseWorkout(value: unknown, index: number): HealthWorkout {
  if (!isRecord(value)) {
    throw new Error(`Workout ${index} must be an object.`);
  }
  if (
    typeof value.uuid !== "string" ||
    typeof value.startDate !== "string" ||
    !isValidDate(value.startDate) ||
    typeof value.endDate !== "string" ||
    !isValidDate(value.endDate)
  ) {
    throw new Error(`Workout ${index} is missing uuid/startDate/endDate.`);
  }

  return {
    uuid: value.uuid,
    startDate: value.startDate,
    endDate: value.endDate,
    workoutActivityTypeName:
      typeof value.workoutActivityTypeName === "string"
        ? value.workoutActivityTypeName
        : undefined,
    duration: parseQuantity(value.duration),
    totalEnergyBurned: parseQuantity(value.totalEnergyBurned),
    totalDistance: parseQuantity(value.totalDistance),
  };
}

function parseWorkerDecision(value: unknown, index: number): HealthWorkerDecision {
  if (!isRecord(value)) {
    throw new Error(`Worker decision ${index} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const requiredStrings = [
    "importKey",
    "name",
    "triggeredBy",
    "triggerTimestamp",
    "relatedDayImportKey",
    "decision",
    "suggestedModality",
    "suggestedIntensity",
    "reason",
    "status",
  ];

  for (const field of requiredStrings) {
    if (typeof record[field] !== "string") {
      throw new Error(`Worker decision ${index} is missing ${field}.`);
    }
  }
  if (!isValidDate(record.triggerTimestamp as string)) {
    throw new Error(`Worker decision ${index} has an invalid triggerTimestamp.`);
  }

  return {
    importKey: record.importKey as WorkerDecisionRecord["importKey"],
    name: record.name as string,
    triggeredBy: parseEnum(
      record.triggeredBy,
      ["health_data", "calendar_event", "manual", "daily_check"],
      `Worker decision ${index} triggeredBy`,
    ),
    triggerTimestamp: record.triggerTimestamp as string,
    relatedDayImportKey: record.relatedDayImportKey as string,
    decision: parseEnum(
      record.decision,
      ["create_workout", "skip", "reschedule", "rest_day"],
      `Worker decision ${index} decision`,
    ),
    suggestedModality: parseEnum(
      record.suggestedModality,
      ["walk", "run", "strength", "mobility", "yoga"],
      `Worker decision ${index} suggestedModality`,
    ),
    suggestedIntensity: parseEnum(
      record.suggestedIntensity,
      ["light", "moderate", "hard"],
      `Worker decision ${index} suggestedIntensity`,
    ),
    suggestedMuscleGroups: parseStringArray(
      record.suggestedMuscleGroups,
      `Worker decision ${index} suggestedMuscleGroups`,
    ),
    avoidMuscleGroups: parseStringArray(
      record.avoidMuscleGroups,
      `Worker decision ${index} avoidMuscleGroups`,
    ),
    reason: record.reason as string,
    inputSnapshotJson:
      typeof record.inputSnapshotJson === "string"
        ? record.inputSnapshotJson
        : JSON.stringify({ imported: true }),
    createdCalendarEventId:
      typeof record.createdCalendarEventId === "string"
        ? record.createdCalendarEventId
        : null,
    status: parseEnum(
      record.status,
      ["proposed", "created", "failed", "dismissed"],
      `Worker decision ${index} status`,
    ),
    confidence:
      typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? record.confidence
        : null,
  };
}

function parseQuantity(value: unknown): Quantity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.unit !== "string" || typeof value.quantity !== "number") {
    return undefined;
  }

  return {
    unit: value.unit,
    quantity: value.quantity,
  };
}

function buildMetricCatalog(
  metrics: Record<string, HealthSample[]>,
): MetricCatalogRecord[] {
  return Object.entries(metrics)
    .map(([identifier, samples]) => {
      const definition = METRIC_DEFINITIONS[identifier] ?? {
        metric: humanizeHealthKitIdentifier(identifier),
        defaultUnit: samples[0]?.unit ?? "unknown",
        aggregationStyle: "latest",
        importLevel: "ignore",
        workerRelevance: [],
        privacySensitivity: "medium" as const,
      };

      return {
        importKey: `metric:${identifier}`,
        metric: definition.metric,
        healthKitIdentifier: identifier,
        sampleKind: "quantity" as const,
        defaultUnit: definition.defaultUnit,
        aggregationStyle: definition.aggregationStyle,
        importLevel: definition.importLevel,
        workerRelevance: definition.workerRelevance,
        enabled: definition.importLevel !== "ignore" && samples.length > 0,
        privacySensitivity: definition.privacySensitivity,
        sampleCount: samples.length,
      };
    })
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

function buildDailyMap(
  fixture: AppleHealthExport,
  timezone: string,
): Map<string, MutableDailySummary> {
  const map = new Map<string, MutableDailySummary>();

  for (const date of enumerateLocalDates(
    fixture.window.from,
    fixture.window.to,
    timezone,
  )) {
    map.set(date, emptyDailySummary(date, timezone, fixture.exported_at));
  }

  for (const [identifier, samples] of Object.entries(fixture.metrics)) {
    for (const sample of samples) {
      const date = localDate(sample.start, timezone);
      const day = getOrCreateDailySummary(map, date, timezone, fixture.exported_at);

      applySampleToDailySummary(day, identifier, sample);
    }
  }

  return map;
}

function applySampleToDailySummary(
  day: MutableDailySummary,
  identifier: string,
  sample: HealthSample,
): void {
  switch (identifier) {
    case "HKQuantityTypeIdentifierStepCount":
      day.steps += sample.value;
      break;
    case "HKQuantityTypeIdentifierActiveEnergyBurned":
      day.activeEnergyKcal += sample.value;
      break;
    case "HKQuantityTypeIdentifierAppleExerciseTime":
      day.exerciseMinutes += sample.value;
      break;
    case "HKQuantityTypeIdentifierAppleStandTime":
      day.standMinutes += sample.value;
      break;
    case "HKQuantityTypeIdentifierDistanceWalkingRunning":
      day.walkingRunningDistanceKm += toKilometers(sample.value, sample.unit);
      break;
    case "HKQuantityTypeIdentifierDistanceCycling":
      day.cyclingDistanceKm += toKilometers(sample.value, sample.unit);
      break;
    case "HKQuantityTypeIdentifierHeartRate":
      day.heartRateValues.push(sample.value);
      break;
    case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
      day.hrvValues.push(sample.value);
      break;
    case "HKQuantityTypeIdentifierRestingHeartRate":
      day.restingHrSamples.push(sample);
      break;
    case "HKQuantityTypeIdentifierVO2Max":
      day.vo2MaxSamples.push(sample);
      break;
  }
}

function normalizeWorkouts(
  workouts: HealthWorkout[],
  dailyMap: Map<string, MutableDailySummary>,
  timezone: string,
): WorkoutRecord[] {
  return workouts
    .map((workout) => {
      const activityType = workout.workoutActivityTypeName ?? "other";
      const local = localDate(workout.startDate, timezone);
      const profile = workoutProfile(activityType);
      getOrCreateDailySummary(dailyMap, local, timezone, workout.endDate);

      return {
        importKey: `workout:${workout.uuid}`,
        name: `${titleCase(activityType)} - ${local}`,
        source: "apple_health" as const,
        status: "completed" as const,
        hkWorkoutUuid: workout.uuid,
        start: workout.startDate,
        end: workout.endDate,
        localDate: local,
        durationMinutes: round(
          workout.duration ? toMinutes(workout.duration) : minutesBetween(workout.startDate, workout.endDate),
        ),
        workoutActivityType: activityType,
        modality: profile.modality,
        muscleGroups: profile.muscleGroups,
        movementPattern: profile.movementPattern,
        intensity: profile.intensity,
        activeEnergyKcal: workout.totalEnergyBurned
          ? round(toKilocalories(workout.totalEnergyBurned))
          : null,
        distanceKm: workout.totalDistance
          ? round(toKilometers(workout.totalDistance.quantity, workout.totalDistance.unit))
          : null,
        relatedDayImportKey: `daily:${local}`,
        relatedPlanImportKey: null,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function buildWorkerDecision(summary: DailySummaryRecord): WorkerDecisionRecord {
  const decision = summary.completedWorkout
    ? "skip"
    : summary.needsWorkout
      ? "create_workout"
      : summary.recommendedIntensity === "rest"
        ? "rest_day"
        : "skip";
  const suggestedIntensity =
    summary.recommendedIntensity === "rest"
      ? "light"
      : summary.recommendedIntensity;
  const avoidMuscleGroups = summary.completedWorkout
    ? summary.muscleGroupsTrained
    : [];
  const suggestedMuscleGroups =
    summary.recommendedModality === "strength"
      ? nextStrengthMuscleGroups(avoidMuscleGroups)
      : summary.recommendedModality === "mobility" || summary.recommendedModality === "yoga"
        ? ["core", "full body"]
        : ["legs"];

  return {
    importKey: `decision:${summary.date}-health-check`,
    name: `Workout decision - ${summary.date}`,
    triggeredBy: "health_data",
    triggerTimestamp: summary.lastHealthSyncAt,
    relatedDayImportKey: summary.importKey,
    decision,
    suggestedModality: summary.recommendedModality,
    suggestedIntensity,
    suggestedMuscleGroups,
    avoidMuscleGroups,
    reason: summary.recommendationReason,
    inputSnapshotJson: JSON.stringify({
      date: summary.date,
      completedWorkout: summary.completedWorkout,
      steps: summary.steps,
      exerciseMinutes: summary.exerciseMinutes,
      workoutCount: summary.workoutCount,
      readiness: summary.readiness,
      slackingScore: summary.slackingScore,
      needsWorkout: summary.needsWorkout,
      recommendedModality: summary.recommendedModality,
      recommendedIntensity: summary.recommendedIntensity,
      dataCompleteness: summary.dataCompleteness,
    }),
    createdCalendarEventId: null,
    status: "proposed",
    confidence: decision === "create_workout" ? 0.72 : 0.65,
  };
}

function finalizeDailySummary(day: MutableDailySummary): DailySummaryRecord {
  const avgHeartRate = average(day.heartRateValues);
  const hrvSdnn = average(day.hrvValues);
  const restingHr = latestValue(day.restingHrSamples);
  const vo2Max = latestValue(day.vo2MaxSamples);
  const completedWorkout = day.workoutCount > 0 || day.exerciseMinutes >= 20;
  const trainingLoad = round(
    day.exerciseMinutes + day.activeEnergyKcal / 10 + day.workoutCount * 10,
  );
  const recoveryScore = computeRecoveryScore(restingHr, hrvSdnn);
  const readiness =
    recoveryScore === null
      ? "medium"
      : recoveryScore >= 75
        ? "high"
        : recoveryScore >= 50
          ? "medium"
          : "low";
  const slackingScore = computeSlackingScore(day, completedWorkout);
  const needsWorkout = !completedWorkout && slackingScore >= 55;
  const recommendedIntensity = needsWorkout
    ? readiness === "low"
      ? "light"
      : "moderate"
    : "rest";
  const recommendedModality = needsWorkout
    ? day.steps < 5_000
      ? "walk"
      : "mobility"
    : "walk";
  const missingSleep = true;
  const missingActivity =
    day.steps === 0 &&
    day.activeEnergyKcal === 0 &&
    day.exerciseMinutes === 0 &&
    day.workoutCount === 0;

  return {
    importKey: day.importKey,
    name: day.name,
    date: day.date,
    timezone: day.timezone,
    steps: Math.round(day.steps),
    activeEnergyKcal: round(day.activeEnergyKcal),
    exerciseMinutes: round(day.exerciseMinutes),
    standMinutes: round(day.standMinutes),
    walkingRunningDistanceKm: round(day.walkingRunningDistanceKm),
    cyclingDistanceKm: round(day.cyclingDistanceKm),
    workoutCount: day.workoutCount,
    completedWorkout,
    workoutTypes: day.workoutTypes,
    muscleGroupsTrained: day.muscleGroupsTrained,
    trainingLoad,
    lastWorkoutAt: day.lastWorkoutAt,
    restingHr,
    hrvSdnn,
    avgHeartRate,
    vo2Max,
    recoveryScore,
    readiness,
    slackingScore,
    needsWorkout,
    recommendedIntensity,
    recommendedModality,
    recommendationReason: recommendationReason({
      completedWorkout,
      slackingScore,
      readiness,
      steps: day.steps,
      exerciseMinutes: day.exerciseMinutes,
      workoutCount: day.workoutCount,
    }),
    dataCompleteness: missingActivity
      ? "missing activity"
      : missingSleep
        ? "missing sleep"
        : "complete",
    lastHealthSyncAt: day.lastHealthSyncAt,
  };
}

function emptyDailySummary(
  date: string,
  timezone: string,
  lastHealthSyncAt: string,
): MutableDailySummary {
  return {
    importKey: `daily:${date}`,
    name: date,
    date,
    timezone,
    steps: 0,
    activeEnergyKcal: 0,
    exerciseMinutes: 0,
    standMinutes: 0,
    walkingRunningDistanceKm: 0,
    cyclingDistanceKm: 0,
    workoutCount: 0,
    workoutTypes: [],
    muscleGroupsTrained: [],
    lastWorkoutAt: null,
    restingHr: null,
    hrvSdnn: null,
    avgHeartRate: null,
    vo2Max: null,
    lastHealthSyncAt,
    heartRateValues: [],
    hrvValues: [],
    restingHrSamples: [],
    vo2MaxSamples: [],
  };
}

function getOrCreateDailySummary(
  map: Map<string, MutableDailySummary>,
  date: string,
  timezone: string,
  lastHealthSyncAt: string,
): MutableDailySummary {
  const existing = map.get(date);
  if (existing) {
    return existing;
  }

  const created = emptyDailySummary(date, timezone, lastHealthSyncAt);
  map.set(date, created);
  return created;
}

function enumerateLocalDates(
  from: string,
  to: string,
  timezone: string,
): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  let cursor = Date.parse(from);
  const end = Date.parse(to);
  const oneDayMs = 24 * 60 * 60 * 1000;

  while (cursor <= end) {
    const date = localDate(new Date(cursor).toISOString(), timezone);
    if (!seen.has(date)) {
      dates.push(date);
      seen.add(date);
    }
    cursor += oneDayMs;
  }

  const endDate = localDate(to, timezone);
  if (!seen.has(endDate)) {
    dates.push(endDate);
  }

  return dates.sort();
}

function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function workoutProfile(activityType: string): {
  modality: WorkoutRecord["modality"];
  muscleGroups: string[];
  movementPattern: string[];
  intensity: WorkoutRecord["intensity"];
} {
  switch (activityType) {
    case "cycling":
      return {
        modality: "cardio",
        muscleGroups: ["legs"],
        movementPattern: ["squat"],
        intensity: "moderate",
      };
    case "stairClimbing":
      return {
        modality: "cardio",
        muscleGroups: ["legs"],
        movementPattern: ["squat"],
        intensity: "hard",
      };
    case "traditionalStrengthTraining":
    case "functionalStrengthTraining":
      return {
        modality: "strength",
        muscleGroups: ["full body"],
        movementPattern: ["push", "pull", "squat", "hinge"],
        intensity: "moderate",
      };
    case "yoga":
      return {
        modality: "mobility",
        muscleGroups: ["core", "full body"],
        movementPattern: ["rotation"],
        intensity: "easy",
      };
    case "walking":
    default:
      return {
        modality: "cardio",
        muscleGroups: ["legs"],
        movementPattern: ["carry"],
        intensity: "easy",
      };
  }
}

function computeRecoveryScore(
  restingHr: number | null,
  hrvSdnn: number | null,
): number | null {
  if (restingHr === null && hrvSdnn === null) {
    return null;
  }

  let score = 65;
  if (restingHr !== null) {
    score += Math.max(-20, Math.min(15, 65 - restingHr));
  }
  if (hrvSdnn !== null) {
    score += Math.max(-15, Math.min(20, (hrvSdnn - 30) / 2));
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

function computeSlackingScore(
  day: Pick<
    MutableDailySummary,
    "steps" | "exerciseMinutes" | "activeEnergyKcal" | "workoutCount"
  >,
  completedWorkout: boolean,
): number {
  let score = 100;
  score -= Math.min(40, day.steps / 250);
  score -= Math.min(35, day.exerciseMinutes * 1.5);
  score -= Math.min(20, day.activeEnergyKcal / 15);
  score -= day.workoutCount * 20;

  if (completedWorkout) {
    score -= 25;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

function recommendationReason(input: {
  completedWorkout: boolean;
  slackingScore: number;
  readiness: "low" | "medium" | "high";
  steps: number;
  exerciseMinutes: number;
  workoutCount: number;
}): string {
  if (input.completedWorkout) {
    return `Completed ${input.workoutCount} workout(s) and ${round(input.exerciseMinutes)} exercise minutes today.`;
  }
  if (input.slackingScore >= 55) {
    return `No completed workout detected; ${Math.round(input.steps)} steps and readiness is ${input.readiness}.`;
  }

  return `Activity is sufficient for now with ${Math.round(input.steps)} steps.`;
}

function latestValue(samples: HealthSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  const latest = samples.reduce((current, sample) =>
    sample.end > current.end ? sample : current,
  );

  return round(latest.value);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toMinutes(quantity: Quantity): number {
  if (quantity.unit === "s") {
    return quantity.quantity / 60;
  }
  if (quantity.unit === "min") {
    return quantity.quantity;
  }

  return quantity.quantity;
}

function minutesBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 60_000;
}

function toKilometers(value: number, unit: string): number {
  if (unit === "meters" || unit === "m") {
    return value / 1_000;
  }
  if (unit === "mi" || unit === "mile") {
    return value * 1.609344;
  }

  return value;
}

function toKilocalories(quantity: Quantity): number {
  return quantity.quantity;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeHealthKitIdentifier(identifier: string): string {
  return identifier
    .replace(/^HK[A-Za-z]+TypeIdentifier/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new Error(`${field} must contain only strings.`);
  }

  return value;
}

function parseEnum<const T extends string>(
  value: unknown,
  options: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${field} must be one of: ${options.join(", ")}.`);
  }

  return value as T;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
