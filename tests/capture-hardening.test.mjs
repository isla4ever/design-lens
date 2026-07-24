import assert from "node:assert/strict";
import test from "node:test";
import { buildSelector } from "../src/analyzer/core/dom-utils.ts";
import { sanitizeImplementationResourceUrl } from "../src/analyzer/capture/implementation-trace.ts";
import { CaptureBudgetGuard } from "../src/smart-capture/budget-guard.ts";

test("stable selectors omit transient state classes and preserve the real stable attribute", () => {
  const documentElement = {};
  const parent = element({ tagName: "DIV", classes: ["center-search__bar", "is-focus"] });
  const target = element({
    tagName: "INPUT",
    classes: ["nav-search-input", "active"],
    attributes: { "aria-label": "搜索视频" },
    parent,
    documentElement
  });
  parent.ownerDocument = target.ownerDocument;
  assert.equal(buildSelector(target), 'input[aria-label="搜索视频"]');

  const child = element({ tagName: "DIV", classes: ["nav-search-content", "is-actived"], parent, documentElement });
  parent.ownerDocument = child.ownerDocument;
  assert.equal(buildSelector(child), "div.center-search__bar > div.nav-search-content");
});

test("implementation resource URLs discard credentials, query strings, and fragments", () => {
  assert.equal(
    sanitizeImplementationResourceUrl("https://user:secret@cdn.example.test/cover.avif?token=private#frame", "https://example.test/"),
    "https://cdn.example.test/cover.avif"
  );
  assert.equal(sanitizeImplementationResourceUrl("data:image/png;base64,secret", "https://example.test/"), "data:[omitted]");
  assert.equal(sanitizeImplementationResourceUrl("/app.js?session=private", "https://example.test/page"), "https://example.test/app.js");
});

test("capture budget ignores buffered long tasks that started before capture", () => {
  const previousPerformanceObserver = globalThis.PerformanceObserver;
  const previousMutationObserver = globalThis.MutationObserver;
  let longTaskCallback;
  globalThis.PerformanceObserver = class {
    constructor(callback) { longTaskCallback = callback; }
    observe() {}
    disconnect() {}
  };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  try {
    const guard = new CaptureBudgetGuard({ documentElement: {} }, { performance: { now: () => 1_000 } });
    guard.start();
    longTaskCallback({ getEntries: () => [
      { startTime: 200, duration: 260 },
      { startTime: 1_020, duration: 65 }
    ] });
    const summary = guard.stop();
    assert.equal(summary.longTaskCount, 1);
    assert.equal(summary.maxLongTaskMs, 65);
    assert.deepEqual(summary.reasons, ["long-task"]);
  } finally {
    globalThis.PerformanceObserver = previousPerformanceObserver;
    globalThis.MutationObserver = previousMutationObserver;
  }
});

function element({ tagName, classes = [], attributes = {}, parent = null, documentElement = {} }) {
  const ownerDocument = parent?.ownerDocument ?? { documentElement };
  return {
    tagName,
    id: "",
    classList: classes,
    parentElement: parent,
    ownerDocument,
    getAttribute(name) { return attributes[name] ?? null; }
  };
}
