import assert from "node:assert/strict";
import test from "node:test";
import { formatCoverageStatus } from "../entrypoints/popup/RebuildCoverage.tsx";

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
