import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

loadDotenv(".env.local");

const outputPath = process.env.NOTION_WORKERS_CONFIG_FILE || ".local/workers.json";

const required = {
  workspaceId: process.env.NOTION_WORKSPACE_ID,
  workerId: process.env.NOTION_WORKER_ID,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value?.trim())
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Missing worker config env: ${missing.join(", ")}. Set NOTION_WORKSPACE_ID and NOTION_WORKER_ID.`,
  );
}

const config = {
  version: "1",
  environment: process.env.NOTION_ENV || "prod",
  workspaceId: required.workspaceId,
  workerId: required.workerId,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Generated ${outputPath}`);

function loadDotenv(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}
