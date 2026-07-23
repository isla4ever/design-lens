import assert from "node:assert/strict";
import test from "node:test";
import { formatCoverageStatus } from "../entrypoints/popup/RebuildCoverage.tsx";
import { buildCompactPopupPath, openCompactActionPopup } from "../src/shared/compact-popup.ts";
import { isSmartCaptureProgressNotice } from "../src/shared/workspace-notice.ts";

test("popup coverage labels do not present unavailable evidence as complete", () => {
  assert.equal(formatCoverageStatus("complete", "zh"), "完整");
  assert.equal(formatCoverageStatus("partial", "zh"), "部分");
  assert.equal(formatCoverageStatus("missing", "zh"), "缺失");
  assert.equal(formatCoverageStatus("not-applicable", "zh"), "不适用");
  assert.equal(formatCoverageStatus("unauthorized", "zh"), "未授权");
  assert.equal(formatCoverageStatus("failed", "zh"), "失败");
  assert.equal(formatCoverageStatus("future-status", "zh"), "未知");
  assert.equal(formatCoverageStatus("not-applicable", "en"), "Not applicable");
});

test("compact view opens the native action popup and restores Side Panel routing", async () => {
  const calls = [];
  const previousBrowser = globalThis.browser;
  globalThis.browser = {
    action: {
      async setPopup(details) { calls.push(["setPopup", details]); },
      async openPopup() { calls.push(["openPopup"]); }
    }
  };

  try {
    assert.equal(buildCompactPopupPath(42), "popup.html?targetTabId=42");
    await openCompactActionPopup(42);
    assert.deepEqual(calls, [
      ["setPopup", { tabId: 42, popup: "popup.html?targetTabId=42" }],
      ["openPopup"],
      ["setPopup", { tabId: 42, popup: "" }]
    ]);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test("compact popup routing is restored when native popup opening fails", async () => {
  const calls = [];
  const previousBrowser = globalThis.browser;
  globalThis.browser = {
    action: {
      async setPopup(details) { calls.push(details); },
      async openPopup() { throw new Error("not available"); }
    }
  };

  try {
    await assert.rejects(() => openCompactActionPopup(7), /not available/);
    assert.deepEqual(calls.at(-1), { tabId: 7, popup: "" });
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test("only transient Smart Capture progress notices auto-dismiss", () => {
  assert.equal(isSmartCaptureProgressNotice("智能捕获进行中"), true);
  assert.equal(isSmartCaptureProgressNotice("Smart Capture in progress"), true);
  assert.equal(isSmartCaptureProgressNotice("正在启动智能捕获..."), true);
  assert.equal(isSmartCaptureProgressNotice("捕获已停止"), false);
  assert.equal(isSmartCaptureProgressNotice("AI 配置已保存"), false);
});
