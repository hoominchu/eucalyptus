# Luma Mail Trigger E2E Plan

## Local E2E Simulation

- [ ] Use Node `22.18.0` or newer.
- [ ] Install dependencies:

  ```bash
  npm install
  ```

- [ ] Run static checks:

  ```bash
  npm run typecheck
  ```

- [ ] Run unit tests:

  ```bash
  npm test
  ```

- [ ] Install the Notion CLI if `ntn` is not already available:

  ```bash
  curl -fsSL https://ntn.dev | bash
  ```

- [ ] Authenticate the Notion CLI with the workspace that will host the Worker.
- [ ] Run the Worker tool locally with the bundled sample payload:

  ```bash
  npm run worker:exec:local
  ```

- [ ] Confirm the local run logs `luma email signal handled` and returns `handled: true`.
- [ ] Run a non-Luma local payload and confirm it returns `handled: false` without logging:

  ```bash
  ntn workers exec processLumaEmailSignal --local -d '{"from":"updates@example.com","subject":"Weekly update","bodyPreview":"No Luma link here","messageId":"local-negative","emailUrl":null}'
  ```

- [ ] Keep local scope honest: Notion Mail triggers and Custom Agent tool routing run in Notion, so local E2E only validates the Worker tool contract and Luma detection logic.

## Remote Notion E2E

- [ ] Deploy the Worker:

  ```bash
  npm run worker:deploy
  ```

- [ ] Confirm `processLumaEmailSignal` appears as a deployed Worker tool.
- [ ] In Notion, open the Custom Agent that should watch mail.
- [ ] Add a Mail connection under `Settings` -> `Tools & Access`.
- [ ] Choose the inbox connected to Notion Mail or Gmail.
- [ ] Keep permissions narrow: read/inspect mail only; do not grant Send for this first flow.
- [ ] Add the deployed Worker tool `processLumaEmailSignal` to the agent.
- [ ] Add a Mail trigger:
  - [ ] Trigger type: `New email received`.
  - [ ] Inbox: the connected inbox.
  - [ ] Filters: sender/domain contains `luma.com`, subject contains `Luma`, or body contains `lu.ma`.
- [ ] Treat trigger filters as coarse pre-filters only; `emailUrl` is checked inside `processLumaEmailSignal` after the agent passes the email payload.
- [ ] Add agent instructions:

  ```text
  When a new email is received, inspect the sender, subject, body preview, body text, message ID, and email URL.

  If the email is from luma.com, contains "Luma" in the subject, or contains a lu.ma link anywhere in the body or email URL, call the processLumaEmailSignal tool.

  When calling processLumaEmailSignal, pass these fields:
  - from: the sender email address or display string
  - subject: the email subject
  - bodyPreview: the most useful available body preview or body text excerpt
  - messageId: the email message ID when available
  - emailUrl: the Notion Mail or Gmail URL when available

  Do not call the tool with empty fields if the email content is available. Do not reply, send, archive, delete, label, or otherwise mutate email for this flow.
  ```

- [ ] Send a real test email to the connected inbox that includes a Luma marker such as `https://lu.ma/test`.
- [ ] Confirm the Custom Agent trigger fires in Notion agent activity.
- [ ] Inspect Worker runs:

  ```bash
  ntn workers runs list
  ```

- [ ] Inspect the matching run logs:

  ```bash
  ntn workers runs logs <run-id>
  ```

- [ ] Confirm the remote Worker logs `luma email signal handled`.
- [ ] Send or receive a non-Luma test email.
- [ ] Confirm the trigger filter does not fire, or if the tool is called manually, the Worker returns `handled: false`.

## Ready For Minchu's Worker

- [ ] Keep the Notion-facing tool key stable: `processLumaEmailSignal`.
- [ ] Replace the logging call inside `handleLumaMailSignal` after `isLumaEmail` returns true.
- [ ] Pass the email fields to Minchu's Luma reader.
- [ ] Persist normalized Luma event data through a dedicated module.
- [ ] Add a managed Worker sync only when Luma events need scheduled backfill or reconciliation.
- [ ] Use a stable Luma event ID as the Notion primary key to prevent duplicate rows.
