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
      const clippedButtonLabels = visibleButtons.flatMap((button) => {
        const label = button.querySelector(":scope > span");
        if (!label) return [];
        return label.scrollWidth > label.clientWidth + 1
          ? [button.getAttribute("aria-label") || button.textContent?.trim()]
          : [];
      });
      const silentlyTruncatedText = Array.from(document.querySelectorAll(".status, .workspace-notice span, .workspace-task strong, .workspace-task span, .configuration-guide strong, .configuration-guide span, .authorization-prompt p")).flatMap((element) => {
        const style = getComputedStyle(element);
        const isClipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        return isClipped && (style.overflow === "hidden" || style.textOverflow === "ellipsis")
          ? [element.textContent?.trim()]
          : [];
      });
      return {
        documentOverflowX: document.documentElement.scrollWidth > window.innerWidth,
        mainOverflowX: main ? main.scrollWidth > main.clientWidth : true,
        misaligned,
        wrappingButtons,
        unnamedButtons,
        clippedButtonLabels,
        silentlyTruncatedText
      };
    });

    if (errors.length) throw new Error(`${fixture.name} console errors: ${errors.join(" | ")}`);
    if (layout.documentOverflowX || layout.mainOverflowX) throw new Error(`${fixture.name} has horizontal overflow`);
    if (layout.misaligned.length) throw new Error(`${fixture.name} has misaligned icons: ${JSON.stringify(layout.misaligned)}`);
    if (layout.wrappingButtons.length) throw new Error(`${fixture.name} has wrapping button labels: ${layout.wrappingButtons.join(", ")}`);
    if (layout.unnamedButtons.length) throw new Error(`${fixture.name} has unnamed buttons`);
    if (layout.clippedButtonLabels.length) throw new Error(`${fixture.name} has clipped button labels: ${layout.clippedButtonLabels.join(", ")}`);
    if (layout.silentlyTruncatedText.length) throw new Error(`${fixture.name} silently truncates critical text: ${layout.silentlyTruncatedText.join(" | ")}`);

    const screenshot = join(outputDir, `${fixture.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    results.push({ ...fixture, screenshot, ...layout, consoleErrors: errors });
    await page.close();
  }

  const historyPage = await context.newPage();
  await historyPage.setViewportSize({ width: 360, height: 800 });
  await historyPage.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: "domcontentloaded" });
  await historyPage.evaluate(async (url) => {
    const capturedAt = new Date().toISOString();
    const capture = {
      scope: "page",
      page: { url, title: "History alignment fixture", capturedAt },
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
      tokens: { cssVariables: [], colors: [], backgrounds: [], spacing: [], radii: [], shadows: [], typography: [] },
      layout: [],
      layoutProfile: { density: "balanced", composition: "page", dominantDisplays: [], dominantGaps: [], alignment: [], structure: [], cadence: [], emphasis: [] },
      components: [],
      motion: [],
      interactions: [],
      evidence: [],
      analysis: { character: "structured", tags: [], recommendations: [] }
    };
    const record = {
      id: "ui-history-fixture",
      tabId: 987654,
      url,
      title: "History alignment fixture",
      mode: "reference",
      capture,
      updatedAt: capturedAt
    };
    await new Promise((resolvePromise, reject) => {
      const request = indexedDB.open("design-lens-captures", 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("workspaceCaptures", "readwrite");
        transaction.objectStore("workspaceCaptures").put(record);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolvePromise();
        };
      };
    });
  }, fixtureUrl);
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ designLensLocale: "zh", designLensTheme: "light", designLensSidePanelView: "history" });
  });
  await historyPage.reload({ waitUntil: "domcontentloaded" });
  const historyItem = historyPage.locator(".history-item");
  await historyItem.waitFor();
  const historyLayout = await historyItem.evaluate((item) => {
    const select = item.querySelector(".history-select");
    const title = item.querySelector(".history-select strong");
    const deleteButton = item.querySelector(".history-delete");
    const deleteIcon = deleteButton?.querySelector("svg");
    if (!select || !title || !deleteButton || !deleteIcon) throw new Error("History fixture is incomplete");
    const selectRect = select.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const buttonRect = deleteButton.getBoundingClientRect();
    const iconRect = deleteIcon.getBoundingClientRect();
    return {
      titleInset: titleRect.left - selectRect.left,
      titleIsLeftAligned: titleRect.left < selectRect.left + selectRect.width / 3,
      deleteIconDeltaX: Math.abs((buttonRect.left + buttonRect.width / 2) - (iconRect.left + iconRect.width / 2)),
      deleteIconDeltaY: Math.abs((buttonRect.top + buttonRect.height / 2) - (iconRect.top + iconRect.height / 2))
    };
  });
  if (!historyLayout.titleIsLeftAligned || historyLayout.titleInset < 8 || historyLayout.titleInset > 16) {
    throw new Error(`History content is not left aligned: ${JSON.stringify(historyLayout)}`);
  }
  if (historyLayout.deleteIconDeltaX > 1.5 || historyLayout.deleteIconDeltaY > 1.5) {
    throw new Error(`History delete icon is not centered: ${JSON.stringify(historyLayout)}`);
  }
  await historyPage.locator(".history-select").click();
  const configurationGuide = historyPage.locator(".configuration-guide");
  await configurationGuide.waitFor();
  const guideLayout = await configurationGuide.evaluate((guide) => ({
    overflowX: guide.scrollWidth > guide.clientWidth,
    title: guide.querySelector("strong")?.textContent?.trim(),
    action: guide.querySelector("button")?.textContent?.trim(),
    actionWraps: guide.querySelector("button") ? getComputedStyle(guide.querySelector("button")).whiteSpace !== "nowrap" : true
  }));
  if (guideLayout.overflowX || guideLayout.actionWraps || guideLayout.title !== "首次生成前配置 AI" || guideLayout.action !== "去设置") {
    throw new Error(`First-use AI configuration guide is invalid: ${JSON.stringify(guideLayout)}`);
  }
  await historyPage.screenshot({ path: join(outputDir, "sidepanel-first-use-ai-guide.png"), fullPage: true, animations: "disabled" });
  await configurationGuide.locator("button").click();
  await historyPage.locator(".settings-layout").waitFor();
  await historyPage.locator('.workspace-tabs button[aria-label="历史"]').click();
  await historyItem.waitFor();
  await historyPage.locator(".history-delete").click();
  const confirmation = historyPage.locator(".history-confirmation");
  await confirmation.waitFor();
  if (!await historyPage.locator(".history-confirm").evaluate((button) => button === document.activeElement)) {
    throw new Error("History delete confirmation did not receive focus");
  }
  await historyPage.locator(".history-cancel").click();
  await confirmation.waitFor({ state: "detached" });
  await historyPage.locator(".history-delete").click();
  await historyPage.screenshot({ path: join(outputDir, "sidepanel-history-delete-confirmation.png"), fullPage: true, animations: "disabled" });
  await historyPage.locator(".history-confirm").click();
  await historyItem.waitFor({ state: "detached" });
  results.push({ name: "sidepanel-history-actions", ...historyLayout, confirmation: true, passed: true });
  results.push({ name: "sidepanel-first-use-ai-guide", ...guideLayout, settingsNavigation: true, passed: true });
  await historyPage.close();

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
