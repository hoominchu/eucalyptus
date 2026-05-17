import "dotenv/config";
import readline from "node:readline";
import { chromium } from "playwright";

const USER_DATA_DIR = process.env.USER_DATA_DIR || "./browser-profile";
const CHROME_PATH =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question(prompt, () => resolve()));
  rl.close();
}

async function main(): Promise<void> {
  const target = process.argv[2] || "https://lu.ma/signin";
  const label = new URL(target).hostname;

  console.log(`Opening Chromium with persistent profile at ${USER_DATA_DIR}`);
  console.log(`Target: ${target}`);
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    executablePath: CHROME_PATH,
    viewport: { width: 1280, height: 800 },
    // Strip Playwright's automation tells so Google OAuth (and other
    // bot-protected forms) accept the session.
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // navigator.webdriver=true is the single biggest tell — patch it before any
  // page script runs.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(target);

  console.log(`\nSign in to ${label} in the opened browser.`);
  await waitForEnter("Press enter to save the session and exit... ");

  await context.close();
  console.log("Session saved. You can now `npm run dev`.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
