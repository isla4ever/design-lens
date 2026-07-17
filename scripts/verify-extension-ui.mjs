import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const extensionPath = resolve(".output/chrome-mv3");
const outputDir = resolve("output/playwright/extension-ui");
const profilePath = await mkdtemp(join(tmpdir(), "design-lens-ui-"));
const manifest = JSON.parse(await readFile(join(extensionPath, "manifest.json"), "utf8"));
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html><head><title>Compact target</title></head><body><main><h1>Compact target</h1><button>Fixture button</button></main></body></html>");
});

if (manifest.action?.default_popup) {
  throw new Error("The toolbar action must default to the Side Panel, not the compact popup");
}

await mkdir(outputDir, { recursive: true });
await new Promise((resolvePromise, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolvePromise);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("UI fixture server did not expose a TCP port");
const fixtureUrl = `http://127.0.0.1:${address.port}/`;
let context;

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const results = [];

  for (const fixture of [
    { name: "popup-zh-light", path: "popup.html", width: 380, height: 600, locale: "zh", theme: "light" },
    { name: "popup-en-dark-narrow", path: "popup.html", width: 320, height: 600, locale: "en", theme: "dark" },
    { name: "sidepanel-zh-light", path: "sidepanel.html", width: 360, height: 800, locale: "zh", theme: "light" },
    { name: "sidepanel-en-dark-narrow", path: "sidepanel.html", width: 320, height: 800, locale: "en", theme: "dark" },
    { name: "sidepanel-settings-zh-light", path: "sidepanel.html", width: 360, height: 800, locale: "zh", theme: "light", view: "settings" },
    { name: "sidepanel-settings-en-dark-narrow", path: "sidepanel.html", width: 320, height: 800, locale: "en", theme: "dark", view: "settings" }
  ]) {
    await worker.evaluate(async ({ locale, theme, view }) => {
      await chrome.storage.local.set({ designLensLocale: locale, designLensTheme: theme });
      if (view) await chrome.storage.local.set({ designLensSidePanelView: view });
      else await chrome.storage.local.remove("designLensSidePanelView");
    }, fixture);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await page.goto(`chrome-extension://${extensionId}/${fixture.path}`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    await page.waitForTimeout(120);

    const layout = await page.evaluate(() => {
      const main = document.querySelector("main");
      const visibleButtons = Array.from(document.querySelectorAll("button")).filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const misaligned = visibleButtons.flatMap((button) => {
        const icon = button.querySelector("svg");
        if (!icon) return [];
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const delta = Math.abs((buttonRect.top + buttonRect.height / 2) - (iconRect.top + iconRect.height / 2));
        return delta > 1.5 ? [{ label: button.getAttribute("aria-label") || button.textContent?.trim(), delta }] : [];
      });
      const wrappingButtons = visibleButtons.flatMap((button) =>
        getComputedStyle(button).whiteSpace === "nowrap" ? [] : [button.getAttribute("aria-label") || button.textContent?.trim()]
      );
      const unnamedButtons = visibleButtons.flatMap((button) =>
        button.getAttribute("aria-label") || button.textContent?.trim() ? [] : [button.outerHTML.slice(0, 120)]
      );
      return {
        documentOverflowX: document.documentElement.scrollWidth > window.innerWidth,
        mainOverflowX: main ? main.scrollWidth > main.clientWidth : true,
        misaligned,
        wrappingButtons,
        unnamedButtons
      };
    });

    if (errors.length) throw new Error(`${fixture.name} console errors: ${errors.join(" | ")}`);
    if (layout.documentOverflowX || layout.mainOverflowX) throw new Error(`${fixture.name} has horizontal overflow`);
    if (layout.misaligned.length) throw new Error(`${fixture.name} has misaligned icons: ${JSON.stringify(layout.misaligned)}`);
    if (layout.wrappingButtons.length) throw new Error(`${fixture.name} has wrapping button labels: ${layout.wrappingButtons.join(", ")}`);
    if (layout.unnamedButtons.length) throw new Error(`${fixture.name} has unnamed buttons`);

    const screenshot = join(outputDir, `${fixture.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    results.push({ ...fixture, screenshot, ...layout, consoleErrors: errors });
    await page.close();
  }

  const targetPage = await context.newPage();
  await targetPage.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  const targetTab = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === url) ?? null;
  }, fixtureUrl);
  if (!targetTab?.id) throw new Error("Compact target tab was not found");
  const compactPage = await context.newPage();
  await compactPage.goto(`chrome-extension://${extensionId}/popup.html?targetTabId=${targetTab.id}`, { waitUntil: "domcontentloaded" });
  await compactPage.locator(".secondary-action").waitFor();
  await Promise.all([
    compactPage.waitForEvent("close", { timeout: 5000 }),
    compactPage.locator(".secondary-action").click()
  ]);
  results.push({ name: "compact-target-routing", targetTabId: targetTab.id, passed: true });
  await targetPage.close();

  console.log(JSON.stringify({ defaultSurface: "side-panel", results }, null, 2));
} finally {
  await context?.close().catch(() => undefined);
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profilePath, { recursive: true, force: true });
}
