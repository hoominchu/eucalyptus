export type HealthImportConfig = {
  notionApiToken: string;
  metricCatalogDataSourceId: string;
  dailySummaryDataSourceId: string;
  workoutsDataSourceId: string;
  workerDecisionsDataSourceId: string;
  notionVersion: string;
};

export function loadHealthImportConfig(
  env: NodeJS.ProcessEnv = process.env,
): HealthImportConfig {
  return {
    notionApiToken: requireAnyEnv(env, ["WORKER_NOTION_API_TOKEN", "NOTION_API_TOKEN"]),
    metricCatalogDataSourceId: requireEnv(env, "METRIC_CATALOG_DATA_SOURCE_ID"),
    dailySummaryDataSourceId: requireEnv(env, "DAILY_SUMMARY_DATA_SOURCE_ID"),
    workoutsDataSourceId: requireEnv(env, "WORKOUTS_DATA_SOURCE_ID"),
    workerDecisionsDataSourceId: requireEnv(env, "WORKER_DECISIONS_DATA_SOURCE_ID"),
    notionVersion: env.NOTION_VERSION ?? "2026-03-11",
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function requireAnyEnv(env: NodeJS.ProcessEnv, keys: string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${keys.join(" or ")}`);
}
