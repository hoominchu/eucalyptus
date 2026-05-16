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

- [ ] Confirm the local run logs `hello world` and returns `handled: true`.
- [ ] Run a non-Luma local payload and confirm it returns `handled: false` without logging:

  ```bash
  ntn workers exec logLumaEmailHello --local -d '{"from":"updates@example.com","subject":"Weekly update","bodyPreview":"No Luma link here","messageId":"local-negative","emailUrl":null}'
  ```

- [ ] Keep local scope honest: Notion Mail triggers and Custom Agent tool routing run in Notion, so local E2E only validates the Worker tool contract and Luma detection logic.

## Remote Notion E2E

- [ ] Deploy the Worker:

  ```bash
  npm run worker:deploy
  ```

- [ ] Confirm `logLumaEmailHello` appears as a deployed Worker tool.
- [ ] In Notion, open the Custom Agent that should watch mail.
- [ ] Add a Mail connection under `Settings` -> `Tools & Access`.
- [ ] Choose the inbox connected to Notion Mail or Gmail.
- [ ] Keep permissions narrow: read/inspect mail only; do not grant Send for this first flow.
- [ ] Add the deployed Worker tool `logLumaEmailHello` to the agent.
- [ ] Add a Mail trigger:
  - [ ] Trigger type: `New email received`.
  - [ ] Inbox: the connected inbox.
  - [ ] Filters: sender/domain contains `luma.com`, subject contains `Luma`, or body contains `lu.ma`.
- [ ] Add agent instructions:

  ```text
  When a new email is received and it is from luma.com, contains "Luma" in the subject, or contains a lu.ma link, call the logLumaEmailHello tool with from, subject, bodyPreview, messageId, and emailUrl when available.

  Do not reply, send, archive, delete, label, or otherwise mutate email for this flow.
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

- [ ] Confirm the remote Worker logs `hello world`.
- [ ] Send or receive a non-Luma test email.
- [ ] Confirm the trigger filter does not fire, or if the tool is called manually, the Worker returns `handled: false`.

## Ready For Minchu's Worker

- [ ] Keep the Notion-facing tool key stable: `logLumaEmailHello`.
- [ ] Replace the logging call inside `handleLumaMailSignal` after `isLumaEmail` returns true.
- [ ] Pass the email fields to Minchu's Luma reader.
- [ ] Persist normalized Luma event data through a dedicated module.
- [ ] Add a managed Worker sync only when Luma events need scheduled backfill or reconciliation.
- [ ] Use a stable Luma event ID as the Notion primary key to prevent duplicate rows.

