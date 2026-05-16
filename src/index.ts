import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";

import { handleLumaMailSignal } from "./luma-mail.ts";

const worker = new Worker();

export default worker;

worker.tool("logLumaEmailHello", {
  title: "Log Luma Email Hello",
  description:
    "Call when a Notion Mail trigger receives an email that appears to be for a Luma event. Logs a hello-world marker for the incoming email.",
  schema: j.object({
    from: j
      .string()
      .describe("Sender email address or display string from the Mail trigger.")
      .nullable(),
    subject: j
      .string()
      .describe("Subject line from the received email.")
      .nullable(),
    bodyPreview: j
      .string()
      .describe("Short plain-text body excerpt from the received email.")
      .nullable(),
    messageId: j
      .string()
      .describe("Stable email message identifier when the Mail trigger provides one.")
      .nullable(),
    emailUrl: j
      .string()
      .describe("Notion Mail or Gmail URL for the email when available.")
      .nullable(),
  }),
  outputSchema: j.object({
    handled: j
      .boolean()
      .describe("True when the email matched Luma markers and was logged."),
    reason: j.string().describe("Why the email was or was not handled."),
    messageId: j
      .string()
      .describe("The original message identifier, or null if not provided.")
      .nullable(),
  }),
  hints: { readOnlyHint: true },
  execute: async (signal) => handleLumaMailSignal(signal),
});

