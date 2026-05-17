import type { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";

import { importHealthFixture } from "../health/importHealthFixture.ts";
import { importHealthSyncRun } from "../health/importHealthSyncRun.ts";
import { planWorkoutFromHealthSyncRun } from "../health/planWorkoutFromHealthSyncRun.ts";
import { recommendWorkoutToday } from "../health/recommendWorkoutToday.ts";

export function registerHealthImportTool(worker: Worker): void {
  worker.tool("importHealthFixture", {
    title: "Import Health Fixture",
    description:
      "Imports a local Apple Health JSON export into health planning Notion records.",
    schema: j.object({
      path: j
        .string()
        .describe("Absolute or workspace-relative path to the Apple Health JSON export."),
      dryRun: j
        .boolean()
        .describe("When false, only must be an explicit collection list."),
      only: j
        .array(j.enum("metricCatalog", "dailySummaries", "workerDecisions", "workouts"))
        .nullable()
        .describe("Optional subset to normalize. Pass null to include all collections."),
    }),
    hints: { readOnlyHint: true },
    execute: async (input) => importHealthFixture(input),
  });

  worker.tool("recommendWorkoutToday", {
    title: "Recommend Workout Today",
    description:
      "Builds an auditable workout recommendation from a local Apple Health JSON export.",
    schema: j.object({
      path: j
        .string()
        .describe("Absolute or workspace-relative path to the Apple Health JSON export."),
      targetDate: j
        .string()
        .nullable()
        .describe("Optional local date in YYYY-MM-DD format. Pass null to use the latest day in the export."),
      dryRun: j
        .boolean()
        .describe("When true, preview the recommendation without writing to Notion."),
    }),
    hints: { readOnlyHint: true },
    execute: async (input) => recommendWorkoutToday(input),
  });

  worker.tool("importHealthSyncRun", {
    title: "Import Health Sync Run",
    description:
      "Imports an Apple Health JSON file attached to a Health Sync Runs Notion row.",
    schema: j.object({
      pageId: j
        .string()
        .nullable()
        .describe("Optional Health Sync Runs page ID. Pass null to import the latest row."),
      dryRun: j
        .boolean()
        .describe("When true, parse and preview without writing health data."),
      only: j
        .array(j.enum("metricCatalog", "dailySummaries", "workerDecisions", "workouts"))
        .nullable()
        .describe("Optional subset to import. Pass null to include all collections."),
    }),
    hints: { readOnlyHint: true },
    execute: async (input) => importHealthSyncRun(input),
  });

  worker.tool("planWorkoutFromHealthSyncRun", {
    title: "Plan Workout From Health Sync Run",
    description:
      "Imports the latest mobile health upload, builds today's workout recommendation, and returns a calendar scheduling intent.",
    schema: j.anyOf(
      j.object({}),
      j.object({
        dryRun: j
          .boolean()
          .describe("When true, preview import and recommendation without writing health records or decisions."),
      }),
      j.object({
        pageId: j
          .string()
          .nullable()
          .describe("Optional Health Sync Runs page ID. Pass null to use the latest upload."),
      }),
      j.object({
        targetDate: j
          .string()
          .nullable()
          .describe("Optional local date in YYYY-MM-DD format. Pass null to use the latest day in the upload."),
      }),
      j.object({
        pageId: j
          .string()
          .nullable()
          .describe("Optional Health Sync Runs page ID. Pass null to use the latest upload."),
        dryRun: j
          .boolean()
          .describe("When true, preview import and recommendation without writing health records or decisions."),
      }),
      j.object({
        targetDate: j
          .string()
          .nullable()
          .describe("Optional local date in YYYY-MM-DD format. Pass null to use the latest day in the upload."),
        dryRun: j
          .boolean()
          .describe("When true, preview import and recommendation without writing health records or decisions."),
      }),
      j.object({
        pageId: j
          .string()
          .nullable()
          .describe("Optional Health Sync Runs page ID. Pass null to use the latest upload."),
        targetDate: j
          .string()
          .nullable()
          .describe("Optional local date in YYYY-MM-DD format. Pass null to use the latest day in the upload."),
      }),
      j.object({
        pageId: j
          .string()
          .nullable()
          .describe("Optional Health Sync Runs page ID. Pass null to use the latest upload."),
        targetDate: j
          .string()
          .nullable()
          .describe("Optional local date in YYYY-MM-DD format. Pass null to use the latest day in the upload."),
        dryRun: j
          .boolean()
          .describe("When true, preview import and recommendation without writing health records or decisions."),
      }),
    ),
    hints: { readOnlyHint: true },
    execute: async (input) => planWorkoutFromHealthSyncRun({
      pageId: "pageId" in input ? input.pageId : null,
      targetDate: "targetDate" in input ? input.targetDate : null,
      dryRun: "dryRun" in input ? input.dryRun : true,
    }),
  });
}
