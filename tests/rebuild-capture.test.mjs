import assert from "node:assert/strict";
import test from "node:test";
import { buildScrollCapturePositions, collectSceneScreenshots } from "../src/capture-v2/browser/scene-screenshot-collector.ts";
import { RrwebEventBuffer } from "../src/capture-v2/rrweb/rrweb-event-buffer.ts";
import { setScreenshotPrivacyMask } from "../src/capture-v2/browser/screenshot-privacy-mask.ts";

test("rrweb event buffer keeps the initial meta and full snapshot when capped", () => {
  const buffer = new RrwebEventBuffer(4);
  buffer.push({ type: 4, timestamp: 1, data: { href: "https://example.test" } });
  buffer.push({ type: 2, timestamp: 2, data: { node: "snapshot" } });
  buffer.push({ type: 3, timestamp: 3, data: { source: 1 } });
  buffer.push({ type: 3, timestamp: 4, data: { source: 1 } });
  buffer.push({ type: 3, timestamp: 5, data: { source: 1 } });

  const snapshot = buffer.snapshot();
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.events.length, 4);
  assert.equal(snapshot.events.some((event) => event.type === 4), true);
  assert.equal(snapshot.events.some((event) => event.type === 2), true);
  assert.equal(snapshot.events.at(-1).timestamp, 4);
});

test("rrweb event buffer trips the mutation circuit breaker before accepting an oversized batch", () => {
  const buffer = new RrwebEventBuffer(10, 3);
  assert.equal(buffer.push({ type: 4, timestamp: 1, data: {} }), true);
  assert.equal(buffer.push({ type: 2, timestamp: 2, data: { node: "snapshot" } }), true);
  assert.equal(buffer.push({
    type: 3,
    timestamp: 3,
    data: { source: 0, texts: [{ id: 1 }], attributes: [{ id: 2 }], adds: [], removes: [] }
  }), true);
  assert.equal(buffer.push({
    type: 3,
    timestamp: 4,
    data: { source: 0, texts: [], attributes: [], adds: [{ id: 3 }], removes: [{ id: 4 }] }
  }), false);

  const snapshot = buffer.snapshot();
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.events.length, 3);
  assert.equal(snapshot.events.at(-1).timestamp, 3);
});

test("scroll position planning includes page edges and caps very long pages", () => {
  assert.deepEqual(buildScrollCapturePositions(0, 800), [0]);
  assert.deepEqual(buildScrollCapturePositions(1600, 800), [0, 800, 1600]);
  const capped = buildScrollCapturePositions(20_000, 500, 5);
  assert.equal(capped.length, 5);
  assert.equal(capped[0], 0);
  assert.equal(capped.at(-1), 20_000);
  assert.equal(buildScrollCapturePositions(20_000, 500).length, 5);
});

test("scene screenshot collection restores scroll, CSS behavior, and capture UI", async () => {
  const scrollCalls = [];
  const hiddenStates = [];
  const win = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
    scrollX: 32,
    scrollY: 120,
    scrollTo(x, y) {
      this.scrollX = x;
      this.scrollY = y;
      scrollCalls.push([x, y]);
    },
    requestAnimationFrame(callback) {
      callback(0);
      return 1;
    }
  };
  const root = {
    style: { scrollBehavior: "smooth" },
    scrollWidth: 1200,
    offsetWidth: 1200,
    clientWidth: 1200,
    scrollHeight: 2400,
    offsetHeight: 2400,
    clientHeight: 800
  };
  const body = {
    style: { scrollBehavior: "" },
    scrollWidth: 1200,
    offsetWidth: 1200,
    clientWidth: 1200,
    scrollHeight: 2400,
    offsetHeight: 2400,
    clientHeight: 800
  };

  const result = await collectSceneScreenshots({
    win,
    doc: { documentElement: root, body, fonts: { ready: Promise.resolve() } },
    recordingId: "test-recording",
    storageProjectId: "test-project",
    phase: "page-baseline",
    positions: [0, 800, 1600],
    settle: async () => {},
    setCaptureUiHidden: (hidden) => hiddenStates.push(hidden),
    captureVisibleTab: async (request) => ({
      id: request.artifactId,
      kind: "screenshot",
      name: request.name,
      mediaType: "image/png",
      size: 128,
      createdAt: request.createdAt
    })
  });

  assert.equal(result.scenes.length, 3);
  assert.equal(result.artifacts.length, 3);
  assert.deepEqual(scrollCalls.at(-1), [32, 120]);
  assert.equal(win.scrollX, 32);
  assert.equal(win.scrollY, 120);
  assert.equal(root.style.scrollBehavior, "smooth");
  assert.deepEqual(hiddenStates, [true, false]);
});

test("scene screenshot collection restores the page after capture failure", async () => {
  const win = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 75,
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
    requestAnimationFrame(callback) { callback(0); return 1; }
  };
  const element = {
    style: { scrollBehavior: "smooth" },
    scrollWidth: 800,
    offsetWidth: 800,
    clientWidth: 800,
    scrollHeight: 1200,
    offsetHeight: 1200,
    clientHeight: 600
  };
  const result = await collectSceneScreenshots({
    win,
    doc: { documentElement: element, body: null },
    recordingId: "failed-recording",
    storageProjectId: "failed-project",
    phase: "page-baseline",
    positions: [0],
    settle: async () => {},
    captureVisibleTab: async () => { throw new Error("capture denied"); }
  });

  assert.equal(result.scenes[0].status, "failed");
  assert.match(result.scenes[0].error, /capture denied/);
  assert.equal(win.scrollY, 75);
  assert.equal(element.style.scrollBehavior, "smooth");
});

test("scene screenshot collection stops after a capture timeout and still restores the page", async () => {
  const hiddenStates = [];
  const win = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    scrollX: 12,
    scrollY: 90,
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
    requestAnimationFrame(callback) { callback(0); return 1; }
  };
  const element = {
    style: { scrollBehavior: "smooth" },
    scrollWidth: 800,
    offsetWidth: 800,
    clientWidth: 800,
    scrollHeight: 1800,
    offsetHeight: 1800,
    clientHeight: 600
  };
  const result = await collectSceneScreenshots({
    win,
    doc: { documentElement: element, body: null },
    recordingId: "timeout-recording",
    storageProjectId: "timeout-project",
    phase: "page-baseline",
    positions: [0, 600, 1200],
    settle: async () => {},
    captureTimeoutMs: 5,
    setCaptureUiHidden: (hidden) => hiddenStates.push(hidden),
    captureVisibleTab: () => new Promise(() => {})
  });

  assert.equal(result.scenes.length, 1);
  assert.equal(result.scenes[0].status, "failed");
  assert.match(result.scenes[0].error, /timed out/i);
  assert.equal(result.truncated, true);
  assert.equal(win.scrollX, 12);
  assert.equal(win.scrollY, 90);
  assert.equal(element.style.scrollBehavior, "smooth");
  assert.deepEqual(hiddenStates, [true, false]);
});

test("scene screenshot collection restores UI styles even when final settling fails", async () => {
  const hiddenStates = [];
  let settleCalls = 0;
  const win = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 40,
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
    requestAnimationFrame(callback) { callback(0); return 1; }
  };
  const element = {
    style: { scrollBehavior: "smooth" },
    scrollWidth: 800,
    offsetWidth: 800,
    clientWidth: 800,
    scrollHeight: 600,
    offsetHeight: 600,
    clientHeight: 600
  };

  await assert.rejects(() => collectSceneScreenshots({
    win,
    doc: { documentElement: element, body: null },
    recordingId: "settle-failure",
    storageProjectId: "settle-failure",
    phase: "page-baseline",
    positions: [0],
    setCaptureUiHidden: (hidden) => hiddenStates.push(hidden),
    settle: async () => {
      settleCalls += 1;
      if (settleCalls === 2) throw new Error("page detached");
    },
    captureVisibleTab: async (request) => ({ id: request.artifactId, kind: "screenshot", name: request.name, mediaType: "image/png", size: 4, createdAt: request.createdAt })
  }), /page detached/);

  assert.equal(win.scrollY, 40);
  assert.equal(element.style.scrollBehavior, "smooth");
  assert.deepEqual(hiddenStates, [true, false]);
});

test("screenshot privacy mask hides editable text and removes itself cleanly", () => {
  const elements = new Map();
  const parent = {
    appendChild(element) {
      element.remove = () => elements.delete(element.id);
      elements.set(element.id, element);
    }
  };
  const doc = {
    head: parent,
    documentElement: parent,
    getElementById(id) { return elements.get(id) ?? null; },
    createElement() { return { id: "", textContent: "", remove() {} }; }
  };
  setScreenshotPrivacyMask(doc, true);
  const style = elements.get("design-lens-capture-privacy-mask");
  assert.match(style.textContent, /input:not/);
  assert.match(style.textContent, /contenteditable/);
  assert.match(style.textContent, /-webkit-text-fill-color: transparent/);
  setScreenshotPrivacyMask(doc, false);
  assert.equal(elements.size, 0);
});
