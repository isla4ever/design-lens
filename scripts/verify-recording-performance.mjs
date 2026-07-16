import { resolve } from "node:path";
import { chromium } from "playwright";

const contentScriptPath = resolve(".output/chrome-mv3/content-scripts/content.js");
const stressNodeCount = Number(process.env.DESIGN_LENS_STRESS_NODES ?? 20_000);
if (!Number.isInteger(stressNodeCount) || stressNodeCount < 1000) throw new Error("DESIGN_LENS_STRESS_NODES must be an integer of at least 1000");

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  reportStage("browser-ready");
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await installExtensionApiMock(page);
  await page.setContent(stressPage(stressNodeCount), { waitUntil: "load" });
  await page.waitForFunction(() => window.__stressReady === true);
  await page.addScriptTag({ path: contentScriptPath });
  await page.waitForFunction(() => typeof window.__sendDesignLensMessage === "function" && Boolean(window.__designLensListener));
  reportStage("content-runtime-ready");
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.body.getBoundingClientRect();
    window.__longTasks = [];
  });
  reportStage("fixture-ready");

  const startBeganAt = performance.now();
  const startResponse = await withTimeout(page.evaluate((message) => window.__sendDesignLensMessage(message), {
    type: "DESIGN_LENS_RECORD_START",
    locale: "en",
    mode: "reference"
  }), 30_000, "Recording start timed out");
  const startDurationMs = Math.round(performance.now() - startBeganAt);
  if (!startResponse?.ok) throw new Error(startResponse?.error ?? "Recording did not start");
  reportStage("recording-started");

  const interactionLatencies = [];
  for (let index = 0; index < 24; index += 1) {
    const beganAt = performance.now();
    await page.mouse.move(20 + (index % 8) * 70, 40 + (index % 6) * 55);
    await page.evaluate((step) => {
      window.scrollTo(0, (step * 170) % Math.max(1, document.documentElement.scrollHeight - innerHeight));
      document.querySelector("#heartbeat")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, index);
    interactionLatencies.push(performance.now() - beganAt);
    await page.waitForTimeout(35);
  }
  reportStage("interactions-complete");

  const stopBeganAt = performance.now();
  const stopResponse = await withTimeout(page.evaluate((message) => window.__sendDesignLensMessage(message), {
    type: "DESIGN_LENS_RECORD_STOP",
    locale: "en"
  }), 30_000, "Recording stop timed out");
  const stopDurationMs = Math.round(performance.now() - stopBeganAt);
  if (!stopResponse?.ok) throw new Error(stopResponse?.error ?? "Recording did not stop");
  reportStage("recording-stopped");

  const browserMetrics = await page.evaluate(() => ({
    heartbeatCount: window.__heartbeatCount,
    longTasks: window.__longTasks,
    scrollY: window.scrollY,
    overlayPresent: Boolean(document.querySelector("#design-lens-overlay-root"))
  }));
  const timeline = stopResponse.capture?.interactionTimeline;
  const result = {
    domNodes: stressNodeCount,
    startDurationMs,
    stopDurationMs,
    maxInteractionLatencyMs: Math.round(Math.max(0, ...interactionLatencies)),
    maxLongTaskMs: Math.round(Math.max(0, ...browserMetrics.longTasks)),
    longTaskCount: browserMetrics.longTasks.length,
    heartbeatCount: browserMetrics.heartbeatCount,
    pointerSamples: timeline?.pointerSamples?.length ?? 0,
    scrollSamples: timeline?.scrollSamples?.length ?? 0,
    frameSamples: timeline?.frameSamples?.length ?? 0,
    overlayPresent: browserMetrics.overlayPresent,
    consoleErrors
  };

  if (result.heartbeatCount !== 24) throw new Error(`Page lost interactions: expected 24, received ${result.heartbeatCount}`);
  if (result.maxInteractionLatencyMs > 500) throw new Error(`Page interaction latency exceeded 500ms: ${result.maxInteractionLatencyMs}ms`);
  if (result.maxLongTaskMs > 200) throw new Error(`Extension recording produced a task over 200ms: ${result.maxLongTaskMs}ms`);
  if (result.frameSamples > 12) throw new Error(`Frame sample budget exceeded: ${result.frameSamples}`);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close().catch(() => undefined);
}

function reportStage(stage) {
  if (process.env.DESIGN_LENS_PERF_DEBUG === "1") process.stderr.write(`[performance] ${stage}\n`);
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function installExtensionApiMock(page) {
  await page.evaluate(() => {
    window.__designLensListener = null;
    window.__sendDesignLensMessage = (message) => new Promise((resolveMessage, rejectMessage) => {
      if (!window.__designLensListener) {
        rejectMessage(new Error("Design Lens content listener is unavailable"));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) rejectMessage(new Error(`Content message timed out: ${message.type}`));
      }, 30_000);
      const sendResponse = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveMessage(response);
      };
      const keepChannelOpen = window.__designLensListener(message, {}, sendResponse);
      if (keepChannelOpen !== true && !settled) sendResponse(undefined);
    });
    const extensionApi = {
      runtime: {
        id: "design-lens-performance-test",
        onMessage: {
          addListener(listener) { window.__designLensListener = listener; }
        },
        sendMessage: async () => ({ ok: false, error: "Background APIs are unavailable in the content-runtime stress test" })
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => undefined
        }
      }
    };
    window.browser = extensionApi;
    window.chrome = extensionApi;
  });
}

function stressPage(nodeCount) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Design Lens performance fixture</title>
      <style>
        body { margin: 0; font: 14px system-ui; }
        #heartbeat { position: fixed; inset: 8px auto auto 8px; z-index: 2; }
        #grid { display: grid; grid-template-columns: repeat(40, 24px); gap: 1px; padding-top: 48px; }
        .node { width: 24px; height: 10px; background: #ddd; }
        .node.active { background: #111; transform: translateX(1px); }
      </style>
    </head>
    <body>
      <button id="heartbeat" type="button">heartbeat</button>
      <main id="grid"></main>
      <script>
        window.__longTasks = [];
        window.__heartbeatCount = 0;
        new PerformanceObserver((list) => {
          window.__longTasks.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ type: "longtask", buffered: true });
        const grid = document.querySelector("#grid");
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < ${Math.max(1, nodeCount - 4)}; index += 1) {
          const node = document.createElement("div");
          node.className = "node";
          fragment.appendChild(node);
        }
        grid.appendChild(fragment);
        const nodes = Array.from(document.querySelectorAll(".node"));
        let cursor = 0;
        setInterval(() => {
          for (let index = 0; index < 120; index += 1) {
            const node = nodes[(cursor + index) % nodes.length];
            node.classList.toggle("active");
          }
          cursor = (cursor + 120) % nodes.length;
        }, 16);
        document.querySelector("#heartbeat").addEventListener("click", () => { window.__heartbeatCount += 1; });
        window.__stressReady = true;
      </script>
    </body>
  </html>`;
}
