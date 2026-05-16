# Notion Luma Mail Trigger

This project uses Notion's developer platform in the smallest useful shape:

- A Notion Custom Agent owns the Mail connection and trigger.
- A Notion Worker exposes the `logLumaEmailHello` agent tool.
- The Custom Agent calls the Worker tool only when the received email looks like a Luma event email.
- The Worker currently logs `hello world`; Minchu's Luma event reader can replace that handler later.

References:

- Notion API overview: https://developers.notion.com/guides/get-started/overview
- Notion Workers overview: https://developers.notion.com/workers/get-started/overview
- Worker agent tools: https://developers.notion.com/workers/guides/tools
- Mail triggers for Custom Agents: https://www.notion.com/en-gb/help/connect-mail-to-custom-agents
- Native TypeScript in Node.js: https://nodejs.org/learn/typescript/run-natively

## Flow

1. A new email arrives in the mailbox connected to Notion Mail or Gmail.
2. A Notion Custom Agent Mail trigger runs on `New email received`.
3. The trigger filter narrows events to likely Luma mail by sender domain, subject, or body.
4. The Custom Agent calls `logLumaEmailHello` with the email fields it can access.
5. The Worker checks Luma markers again and logs `hello world` for matching messages.

The duplicate filtering is deliberate. Notion's trigger filter reduces noise before the agent runs, while the Worker-side check keeps the code safe if the tool is called manually or the trigger filter changes.

## Deploy the Worker

Install the Notion CLI if needed:

```bash
curl -fsSL https://ntn.dev | bash
```

Install dependencies:

```bash
npm install
```

Deploy:

```bash
npm run worker:deploy
```

After deployment, add the `logLumaEmailHello` Worker tool to the Custom Agent's tool configuration.

## Configure the Mail Trigger

In Notion:

1. Open the Custom Agent that should watch mail.
2. Go to `Settings` -> `Tools & Access`.
3. Add a `Mail` connection and choose the inbox connected to Notion Mail.
4. Keep permissions narrow. This flow only needs read access to trigger and inspect received email. It does not need Send.
5. Add the deployed Worker tool `logLumaEmailHello`.
6. Go to `Triggers` -> `+ Add trigger` -> `Mail`.
7. Choose `New email received`.
8. Choose the inbox.
9. Add filters such as:
   - From or Domain contains `luma.com`
   - Subject contains `Luma`
   - Body contains `lu.ma`

Use instructions like this for the Custom Agent:

```text
When a new email is received and it is from luma.com, contains "Luma" in the subject, or contains a lu.ma link, call the logLumaEmailHello tool with from, subject, bodyPreview, messageId, and emailUrl when available.

Do not reply, send, archive, delete, label, or otherwise mutate email for this flow.
```

## Inspect Runs

List recent Worker runs:

```bash
ntn workers runs list
```

View logs for a run:

```bash
ntn workers runs logs <run-id>
```

For a successful matching email, expect a log entry beginning with:

```text
hello world
```

## Future Luma Event Persistence

When Minchu's Luma reader is ready, keep the Notion-facing tool contract stable and replace the current logging call inside `handleLumaMailSignal`.

Recommended next shape:

- Parse or fetch the Luma event with Minchu's reader after `isLumaEmail` returns true.
- Write normalized event data through a dedicated persistence function.
- Add a Worker sync with a managed Notion database when the Luma event dataset needs scheduled backfill or ongoing reconciliation.
- Use a stable Luma event ID as the primary key so Notion updates existing rows rather than duplicating events.

