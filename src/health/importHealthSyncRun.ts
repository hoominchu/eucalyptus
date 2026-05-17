import {
  importHealthJsonText,
  type HealthImportCollection,
  type ImportHealthFixtureResult,
} from "./importHealthFixture.ts";

export type ImportHealthSyncRunInput = {
  pageId: string | null;
  dryRun: boolean;
  only: HealthImportCollection[] | null;
};

export type ImportHealthSyncRunResult = {
  pageId: string;
  fileName: string | null;
  importResult: ImportHealthFixtureResult;
};

type NotionFileValue =
  | {
      type: "file";
      name?: string;
      file: {
        url: string;
      };
    }
  | {
      type: "external";
      name?: string;
      external: {
        url: string;
      };
    }
  | {
      type: "file_upload";
      name?: string;
      file_upload: {
        id: string;
      };
    };

type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
};

type NotionQueryResponse = {
  results: NotionPage[];
};

type NotionBlockListResponse = {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

type NotionBlock = {
  type: string;
  code?: {
    rich_text?: NotionRichText[];
    caption?: NotionRichText[];
  };
};

type NotionRichText = {
  plain_text?: string;
  text?: {
    content?: string;
  };
};

export async function importHealthSyncRun(
  input: ImportHealthSyncRunInput,
): Promise<ImportHealthSyncRunResult> {
  const config = loadHealthSyncRunConfig();
  const pageId = input.pageId === null
    ? await findLatestUploadedSyncRun(config)
    : normalizeNotionPageId(input.pageId);
  const page = await notionRequest<NotionPage>(config, `/v1/pages/${pageId}`, {
    method: "GET",
  });
  const file = firstHealthPayloadFile(page);
  const contents = file
    ? await downloadFileText(config, file)
    : await readInlinePayloadText(config, pageId);
  const importResult = await importHealthJsonText({
    contents,
    dryRun: input.dryRun,
    only: input.only,
  });

  if (!input.dryRun) {
    await markSyncRunComplete(config, pageId, importResult);
  }

  return {
    pageId,
    fileName: file?.name ?? null,
    importResult,
  };
}

function loadHealthSyncRunConfig(): {
  notionApiToken: string;
  healthSyncRunsDataSourceId: string;
  notionVersion: string;
} {
  return {
    notionApiToken: requireAnyEnv(["WORKER_NOTION_API_TOKEN", "NOTION_API_TOKEN"]),
    healthSyncRunsDataSourceId: requireEnv("HEALTH_SYNC_RUNS_DATA_SOURCE_ID"),
    notionVersion: process.env.NOTION_VERSION ?? "2026-03-11",
  };
}

async function findLatestUploadedSyncRun(config: {
  notionApiToken: string;
  healthSyncRunsDataSourceId: string;
  notionVersion: string;
}): Promise<string> {
  const response = await notionRequest<NotionQueryResponse>(
    config,
    `/v1/data_sources/${config.healthSyncRunsDataSourceId}/query`,
    {
      method: "POST",
      body: {
        page_size: 1,
        sorts: [
          {
            property: "Started At",
            direction: "descending",
          },
        ],
      },
    },
  );
  const pageId = response.results[0]?.id;
  if (!pageId) {
    throw new Error("No Health Sync Runs rows found.");
  }

  return pageId;
}

export function normalizeNotionPageId(value: string): string {
  const trimmed = value.trim();
  const withoutQueryOrHash = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const dashedIdMatch = withoutQueryOrHash.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  const compactIdMatch = withoutQueryOrHash.match(/[0-9a-fA-F]{32}/);
  const id = dashedIdMatch?.[0] ?? compactIdMatch?.[0];

  if (!id) {
    throw new Error(
      `Invalid Notion page ID or URL: ${value}. Expected a raw page ID or Notion page URL.`,
    );
  }

  return id.replaceAll("-", "").toLowerCase();
}

function firstHealthPayloadFile(page: NotionPage): NotionFileValue | null {
  const property = page.properties["Payload File"];
  if (!isRecord(property) || property.type !== "files" || !Array.isArray(property.files)) {
    return null;
  }

  const file = property.files[0];
  if (!isRecord(file) || typeof file.type !== "string") {
    return null;
  }

  if (file.type === "file" && isRecord(file.file) && typeof file.file.url === "string") {
    return file as NotionFileValue;
  }
  if (
    file.type === "external" &&
    isRecord(file.external) &&
    typeof file.external.url === "string"
  ) {
    return file as NotionFileValue;
  }
  if (
    file.type === "file_upload" &&
    isRecord(file.file_upload) &&
    typeof file.file_upload.id === "string"
  ) {
    return file as NotionFileValue;
  }

  throw new Error(`Unsupported Payload File type: ${file.type}`);
}

async function readInlinePayloadText(
  config: {
    notionApiToken: string;
    notionVersion: string;
  },
  pageId: string,
): Promise<string> {
  const chunks: string[] = [];
  let cursor: string | null = null;

  do {
    const search = new URLSearchParams({ page_size: "100" });
    if (cursor) {
      search.set("start_cursor", cursor);
    }
    const response = await notionRequest<NotionBlockListResponse>(
      config,
      `/v1/blocks/${pageId}/children?${search}`,
      {
        method: "GET",
      },
    );

    for (const block of response.results) {
      if (!isPayloadChunkBlock(block)) {
        continue;
      }
      chunks.push((block.code?.rich_text ?? []).map(richTextContent).join(""));
    }

    cursor = response.next_cursor;
  } while (cursor);

  if (chunks.length === 0) {
    throw new Error("Health Sync Run has no Payload File or inline payload chunks.");
  }

  return chunks.join("");
}

function isPayloadChunkBlock(block: NotionBlock): boolean {
  if (block.type !== "code" || !block.code) {
    return false;
  }

  return (block.code.caption ?? [])
    .map(richTextContent)
    .join("")
    .startsWith("eucalyptus-health-payload:v1:");
}

function richTextContent(value: NotionRichText): string {
  return value.text?.content ?? value.plain_text ?? "";
}

async function downloadFileText(
  config: {
    notionApiToken: string;
    notionVersion: string;
  },
  file: NotionFileValue,
): Promise<string> {
  if (file.type === "file_upload") {
    const upload = await notionRequest<{
      status: string;
      upload_url?: string;
    }>(config, `/v1/file_uploads/${file.file_upload.id}`, {
      method: "GET",
    });
    if (upload.status !== "uploaded" || typeof upload.upload_url !== "string") {
      throw new Error(`File upload ${file.file_upload.id} is not downloadable.`);
    }

    return fetchText(upload.upload_url);
  }

  return fetchText(file.type === "file" ? file.file.url : file.external.url);
}

async function markSyncRunComplete(
  config: {
    notionApiToken: string;
    notionVersion: string;
  },
  pageId: string,
  importResult: ImportHealthFixtureResult,
): Promise<void> {
  const failed =
    (importResult.writeResults.metricCatalog?.failed ?? 0) +
    (importResult.writeResults.dailySummaries?.failed ?? 0) +
    (importResult.writeResults.workerDecisions?.failed ?? 0) +
    (importResult.writeResults.workouts?.failed ?? 0);
  const created =
    (importResult.writeResults.metricCatalog?.created ?? 0) +
    (importResult.writeResults.dailySummaries?.created ?? 0) +
    (importResult.writeResults.workerDecisions?.created ?? 0) +
    (importResult.writeResults.workouts?.created ?? 0);
  const updated =
    (importResult.writeResults.metricCatalog?.updated ?? 0) +
    (importResult.writeResults.dailySummaries?.updated ?? 0) +
    (importResult.writeResults.workerDecisions?.updated ?? 0) +
    (importResult.writeResults.workouts?.updated ?? 0);

  await notionRequest(config, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        Status: {
          status: {
            name: failed > 0 ? "partial" : "success",
          },
        },
        "Completed At": {
          date: {
            start: new Date().toISOString(),
          },
        },
        "Samples Added": {
          number: created,
        },
        "Samples Updated": {
          number: updated,
        },
        Error: {
          rich_text: failed > 0
            ? [
                {
                  text: {
                    content: `${failed} row(s) failed during import.`,
                  },
                },
              ]
            : [],
        },
      },
    },
  });
}

async function notionRequest<T>(
  config: {
    notionApiToken: string;
    notionVersion: string;
  },
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH";
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(`https://api.notion.com${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${config.notionApiToken}`,
      "Content-Type": "application/json",
      "Notion-Version": config.notionVersion,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      isRecord(json) && typeof json.message === "string"
        ? json.message
        : text;
    throw new Error(`Notion API ${options.method} ${path} failed: ${message}`);
  }

  return json as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download health upload: ${response.status}`);
  }

  return response.text();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function requireAnyEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  throw new Error(`${names.join(" or ")} is required.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
