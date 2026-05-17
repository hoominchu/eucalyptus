import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";

import {
  fetchAttendees,
  initAgent,
  isBrowserReady,
  shutdownAgent,
} from "./agent.ts";
import { researchPerson } from "./research.ts";
import { selfResearch } from "./self-research.ts";
import {
  InvalidLumaUrlError,
  NotAuthenticatedError,
  XNotAuthenticatedError,
  type SocialLink,
} from "./types.ts";

const PORT = Number(process.env.PORT) || 8780;
const TOKEN = process.env.WEBHOOK_TOKEN || "";

if (!TOKEN) {
  console.error("WEBHOOK_TOKEN is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "32kb" }));

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["authorization"] || "";
  if (header !== `Bearer ${TOKEN}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, browserReady: isBrowserReady() });
});

app.post("/attendees", requireAuth, async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url : null;
  if (!url) {
    res.status(400).json({ ok: false, error: "url is required" });
    return;
  }

  try {
    const result = await fetchAttendees(url);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InvalidLumaUrlError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    if (err instanceof NotAuthenticatedError) {
      res.status(401).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("scrape failed:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/research", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ ok: false, error: "name is required" });
    return;
  }

  const rawSocials = Array.isArray(body.socials) ? body.socials : [];
  const socials: SocialLink[] = [];
  for (const s of rawSocials) {
    const url = typeof s?.url === "string" ? s.url.trim() : "";
    if (!url) continue;
    const platform = typeof s?.platform === "string" && s.platform.trim() ? s.platform.trim() : "website";
    socials.push({ platform, url });
  }

  try {
    const result = await researchPerson({ name, socials });
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("research failed:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/self-research", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const username =
    typeof body.username === "string" && body.username.trim() ? body.username.trim() : undefined;
  const windowDays =
    typeof body.windowDays === "number" && body.windowDays > 0 ? body.windowDays : undefined;

  try {
    const result = await selfResearch({ username, windowDays });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof XNotAuthenticatedError) {
      res.status(401).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("self-research failed:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down`);
  try {
    await shutdownAgent();
  } catch (err) {
    console.error("shutdown error:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

app.listen(PORT, async () => {
  console.log(`luma-agent listening on http://0.0.0.0:${PORT}`);
  try {
    await initAgent();
    console.log("browser ready");
  } catch (err) {
    console.error("browser init failed:", err);
    console.error("the server is up but /attendees will fail until the browser starts");
  }
});
