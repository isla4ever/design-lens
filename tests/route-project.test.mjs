import assert from "node:assert/strict";
import test from "node:test";
import { addCaptureToRouteProject, MAX_REBUILD_ROUTES, removeRouteFromProject } from "../src/capture-v2/core/rebuild-route-project.ts";
import { DEFAULT_DESIGN_BRIEF } from "../src/shared/design-brief.ts";
import { buildMultiRouteRebuildDraftPackFiles } from "../entrypoints/popup/pack-builder.ts";

test("route projects replace the same route and reject cross-origin or over-limit captures", () => {
  let project = addCaptureToRouteProject(null, captureFixture("https://example.test/", "Home"), "2026-07-15T00:00:00.000Z");
  project = addCaptureToRouteProject(project, captureFixture("https://example.test/about", "About"), "2026-07-15T00:01:00.000Z");
  project = addCaptureToRouteProject(project, captureFixture("https://example.test/about", "About updated"), "2026-07-15T00:02:00.000Z");
  assert.equal(project.routes.length, 2);
  assert.equal(project.routes.find((route) => route.path === "/about").title, "About updated");
  assert.throws(() => addCaptureToRouteProject(project, captureFixture("https://other.test/", "Other")), /same origin/);

  for (let index = 0; project.routes.length < MAX_REBUILD_ROUTES; index += 1) {
    project = addCaptureToRouteProject(project, captureFixture(`https://example.test/page-${index}`, `Page ${index}`));
  }
  assert.throws(() => addCaptureToRouteProject(project, captureFixture("https://example.test/overflow", "Overflow")), /at most 8 routes/);
  assert.equal(removeRouteFromProject(project, project.routes[0].id).routes.length, MAX_REBUILD_ROUTES - 1);
});

test("site rebuild packs namespace every route and publish per-route verifier commands", () => {
  let project = addCaptureToRouteProject(null, captureFixture("https://example.test/", "Home"));
  project = addCaptureToRouteProject(project, captureFixture("https://example.test/about", "About"));
  const brief = {
    ...DEFAULT_DESIGN_BRIEF,
    mode: "rebuild",
    output: "full-site",
    rebuild: { ...DEFAULT_DESIGN_BRIEF.rebuild, authorizationConfirmed: true }
  };
  const files = buildMultiRouteRebuildDraftPackFiles(project.routes, brief, "zh");
  const names = new Set(files.map((file) => file.name));
  const manifest = JSON.parse(files.find((file) => file.name === "route-manifest.json").content);
  assert.equal(manifest.routeCount, 2);
  assert.equal(manifest.navigationPolicy, "manual-explicit-capture");
  for (const route of manifest.routes) {
    assert.equal(names.has(`${route.folder}/capture-project-v2.json`), true);
    assert.equal(names.has(`${route.folder}/scene-manifest.json`), true);
    assert.match(route.verifyCommand, new RegExp(`--route ${route.id}`));
  }
  assert.match(files.find((file) => file.name === "README.md").content, /逐路由验收/);
});

function captureFixture(url, title) {
  const capturedAt = "2026-07-15T00:00:00.000Z";
  return {
    scope: "page",
    page: { title, url, capturedAt },
    viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
    tokens: { cssVariables: [], colors: [], backgrounds: [], spacing: [], radii: [], shadows: [], typography: [] },
    layout: [],
    layoutProfile: { density: "balanced", composition: "page", dominantDisplays: [], dominantGaps: [], alignment: [], structure: [], cadence: [], emphasis: [] },
    components: [],
    motion: [],
    interactions: [],
    evidence: [],
    analysis: { character: "structured", tags: [], recommendations: [] },
    rebuildEvidence: {
      version: 1,
      recordingId: `recording-${title.toLowerCase().replace(/\W+/g, "-")}`,
      storageProjectId: `storage-${title.toLowerCase().replace(/\W+/g, "-")}`,
      privacy: { maskAllInputs: true, recordCanvas: false, recordCrossOriginIframes: false },
      request: { viewports: ["desktop"], states: ["initial"] },
      scenes: [],
      artifacts: [],
      document: { width: 1440, height: 900, maxCapturedScrollY: 0, truncated: false },
      errors: []
    }
  };
}
