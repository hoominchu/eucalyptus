import assert from "node:assert/strict";
import test from "node:test";

import { handleLumaMailSignal, isLumaEmail } from "../src/luma-mail.ts";

test("matches a Luma sender domain", () => {
  assert.equal(
    isLumaEmail({
      from: "Luma <events@luma.com>",
      subject: "You're invited",
      bodyPreview: null,
      messageId: "message-1",
      emailUrl: null,
    }),
    true,
  );
});

test("matches lu.ma links in the body preview", () => {
  assert.equal(
    isLumaEmail({
      from: "host@example.com",
      subject: "Join us",
      bodyPreview: "Register at https://lu.ma/example",
      messageId: "message-2",
      emailUrl: null,
    }),
    true,
  );
});

test("does not log non-Luma email", () => {
  const logs: unknown[] = [];
  const result = handleLumaMailSignal(
    {
      from: "updates@example.com",
      subject: "Weekly update",
      bodyPreview: "No event link here.",
      messageId: "message-3",
      emailUrl: null,
    },
    { log: (...args: unknown[]) => logs.push(args) },
  );

  assert.deepEqual(result, {
    handled: false,
    reason: "No Luma marker found",
    messageId: "message-3",
  });
  assert.deepEqual(logs, []);
});

test("logs hello world for Luma email", () => {
  const logs: unknown[] = [];
  const result = handleLumaMailSignal(
    {
      from: "events@luma.com",
      subject: "Luma event reminder",
      bodyPreview: null,
      messageId: "message-4",
      emailUrl: null,
    },
    { log: (...args: unknown[]) => logs.push(args) },
  );

  assert.equal(result.handled, true);
  assert.equal(result.reason, "Matched luma.com");
  assert.deepEqual(logs, [
    [
      "hello world",
      {
        source: "notion-mail-luma-trigger",
        messageId: "message-4",
        reason: "Matched luma.com",
      },
    ],
  ]);
});

