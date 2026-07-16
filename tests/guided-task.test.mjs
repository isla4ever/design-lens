import assert from "node:assert/strict";
import test from "node:test";
import { formatGuidedTaskCopy } from "../src/overlay/page-overlay-view.ts";
import { createGuidedTaskObserver, hasExplicitOpenSignal } from "../src/smart-capture/guided-task-observer.ts";

class FakeWindow extends EventTarget {
  innerWidth = 1280;
  scrollY = 0;
  setTimeout = (callback, delay) => globalThis.setTimeout(callback, delay);
  clearTimeout = (timer) => globalThis.clearTimeout(timer);
}

test("guided task copy gives one concise user action without exposing selectors", () => {
  const copy = formatGuidedTaskCopy({ kind: "capture-state", trigger: "hover", state: "hover", selector: ".private-selector" }, "zh");
  assert.equal(copy.title, "补采悬停状态");
  assert.match(copy.hint, /稳定后自动保存/);
  assert.equal(JSON.stringify(copy).includes("private-selector"), false);
});

test("guided scroll observer completes only after the requested position is stable", async () => {
  const win = new FakeWindow();
  const evidence = [];
  const observer = createGuidedTaskObserver({
    doc: {},
    win,
    task: { kind: "capture-state", trigger: "scroll", state: "scroll", targetScrollY: 640 },
    onReady: (value) => evidence.push(value),
    onTimeout: () => evidence.push({ phase: "timeout" }),
    timeoutMs: 2_000
  });
  observer.start();
  win.scrollY = 200;
  win.dispatchEvent(new Event("scroll"));
  await delay(350);
  assert.equal(evidence.length, 0);
  win.scrollY = 650;
  win.dispatchEvent(new Event("scroll"));
  await delay(350);
  assert.deepEqual(evidence, [{ phase: "responsive-scroll" }]);
});

test("guided responsive observer waits for the requested viewport class", async () => {
  const win = new FakeWindow();
  const evidence = [];
  const observer = createGuidedTaskObserver({
    doc: {},
    win,
    task: { kind: "capture-responsive", trigger: "initial", viewport: "mobile" },
    onReady: (value) => evidence.push(value),
    onTimeout: () => evidence.push({ phase: "timeout" }),
    timeoutMs: 2_000
  });
  observer.start();
  await delay(390);
  assert.equal(evidence.length, 0);
  win.innerWidth = 390;
  win.dispatchEvent(new Event("resize"));
  await delay(390);
  assert.deepEqual(evidence, [{ phase: "responsive-initial" }]);
});

test("guided open evidence requires an explicit target signal", () => {
  const doc = { getElementById: () => null };
  const target = (attributes) => ({
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name)
  });
  assert.equal(hasExplicitOpenSignal(target({ class: "account-button" }), doc), false);
  assert.equal(hasExplicitOpenSignal(target({ "aria-expanded": "true" }), doc), true);
  assert.equal(hasExplicitOpenSignal(target({ class: "account-button is-open" }), doc), true);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
