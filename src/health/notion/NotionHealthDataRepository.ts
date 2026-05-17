import type {
  DailySummaryRecord,
  MetricCatalogRecord,
  WorkerDecisionRecord,
  WorkoutRecord,
} from "../importHealthFixture.ts";

export type NotionHealthConfig = {
  notionApiToken: string;
  metricCatalogDataSourceId: string;
  dailySummaryDataSourceId: string;
  workoutsDataSourceId: string;
  workerDecisionsDataSourceId: string;
  notionVersion: string;
};

export type WriteStatus = "created" | "updated" | "failed";

export type RecordWriteResult = {
  importKey: string;
  status: WriteStatus;
  pageId: string | null;
  error: string | null;
};

export type CollectionWriteResult = {
  collection: "metricCatalog" | "dailySummaries" | "workerDecisions" | "workouts";
  created: number;
  updated: number;
  failed: number;
  results: RecordWriteResult[];
};

export type RelationWriteOptions = {
  dailyPageIdsByImportKey?: Map<string, string>;
  workerDecisionPageIdsByImportKey?: Map<string, string>;
};

type NotionPage = {
  id: string;
};

type NotionQueryResponse = {
  results: NotionPage[];
};

type NotionProperties = Record<string, unknown>;

export class NotionHealthDataRepository {
  private readonly config: NotionHealthConfig;
  private lastRequestAt = 0;

  constructor(config: NotionHealthConfig) {
    this.config = config;
  }

  async upsertMetricCatalog(
    records: MetricCatalogRecord[],
  ): Promise<CollectionWriteResult> {
    const results: RecordWriteResult[] = [];

    for (const record of records) {
      try {
        const existingPageId = await this.findMetricCatalogPage(
          this.config.metricCatalogDataSourceId,
          record.healthKitIdentifier,
        );
        const properties = metricCatalogToNotionProperties(record);

        if (existingPageId) {
          await this.updatePage(existingPageId, properties);
          results.push({
            importKey: record.importKey,
            status: "updated",
            pageId: existingPageId,
            error: null,
          });
        } else {
          const page = await this.createPage(
            this.config.metricCatalogDataSourceId,
            properties,
          );
          results.push({
            importKey: record.importKey,
            status: "created",
            pageId: page.id,
            error: null,
          });
        }
      } catch (error) {
        results.push({
          importKey: record.importKey,
          status: "failed",
          pageId: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      collection: "metricCatalog",
      ...summarizeWriteResults(results),
      results,
    };
  }

  async upsertDailySummaries(
    records: DailySummaryRecord[],
  ): Promise<CollectionWriteResult> {
    const results: RecordWriteResult[] = [];

    for (const record of records) {
      try {
        const existingPageId = await this.findDailySummaryPage(
          this.config.dailySummaryDataSourceId,
          record.date,
        );
        const properties = dailySummaryToNotionProperties(record);

        if (existingPageId) {
          await this.updatePage(existingPageId, properties);
          results.push({
            importKey: record.importKey,
            status: "updated",
            pageId: existingPageId,
            error: null,
          });
        } else {
          const page = await this.createPage(
            this.config.dailySummaryDataSourceId,
            properties,
          );
          results.push({
            importKey: record.importKey,
            status: "created",
            pageId: page.id,
            error: null,
          });
        }
      } catch (error) {
        results.push({
          importKey: record.importKey,
          status: "failed",
          pageId: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      collection: "dailySummaries",
      ...summarizeWriteResults(results),
      results,
    };
  }

  async upsertWorkerDecisions(
    records: WorkerDecisionRecord[],
    options: RelationWriteOptions = {},
  ): Promise<CollectionWriteResult> {
    const results: RecordWriteResult[] = [];

    for (const record of records) {
      try {
        const relatedDayPageId = await this.resolveDailyPageId(
          record.relatedDayImportKey,
          options.dailyPageIdsByImportKey,
        );
        const existingPageId = await this.findWorkerDecisionPage(
          this.config.workerDecisionsDataSourceId,
          record.importKey,
        );
        const properties = workerDecisionToNotionProperties(record, {
          relatedDayPageId,
        });

        if (existingPageId) {
          await this.updatePage(existingPageId, properties);
          results.push({
            importKey: record.importKey,
            status: "updated",
            pageId: existingPageId,
            error: null,
          });
        } else {
          const page = await this.createPage(
            this.config.workerDecisionsDataSourceId,
            properties,
          );
          results.push({
            importKey: record.importKey,
            status: "created",
            pageId: page.id,
            error: null,
          });
        }
      } catch (error) {
        results.push({
          importKey: record.importKey,
          status: "failed",
          pageId: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      collection: "workerDecisions",
      ...summarizeWriteResults(results),
      results,
    };
  }

  async upsertWorkouts(
    records: WorkoutRecord[],
    options: RelationWriteOptions = {},
  ): Promise<CollectionWriteResult> {
    const results: RecordWriteResult[] = [];

    for (const record of records) {
      try {
        const relatedDayPageId = await this.resolveDailyPageId(
          record.relatedDayImportKey,
          options.dailyPageIdsByImportKey,
        );
        const relatedPlanPageId =
          record.relatedPlanImportKey === null
            ? null
            : await this.resolveWorkerDecisionPageId(
                record.relatedPlanImportKey,
                options.workerDecisionPageIdsByImportKey,
              );
        const existingPageId = await this.findWorkoutPage(
          this.config.workoutsDataSourceId,
          record.hkWorkoutUuid,
        );
        const properties = workoutToNotionProperties(record, {
          relatedDayPageId,
          relatedPlanPageId,
        });

        if (existingPageId) {
          await this.updatePage(existingPageId, properties);
          results.push({
            importKey: record.importKey,
            status: "updated",
            pageId: existingPageId,
            error: null,
          });
        } else {
          const page = await this.createPage(
            this.config.workoutsDataSourceId,
            properties,
          );
          results.push({
            importKey: record.importKey,
            status: "created",
            pageId: page.id,
            error: null,
          });
        }
      } catch (error) {
        results.push({
          importKey: record.importKey,
          status: "failed",
          pageId: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      collection: "workouts",
      ...summarizeWriteResults(results),
      results,
    };
  }

  private async findMetricCatalogPage(
    dataSourceId: string,
    healthKitIdentifier: string,
  ): Promise<string | null> {
    const response = await this.request<NotionQueryResponse>(
      `/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: {
          page_size: 1,
          filter: {
            property: "HealthKit Identifier",
            rich_text: {
              equals: healthKitIdentifier,
            },
          },
        },
      },
    );

    return response.results[0]?.id ?? null;
  }

  private async findDailySummaryPage(
    dataSourceId: string,
    date: string,
  ): Promise<string | null> {
    const response = await this.request<NotionQueryResponse>(
      `/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: {
          page_size: 1,
          filter: {
            property: "Date",
            date: {
              equals: date,
            },
          },
        },
      },
    );

    return response.results[0]?.id ?? null;
  }

  private async findWorkoutPage(
    dataSourceId: string,
    hkWorkoutUuid: string,
  ): Promise<string | null> {
    const response = await this.request<NotionQueryResponse>(
      `/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: {
          page_size: 1,
          filter: {
            property: "HK Workout UUID",
            rich_text: {
              equals: hkWorkoutUuid,
            },
          },
        },
      },
    );

    return response.results[0]?.id ?? null;
  }

  private async findWorkerDecisionPage(
    dataSourceId: string,
    importKey: string,
  ): Promise<string | null> {
    const response = await this.request<NotionQueryResponse>(
      `/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: {
          page_size: 1,
          filter: {
            property: "Import Key",
            rich_text: {
              equals: importKey,
            },
          },
        },
      },
    );

    return response.results[0]?.id ?? null;
  }

  private async resolveDailyPageId(
    importKey: string,
    pageIdsByImportKey?: Map<string, string>,
  ): Promise<string> {
    const mappedPageId = pageIdsByImportKey?.get(importKey);
    if (mappedPageId) {
      return mappedPageId;
    }

    const date = importKey.replace(/^daily:/, "");
    const pageId = await this.findDailySummaryPage(
      this.config.dailySummaryDataSourceId,
      date,
    );
    if (pageId === null) {
      throw new Error(`Could not resolve Related Day for ${importKey}.`);
    }

    return pageId;
  }

  private async resolveWorkerDecisionPageId(
    importKey: string,
    pageIdsByImportKey?: Map<string, string>,
  ): Promise<string> {
    const mappedPageId = pageIdsByImportKey?.get(importKey);
    if (mappedPageId) {
      return mappedPageId;
    }

    const pageId = await this.findWorkerDecisionPage(
      this.config.workerDecisionsDataSourceId,
      importKey,
    );
    if (pageId === null) {
      throw new Error(`Could not resolve Related Plan for ${importKey}.`);
    }

    return pageId;
  }

  private async createPage(
    dataSourceId: string,
    properties: NotionProperties,
  ): Promise<NotionPage> {
    return this.request<NotionPage>("/v1/pages", {
      method: "POST",
      body: {
        parent: {
          type: "data_source_id",
          data_source_id: dataSourceId,
        },
        properties,
      },
    });
  }

  private async updatePage(
    pageId: string,
    properties: NotionProperties,
  ): Promise<NotionPage> {
    return this.request<NotionPage>(`/v1/pages/${pageId}`, {
      method: "PATCH",
      body: {
        properties,
      },
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: "POST" | "PATCH";
      body: unknown;
    },
  ): Promise<T> {
    await this.waitForRateLimitSlot();

    const url = `https://api.notion.com${path}`;
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.config.notionApiToken}`,
        "Content-Type": "application/json",
        "Notion-Version": this.config.notionVersion,
      },
      body: JSON.stringify(options.body),
    });

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "1");
      await delay(Math.max(1, retryAfterSeconds) * 1_000);

      return this.request<T>(path, options);
    }

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message =
        isRecord(json) && typeof json.message === "string"
          ? json.message
          : text;
      throw new Error(
        `Notion API ${options.method} ${path} failed with ${response.status}: ${message}`,
      );
    }

    return json as T;
  }

  private async waitForRateLimitSlot(): Promise<void> {
    const minSpacingMs = 350;
    const now = Date.now();
    const waitMs = this.lastRequestAt + minSpacingMs - now;

    if (waitMs > 0) {
      await delay(waitMs);
    }

    this.lastRequestAt = Date.now();
  }
}

export function metricCatalogToNotionProperties(
  record: MetricCatalogRecord,
): NotionProperties {
  return {
    Metric: title(record.metric),
    "HealthKit Identifier": richText(record.healthKitIdentifier),
    "Sample Kind": select(record.sampleKind),
    "Default Unit": select(record.defaultUnit),
    "Aggregation Style": select(record.aggregationStyle),
    "Import Level": select(record.importLevel),
    "Worker Relevance": multiSelect(record.workerRelevance),
    "Permission Required": checkbox(record.enabled),
    "Enabled?": checkbox(record.enabled),
    "Privacy Sensitivity": select(record.privacySensitivity),
  };
}

export function dailySummaryToNotionProperties(
  record: DailySummaryRecord,
): NotionProperties {
  return {
    Name: title(record.name),
    Date: date(record.date),
    Timezone: select(record.timezone),
    Steps: number(record.steps),
    "Active Energy kcal": number(record.activeEnergyKcal),
    "Exercise Minutes": number(record.exerciseMinutes),
    "Workout Count": number(record.workoutCount),
    "Completed Workout?": checkbox(record.completedWorkout),
    "Workout Types": multiSelect(record.workoutTypes.map(toDailyWorkoutType)),
    "Muscle Groups Trained": multiSelect(record.muscleGroupsTrained),
    "Training Load": number(record.trainingLoad),
    "Last Workout At": nullableDate(record.lastWorkoutAt),
    "Resting HR": nullableNumber(record.restingHr),
    "HRV SDNN": nullableNumber(record.hrvSdnn),
    "Recovery Score": nullableNumber(record.recoveryScore),
    Readiness: select(record.readiness),
    "Slacking Score": number(record.slackingScore),
    "Needs Workout?": checkbox(record.needsWorkout),
    "Recommended Intensity": select(record.recommendedIntensity),
    "Recommended Modality": select(record.recommendedModality),
    "Recommendation Reason": richText(record.recommendationReason),
    "Last Health Sync At": dateTime(record.lastHealthSyncAt),
    "Data Completeness": select(record.dataCompleteness),
  };
}

export function workerDecisionToNotionProperties(
  record: WorkerDecisionRecord,
  relations: {
    relatedDayPageId: string;
  },
): NotionProperties {
  return {
    Name: title(record.name),
    "Import Key": richText(record.importKey),
    "Triggered By": select(record.triggeredBy),
    "Trigger Timestamp": dateTime(record.triggerTimestamp),
    "Related Day": relation([relations.relatedDayPageId]),
    Decision: select(record.decision),
    "Suggested Modality": select(record.suggestedModality),
    "Suggested Intensity": select(record.suggestedIntensity),
    "Suggested Muscle Groups": multiSelect(record.suggestedMuscleGroups),
    "Avoid Muscle Groups": multiSelect(record.avoidMuscleGroups),
    Reason: richText(record.reason),
    "Input Snapshot JSON": richText(record.inputSnapshotJson),
    "Created Calendar Event ID": richText(record.createdCalendarEventId ?? ""),
    Status: status(record.status),
    Confidence: nullableNumber(record.confidence),
  };
}

export function workoutToNotionProperties(
  record: WorkoutRecord,
  relations: {
    relatedDayPageId?: string | null;
    relatedPlanPageId?: string | null;
  } = {},
): NotionProperties {
  return {
    Name: title(record.name),
    Source: select(record.source),
    Status: status(record.status),
    "HK Workout UUID": richText(record.hkWorkoutUuid),
    Start: dateTime(record.start),
    End: dateTime(record.end),
    "Local Date": date(record.localDate),
    "Duration Minutes": number(record.durationMinutes),
    "Workout Activity Type": select(toWorkoutActivityType(record.workoutActivityType)),
    Modality: select(record.modality),
    "Muscle Groups": multiSelect(record.muscleGroups),
    "Movement Pattern": multiSelect(record.movementPattern),
    Intensity: select(record.intensity),
    "Active Energy kcal": nullableNumber(record.activeEnergyKcal),
    Distance: nullableNumber(record.distanceKm),
    "Location Type": select("outdoor"),
    "Related Day": relation(optionalRelationId(relations.relatedDayPageId)),
    "Related Plan": relation(optionalRelationId(relations.relatedPlanPageId)),
    Notes: richText(`Imported from Apple Health. Related day: ${record.relatedDayImportKey}`),
  };
}

function title(content: string): unknown {
  return {
    title: [
      {
        text: {
          content,
        },
      },
    ],
  };
}

function richText(content: string): unknown {
  const safeContent = content.slice(0, 2_000);

  return {
    rich_text: safeContent
      ? [
          {
            text: {
              content: safeContent,
            },
          },
        ]
      : [],
  };
}

function relation(pageIds: string[]): unknown {
  return {
    relation: pageIds.map((id) => ({
      id,
    })),
  };
}

function optionalRelationId(pageId: string | null | undefined): string[] {
  return pageId ? [pageId] : [];
}

function date(start: string): unknown {
  return {
    date: {
      start,
    },
  };
}

function dateTime(start: string): unknown {
  return {
    date: {
      start,
    },
  };
}

function nullableDate(start: string | null): unknown {
  return {
    date: start === null ? null : { start },
  };
}

function select(name: string): unknown {
  return {
    select: {
      name,
    },
  };
}

function multiSelect(names: string[]): unknown {
  return {
    multi_select: Array.from(new Set(names)).map((name) => ({ name })),
  };
}

function checkbox(value: boolean): unknown {
  return {
    checkbox: value,
  };
}

function number(value: number): unknown {
  return {
    number: value,
  };
}

function nullableNumber(value: number | null): unknown {
  return {
    number: value,
  };
}

function status(name: string): unknown {
  return {
    status: {
      name,
    },
  };
}

function summarizeWriteResults(results: RecordWriteResult[]): {
  created: number;
  updated: number;
  failed: number;
} {
  return {
    created: results.filter((result) => result.status === "created").length,
    updated: results.filter((result) => result.status === "updated").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
}

function toDailyWorkoutType(activityType: string): string {
  switch (activityType) {
    case "cycling":
      return "cycling";
    case "running":
      return "run";
    case "yoga":
      return "yoga";
    case "traditionalStrengthTraining":
    case "functionalStrengthTraining":
      return "strength";
    case "walking":
    case "stairClimbing":
    default:
      return "walk";
  }
}

function toWorkoutActivityType(activityType: string): string {
  switch (activityType) {
    case "cycling":
      return "cycling";
    case "running":
      return "running";
    case "traditionalStrengthTraining":
      return "traditional strength";
    case "functionalStrengthTraining":
      return "functional strength";
    case "yoga":
      return "yoga";
    case "walking":
    case "stairClimbing":
    default:
      return "walking";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
