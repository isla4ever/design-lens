import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { captureProjectFromDesignCapture } from "../src/capture-v2/core/from-design-capture.ts";
import { parseCaptureProject, safeParseCaptureProject } from "../src/capture-v2/core/capture-project.ts";
import { CaptureProjectStore } from "../src/storage/capture-project-store.ts";

function captureFixture() {
  return {
    scope: "page",
    page: {
      title: "Protocol fixture",
      url: "https://example.test/protocol",
      capturedAt: "2026-07-13T12:00:00.000Z"
    },
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    tokens: {
      cssVariables: [],
      colors: [],
      backgrounds: [],
      spacing: [],
      radii: [],
      shadows: [],
      typography: []
    },
    layout: [],
    layoutProfile: {
      density: "balanced",
      composition: "single page",
      dominantDisplays: [],
      dominantGaps: [],
      alignment: [],
      structure: [],
      cadence: [],
      emphasis: []
    },
    components: [{
      id: "hero",
      name: "Hero Section",
      selector: "main.hero",
      tagName: "main",
      confidence: 90,
      textSample: "A captured hero",
      layout: {
        display: "grid",
        position: "relative",
        width: 1200,
        height: 680,
        gap: "24px",
        gridTemplateColumns: "1fr 1fr",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "start"
      },
      visual: {
        color: "rgb(17, 23, 19)",
        backgroundColor: "rgb(255, 255, 255)",
        font: "700 64px/1 Inter",
        borderRadius: "0px",
        boxShadow: "none",
        border: "0px none rgb(17, 23, 19)"
      }
    }],
    motion: [],
    interactions: [{
      id: "hero-link",
      selector: "main.hero a",
      trigger: "navigation",
      affordance: "navigation link",
      cursor: "pointer",
      role: "link",
      stateSignals: [],
      transitionProperties: []
    }],
    evidence: [],
    analysis: { character: "structured", tags: [], recommendations: [] }
  };
}

test("v1 capture adapter creates a valid v2 project without inventing unavailable evidence", () => {
  const project = captureProjectFromDesignCapture(captureFixture());
  assert.equal(parseCaptureProject(project).version, 2);
  assert.equal(project.mode, "reference");
  assert.equal(project.scenes.length, 1);
  assert.deepEqual(project.nodes.hero.rectByScene, {});
  assert.equal(project.capabilities.screenshots, false);
  assert.equal(project.capabilities.matchedStyles, false);
  assert.equal(project.interactions.transitions[0].source, "inferred");
  assert.equal(project.coverage.items.find((item) => item.area === "responsive").status, "missing");
  assert.equal(project.artifacts["capture-v1"].name, "capture-v1.json");
});

test("capture project runtime validation rejects incompatible data", () => {
  const project = captureProjectFromDesignCapture(captureFixture());
  assert.equal(safeParseCaptureProject({ ...project, version: 1 }).success, false);
  assert.equal(safeParseCaptureProject({
    ...project,
    scenes: [{ ...project.scenes[0], viewport: { ...project.scenes[0].viewport, width: 0 } }]
  }).success, false);
});

test("capture project store persists projects and multi-megabyte binary artifacts", async () => {
  const store = new CaptureProjectStore(`design-lens-test-${Date.now()}-${Math.random()}`);
  const project = captureProjectFromDesignCapture(captureFixture());
  const binary = new Uint8Array(5 * 1024 * 1024);
  binary.fill(91);
  try {
    await store.putProject(project);
    await store.putArtifact({
      projectId: project.id,
      artifactId: "large-screenshot",
      kind: "screenshot",
      name: "baseline.bin",
      mediaType: "application/octet-stream",
      data: binary
    });

    const storedProject = await store.getProject(project.id);
    const storedArtifact = await store.getArtifact(project.id, "large-screenshot");
    assert.equal(storedProject.id, project.id);
    assert.equal(storedArtifact.size, binary.byteLength);
    const restored = new Uint8Array(await storedArtifact.blob.arrayBuffer());
    assert.equal(restored[0], 91);
    assert.equal(restored.at(-1), 91);
    assert.equal((await store.listArtifacts(project.id)).length, 1);

    await store.deleteProject(project.id);
    assert.equal(await store.getProject(project.id), undefined);
    assert.equal((await store.listArtifacts(project.id)).length, 0);
  } finally {
    await store.destroy();
  }
});

test("workspace capture history is tab-aware and bounded to eight records", async () => {
  const store = new CaptureProjectStore(`design-lens-workspace-${Date.now()}-${Math.random()}`);
  try {
    for (let index = 0; index < 10; index += 1) {
      const capture = captureFixture();
      capture.page.capturedAt = `2026-07-16T00:00:${String(index).padStart(2, "0")}.000Z`;
      capture.page.title = `Capture ${index}`;
      await store.putWorkspaceCapture(index % 2 === 0 ? 11 : 22, capture);
    }
    const all = await store.listWorkspaceCaptures();
    assert.equal(all.length, 8);
    assert.equal(all[0].title, "Capture 9");
    assert.equal((await store.listWorkspaceCaptures(11)).every((record) => record.tabId === 11), true);
    assert.equal((await store.getLatestWorkspaceCapture(22)).title, "Capture 9");
    await store.deleteWorkspaceCapture(all[0].id);
    assert.equal((await store.listWorkspaceCaptures()).length, 7);
  } finally {
    await store.destroy();
  }
});
