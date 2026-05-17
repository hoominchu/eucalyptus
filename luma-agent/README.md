# luma-agent

Local HTTP service with three endpoints:

- `POST /attendees` — open a Luma event URL in a logged-in Chromium and return the visible guest list (names, avatars, social links).
- `POST /research` — given a name + social links, run an OpenAI Responses API web-search agent and return a ~250-word profile with citations.
- `POST /self-research` — scrape the logged-in X (Twitter) user's last-N-days posts + bookmarks and return a ~300-word profile of their interests.

## Setup

```bash
cd luma-agent
npm install
npx playwright install chromium
cp .env.example .env
```

Fill in `.env`:

- `OPENAI_API_KEY` — required for both endpoints (Stagehand uses it for the click step on `/attendees`; the Responses API uses it for `/research`).
- `WEBHOOK_TOKEN` — any random string. `openssl rand -hex 32` is fine. Callers must send it as `Authorization: Bearer <token>`.
- `STAGEHAND_MODEL` — defaults to `gpt-4o`. Used to click the right "Guests" trigger.
- `RESEARCH_MODEL` — defaults to `gpt-5`. Used for `/research`.
- `RESEARCH_EFFORT` — `low` (default), `medium`, or `high`. `minimal` is rejected by OpenAI when `web_search_preview` is attached.
- `RESEARCH_MAX_CONCURRENT` — defaults to `10`. In-process cap on concurrent OpenAI calls so a 50-fanout doesn't blow TPM limits.
- `X_USERNAME` — optional; your X handle. If unset, `/self-research` auto-detects it from the X side nav.
- `SELF_RESEARCH_MODEL` / `SELF_RESEARCH_EFFORT` — optional overrides; fall back to `RESEARCH_MODEL` / `low`.
- `USER_DATA_DIR` — defaults to `./browser-profile`. Persistent Chrome profile.
- `HEADLESS` — `true` (default) or `false` to watch the browser.

One-time sign-in for each site you want the agent to act on (persists in `USER_DATA_DIR`):

```bash
npm run login       # opens lu.ma/signin
npm run login:x     # opens x.com/login (needed for /self-research)
```

A visible Chromium opens at the target URL. Complete the sign-in (magic link for Luma, password / 2FA for X), then press enter in the terminal to save.

Start the server:

```bash
npm run dev     # watch mode
# or
npm run start
```

Default port is `8780`. Health check: `curl localhost:8780/health`.

## `POST /attendees`

Open the event page (must be logged-in / RSVP'd as an attendee), open the guest dialog, scroll to materialize all rows, scrape names + avatar + every `<a>` to known social hosts.

```bash
curl -X POST localhost:8780/attendees \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://lu.ma/<event-slug>"}'
```

Response:

```json
{
  "ok": true,
  "eventUrl": "https://lu.ma/...",
  "title": "AI Nerd Meet Up",
  "totalGuestCount": 52,
  "visibleAttendees": [
    {
      "name": "Ary",
      "avatarUrl": "https://cdn.lu.ma/...",
      "socials": [{ "platform": "twitter", "url": "https://x.com/aryg18" }]
    }
  ],
  "hostVisible": false,
  "scrapedAt": "2026-05-16T21:34:36.621Z"
}
```

Notes:

- Calls serialize through a single persistent Chromium context (one browser, mutex'd queue).
- Attendee-only view: no emails, only guests who completed their Luma profile.
- Errors: `400` invalid URL, `401` not signed in (run `npm run login`), `500` everything else.

## `POST /research`

OpenAI Responses API with `web_search_preview`. Prompt instructs the model to (1) find the person's personal website starting from the known socials, (2) read it + the known links, (3) return a tight profile.

```bash
curl -X POST localhost:8780/research \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ary",
    "socials": [
      { "platform": "twitter", "url": "https://x.com/aryg18" }
    ]
  }'
```

Response:

```json
{
  "ok": true,
  "name": "Ary",
  "summary": "...~250 word profile...",
  "citations": [{ "url": "https://...", "title": "..." }],
  "model": "gpt-5",
  "durationMs": 12345
}
```

Notes:

- Does not touch the browser — calls fan out concurrently, capped by `RESEARCH_MAX_CONCURRENT`.
- Each call takes ~10–20s.
- Fan out 50 people in parallel:

  ```bash
  cat people.jsonl | xargs -P 50 -I{} curl -s -X POST localhost:8780/research \
    -H "Authorization: Bearer $WEBHOOK_TOKEN" \
    -H "Content-Type: application/json" -d {}
  ```

## `POST /self-research`

Requires `npm run login:x` first. Opens `x.com/<your-handle>` for posts and `x.com/i/bookmarks` for bookmarks, scrolls until it's past the window (default 30 days), then feeds the corpus to the Responses API (no web_search — the corpus *is* the source).

```bash
curl -X POST localhost:8780/self-research \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Optional body fields:

- `username`: override the auto-detected/env-var X handle.
- `windowDays`: defaults to `30`.

Response:

```json
{
  "ok": true,
  "username": "hoominchu",
  "windowDays": 30,
  "postCount": 47,
  "bookmarkCount": 12,
  "summary": "...~300 word profile...",
  "model": "gpt-5",
  "durationMs": 23456
}
```

Notes:

- Uses the same browser singleton as `/attendees`, so calls queue behind any in-flight Luma scrape.
- Top-level posts only on the profile timeline; reposts from other authors are dropped.
- Caps at 500 posts and 500 bookmarks per call to keep the LLM input bounded.
- Errors: `401` if the X session isn't valid (run `npm run login:x`), `500` otherwise.
