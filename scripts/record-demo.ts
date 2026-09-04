/**
 * Records docs/demo.gif — a full run against the committed fixture.
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

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(process.cwd(), "docs", "demo.gif");
const TMP = path.join(process.cwd(), "e2e", ".tmp", "demo");

/** Small enough for a README, large enough to read the figures. */
const VIEWPORT = { width: 1000, height: 620 };
/** Milliseconds each frame is held. The last one lingers. */
const FRAME_MS = 1400;
const FINAL_FRAME_MS = 3200;

const frames: Uint8Array[] = [];
const delays: number[] = [];

async function capture(page: Page, delay = FRAME_MS): Promise<void> {
  const png = PNG.sync.read(Buffer.from(await page.screenshot({ type: "png" })));
  frames.push(new Uint8Array(png.data));
  delays.push(delay);
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
  await fs.mkdir(TMP, { recursive: true });

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

    // 1 — nothing in progress
    await page.goto(`${BASE}/course`);
    await page.getByText("No report in progress").waitFor();
    await capture(page);

    // 2 — start a report
    await page.getByRole("button", { name: "Start a new report" }).click();
    await page.getByLabel("Course title (Arabic)").waitFor();
    await capture(page);

    // 3 — the course, typed in Arabic
    await page.getByLabel("Course title (Arabic)").fill("مهارات القيادة الإدارية الحديثة");
    await page.getByLabel("Client (Arabic)").fill("شركة الأفق للصناعات");
    await page.getByLabel("Trainer (Arabic)").fill("د. سامي الحارثي");
    await page.getByTestId("save-indicator").getByText(/Saved/).waitFor();
    await capture(page);

    // 4 — the rest of the report, from the committed fixture
    const fixture = JSON.parse(
      await fs.readFile(path.join(process.cwd(), "fixtures", "demo-draft.json"), "utf8"),
    );
    await page.request.put(`${BASE}/api/draft`, { data: fixture });

    for (const [screen, wait] of [
      ["/participants", "Attendance"],
      ["/grades", "Marks and outcomes"],
      ["/survey", "Questions and response tallies"],
      ["/narrative", "Executive summary"],
    ] as const) {
      await page.goto(`${BASE}${screen}`);
      await page.getByText(wait).first().waitFor();
      await capture(page);
    }

    // 5 — the checklist agrees
    await page.goto(`${BASE}/review`);
    await page.getByTestId("readiness").waitFor();
    await capture(page);

    // Scrolled to the figures panel.
    await page.getByText("Computed figures").scrollIntoViewIfNeeded();
    await capture(page);

    // 6 — finalize
    await page.getByRole("button", { name: "Finalize report" }).scrollIntoViewIfNeeded();
    await capture(page);
    await page.getByRole("button", { name: "Finalize report" }).click();
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
