/**
 * Records docs/demo.gif — a full run against the committed fixture, with the
 * UI switched to Arabic on the second frame.
 *
 * Drives a real browser through the app, screenshots each step, and encodes
 * the frames to an animated GIF. There is no ffmpeg here, so the encoding is
 * done in-process: pngjs decodes each screenshot, gifenc quantises and
 * writes the animation.
 *
 * Run with `pnpm demo:gif` while nothing else is on port 3200.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { PNG } from "pngjs";

import { ar } from "@/lib/i18n/ar";

/** The run is recorded in Arabic after the first frame. */
const t = ar;

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(process.cwd(), "docs", "demo.gif");
const TMP = path.join(process.cwd(), "e2e", ".tmp", "demo");

/** Small enough for a README, large enough to read the figures. */
const VIEWPORT = { width: 1000, height: 620 };
/** Milliseconds each frame is held. The last one lingers. */
const FRAME_MS = 1400;
const FINAL_FRAME_MS = 3200;
/** Pause before each screenshot, for fonts and transitions to settle. */
const SETTLE_MS = 600;

const frames: Uint8Array[] = [];
const delays: number[] = [];

async function capture(page: Page, delay = FRAME_MS): Promise<void> {
  // Let web fonts finish loading and colour transitions finish running, or a
  // frame shot straight after a click shows fallback glyphs and half-faded
  // buttons.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
  const bytes = Buffer.from(await page.screenshot({ type: "png" }));
  const png = PNG.sync.read(bytes);
  frames.push(new Uint8Array(png.data));
  delays.push(delay);
  // Each frame is also kept as a PNG, so the screens can be reviewed
  // individually without decoding the GIF.
  await fs.writeFile(
    path.join(TMP, "frames", `${String(frames.length).padStart(2, "0")}.png`),
    bytes,
  );
  process.stdout.write(`  frame ${frames.length}\n`);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/course`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not come up on ${BASE}`);
}

/**
 * Stop the dev server and everything it spawned, and wait for the port to
 * actually free. `child.kill()` reaches only the shell wrapper on Windows.
 */
async function stopServer(server: ChildProcess): Promise<void> {
  if (server.pid) {
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          stdio: "ignore",
        });
        killer.on("exit", () => resolve());
        killer.on("error", () => resolve());
      });
    } else {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
  }

  // Wait for the port to be released, so a later `next dev` is not refused.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`${BASE}/course`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.warn(`Warning: something is still listening on ${PORT}.`);
}

async function main(): Promise<void> {
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.mkdir(path.join(TMP, "frames"), { recursive: true });

  console.log(`Starting a dev server on ${PORT} with its own data directory…`);
  // detached so the whole tree can be signalled as a group; without this the
  // pnpm wrapper dies and leaves `next dev` holding the port, and Next then
  // refuses a second instance for the same project directory — which breaks
  // the e2e run afterwards, not this script.
  const server: ChildProcess = spawn("pnpm", ["dev", "--port", String(PORT)], {
    stdio: "ignore",
    shell: true,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      COURSE_REPORT_DATA_DIR: path.join(TMP, "data"),
      COURSE_REPORT_OUTPUT_DIR: path.join(TMP, "output"),
    },
  });

  const browser = await chromium.launch();

  try {
    await waitForServer();
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

    // 1 — nothing in progress, in the default English UI
    await page.goto(`${BASE}/course`);
    await page.getByText("No report in progress").waitFor();
    await capture(page);

    // 2 — switch the UI to Arabic. The choice lands in a cookie, so every
    // screen from here on renders right-to-left; the rest of the run reads
    // its labels from the Arabic dictionary.
    await page.getByTestId("language-switch").getByRole("button", { name: t.language.names.ar }).click();
    await page.getByText(t.shell.noReport).waitFor();
    await page.locator("html[dir=rtl]").waitFor();
    await capture(page);

    // 3 — start a report
    await page.getByRole("button", { name: t.shell.start }).click();
    await page.getByLabel(t.course.titleAr).waitFor();
    await capture(page);

    // 4 — the course, typed in Arabic
    await page.getByLabel(t.course.titleAr).fill("مهارات القيادة الإدارية الحديثة");
    await page.getByLabel(t.course.clientAr).fill("شركة الجبل الأخضر للصناعات");
    await page.getByLabel(t.course.trainerAr).fill("د. سالم الطرابلسي");
    await page.locator('[data-testid="save-indicator"][data-save-state="saved"]').waitFor();
    await capture(page);

    // 5 — the rest of the report, from the committed fixture
    const fixture = JSON.parse(
      await fs.readFile(path.join(process.cwd(), "fixtures", "demo-draft.json"), "utf8"),
    );
    await page.request.put(`${BASE}/api/draft`, { data: fixture });

    for (const [screen, wait] of [
      ["/participants", t.participants.attendance],
      ["/grades", t.grades.marksCard],
      ["/survey", t.survey.questionsCard],
      ["/narrative", t.narrative.sections.executiveSummary],
    ] as const) {
      await page.goto(`${BASE}${screen}`);
      await page.getByText(wait).first().waitFor();
      await capture(page);
    }

    // 6 — the checklist agrees
    await page.goto(`${BASE}/review`);
    await page.getByTestId("readiness").waitFor();
    await capture(page);

    // Scrolled to the figures panel.
    // exact: the page header's description also mentions the computed
    // figures, and getByText's default substring match would find both.
    await page.getByText(t.review.figures, { exact: true }).scrollIntoViewIfNeeded();
    await capture(page);

    // 7 — finalize
    await page.getByRole("button", { name: t.review.finalizeReport }).scrollIntoViewIfNeeded();
    await capture(page);
    await page.getByRole("button", { name: t.review.finalizeReport }).click();
    await page.getByTestId("last-export").waitFor({ timeout: 120_000 });
    await capture(page, FINAL_FRAME_MS);

    console.log(`Encoding ${frames.length} frames…`);
    const encoder = GIFEncoder();
    for (let i = 0; i < frames.length; i += 1) {
      // 128 colours keeps the file small; the UI is flat, so banding is
      // invisible at this palette size.
      const palette = quantize(frames[i], 128, { format: "rgb565" });
      const indexed = applyPalette(frames[i], palette, "rgb565");
      encoder.writeFrame(indexed, VIEWPORT.width, VIEWPORT.height, {
        palette,
        delay: delays[i],
      });
    }
    encoder.finish();

    await fs.mkdir(path.dirname(OUT), { recursive: true });
    const bytes = encoder.bytes();
    await fs.writeFile(OUT, bytes);

    console.log(
      `Wrote ${path.relative(process.cwd(), OUT)} — ` +
        `${frames.length} frames, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`,
    );
  } finally {
    await browser.close();
    await stopServer(server);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
