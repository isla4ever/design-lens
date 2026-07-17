import assert from "node:assert/strict";
import test from "node:test";
import { collectDeepCdpEvidence } from "../src/capture-v2/cdp/deep-collector.ts";
import { captureCdpScenes } from "../src/capture-v2/cdp/cdp-scene-orchestrator.ts";
import { collectCanvasFrames } from "../src/capture-v2/cdp/deep-collector.ts";
import { sanitizeDomSnapshot } from "../src/capture-v2/cdp/dom-snapshot-privacy.ts";
import { withCdpSession } from "../src/capture-v2/cdp/cdp-session.ts";
import { buildExtensionManifest } from "../src/config/extension-manifest.ts";

test("collector build alone requests debugger permission", () => {
  const standard = buildExtensionManifest("production");
  const collector = buildExtensionManifest("collector");
  assert.equal(standard.permissions.includes("debugger"), false);
  assert.equal(standard.name, "Design Lens");
  assert.equal(standard.action.default_popup, undefined);
  assert.equal(standard.side_panel.default_path, "sidepanel.html");
  assert.equal(collector.permissions.includes("debugger"), true);
  assert.equal(collector.name, "Design Lens Collector");
});

test("CDP session always detaches after a successful capture", async () => {
  const calls = [];
  const listeners = new Set();
  const transport = {
    async attach(target, version) { calls.push(["attach", target.tabId, version]); },
    async detach(target) { calls.push(["detach", target.tabId]); },
    async sendCommand(_target, method) { calls.push(["command", method]); return { ok: true }; },
    onDetach: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); }
    }
  };
  const result = await withCdpSession(transport, 7, (command) => command("Page.getLayoutMetrics"), 100);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [["attach", 7, "1.3"], ["command", "Page.getLayoutMetrics"], ["detach", 7]]);
  assert.equal(listeners.size, 0);
});

test("CDP session reports external detach and does not detach twice", async () => {
  let listener;
  let detachCount = 0;
  const transport = {
    async attach() {},
    async detach() { detachCount += 1; },
    async sendCommand() { return new Promise(() => {}); },
    onDetach: {
      addListener(next) { listener = next; },
      removeListener() {}
    }
  };
  const pending = withCdpSession(transport, 8, (command) => command("DOMSnapshot.captureSnapshot"), 100);
  setTimeout(() => listener({ tabId: 8 }, "target_closed"), 0);
  await assert.rejects(pending, /detached: target_closed/);
  assert.equal(detachCount, 0);
});

test("CDP session cleans up an attach that resolves after timeout", async () => {
  let resolveAttach;
  let detachCount = 0;
  const transport = {
    attach() { return new Promise((resolve) => { resolveAttach = resolve; }); },
    async detach() { detachCount += 1; },
    async sendCommand() { return {}; },
    onDetach: { addListener() {}, removeListener() {} }
  };
  await assert.rejects(() => withCdpSession(transport, 9, async () => ({}), 5), /attach timed out/);
  resolveAttach();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(detachCount, 1);
});

test("CDP command timeout still detaches the active session", async () => {
  let detachCount = 0;
  const transport = {
    async attach() {},
    async detach() { detachCount += 1; },
    async sendCommand() { return new Promise(() => {}); },
    onDetach: { addListener() {}, removeListener() {} }
  };
  await assert.rejects(() => withCdpSession(transport, 10, (command) => command("CSS.getMatchedStylesForNode"), 5), /CDP command timed out/);
  assert.equal(detachCount, 1);
});

test("DOMSnapshot privacy sanitizer removes form values from string tables", () => {
  const snapshot = {
    strings: ["INPUT", "value", "private@example.com", "TEXTAREA", "typed secret"],
    documents: [{
      nodes: {
        nodeName: [0, 3],
        attributes: [[1, 2], []],
        inputValue: { index: [1], value: [4] }
      }
    }]
  };
  const sanitized = sanitizeDomSnapshot(snapshot);
  const json = JSON.stringify(sanitized);
  assert.equal(json.includes("private@example.com"), false);
  assert.equal(json.includes("typed secret"), false);
  assert.equal(JSON.stringify(snapshot).includes("private@example.com"), true);
});

test("deep collector normalizes DOMSnapshot, matched rules, geometry, and animations", async () => {
  let frameReads = 0;
  const calls = [];
  const command = async (method) => {
    calls.push(method);
    if (method === "Page.getFrameTree") {
      frameReads += 1;
      return { frameTree: { frame: { id: "frame-1", loaderId: "loader-1" } } };
    }
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.getLayoutMetrics") return { layoutViewport: { pageX: 0, pageY: 120, clientWidth: 1280, clientHeight: 800 }, contentSize: { x: 0, y: 0, width: 1280, height: 2400 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "DOM.describeNode") return { node: { backendNodeId: 22, nodeName: "ARTICLE" } };
    if (method === "CSS.getComputedStyleForNode") return { computedStyle: [{ name: "display", value: "grid" }, { name: "color", value: "rgb(1, 2, 3)" }, { name: "--accent", value: "#0a6" }, { name: "unknown", value: "ignored" }] };
    if (method === "CSS.getMatchedStylesForNode") return { matchedCSSRules: [{ rule: { selectorList: { text: ".card" }, origin: "regular", styleSheetId: "sheet-1", style: { cssProperties: [{ name: "display", value: "grid" }, { name: "color", value: "red", important: true }] } } }] };
    if (method === "DOM.getBoxModel") return { model: { border: [10, 20, 110, 20, 110, 70, 10, 70] } };
    return {};
  };

  const result = await collectDeepCdpEvidence(command, [{ nodeId: "card", selector: ".card" }], [
    { method: "CSS.styleSheetAdded", params: { header: { styleSheetId: "sheet-1", sourceURL: "https://example.test/styles.css" } } },
    {
      method: "Animation.animationStarted",
      params: { animation: { id: "anim-1", name: "enter", type: "CSSAnimation", playState: "running", source: { backendNodeId: 22, duration: 500, delay: 20, easing: "ease-out", iterations: 1 } } }
    }
  ]);
  assert.equal(frameReads, 2);
  assert.equal(result.styles.length, 1);
  assert.equal(result.styles[0].nodeId, "card");
  assert.equal(result.styles[0].computed.display, "grid");
  assert.equal(result.styles[0].computed.unknown, undefined);
  assert.equal(result.styles[0].cssVariables["--accent"], "#0a6");
  assert.equal(result.styles[0].matchedRules[0].styleSheetId, "sheet-1");
  assert.equal(result.styles[0].matchedRules[0].sourceUrl, "https://example.test/styles.css");
  assert.equal(result.styles[0].matchedRules[0].declarations.color, "red !important");
  assert.deepEqual(result.styles[0].rect, { x: 10, y: 20, width: 100, height: 50 });
  assert.equal(result.animations[0].name, "enter");
  assert.equal(result.animations[0].selector, ".card");
  assert.equal(result.page.loaderId, "loader-1");
  assert.ok(calls.includes("DOMSnapshot.captureSnapshot"));
});

test("CDP scene orchestrator captures every requested initial viewport and restores emulation", async () => {
  const calls = [];
  const maskStates = [];
  const command = async (method, params = {}) => {
    calls.push([method, params]);
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 390, clientHeight: 844 }, cssContentSize: { x: 0, y: 0, width: 1200, height: 2400 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    return {};
  };
  const captures = await captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [
      { id: "desktop", width: 1440, height: 900, devicePixelRatio: 1 },
      { id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }
    ],
    states: [],
    stateTargets: [],
    nodes: []
  }, [], async (enabled) => { maskStates.push(enabled); });
  assert.equal(captures.length, 2);
  assert.equal(captures.every((capture) => capture.scene.status === "captured"), true);
  assert.deepEqual(captures.map((capture) => capture.scene.viewport.width), [1440, 390]);
  assert.equal(captures.every((capture) => capture.scene.phase === "responsive-initial"), true);
  assert.equal(calls.filter(([method]) => method === "DOMSnapshot.captureSnapshot").length, 2);
  assert.deepEqual(maskStates, [true, false, true, false]);
  assert.equal(calls.some(([method]) => method === "Emulation.clearDeviceMetricsOverride"), true);
});

test("CDP scene capture degrades gracefully when the Animation domain is unavailable", async () => {
  const calls = [];
  const command = async (method, params = {}) => {
    calls.push([method, params]);
    if (method === "Animation.enable") throw { code: -32601, message: "'Animation.enable' wasn't found" };
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 390, clientHeight: 844 }, cssContentSize: { x: 0, y: 0, width: 390, height: 1600 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    return {};
  };

  const captures = await captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }],
    states: [],
    stateTargets: [],
    nodes: []
  }, []);

  assert.equal(captures[0].scene.status, "captured");
  assert.equal(captures[0].screenshotBase64, "iVBORw==");
  assert.equal(calls.some(([method]) => method === "CSS.enable"), true);
});

test("Canvas evidence collector keeps bounded readable and tainted states", async () => {
  const command = async (method) => {
    if (method === "Runtime.evaluate") {
      return { result: { value: [
        { index: 0, selector: "main > canvas:nth-of-type(1)", width: 640, height: 360, cssWidth: 640, cssHeight: 360, status: "readable", scale: 1, context: "2d", dataUrl: "data:image/png;base64,ZmFrZQ==" },
        { index: 1, selector: "main > canvas:nth-of-type(2)", width: 9000, height: 9000, cssWidth: 900, cssHeight: 900, status: "skipped", error: "Canvas exceeds the bounded pixel-area budget." },
        { index: 2, selector: "main > canvas:nth-of-type(3)", width: 300, height: 200, cssWidth: 300, cssHeight: 200, status: "tainted", context: "unknown", error: "The canvas has been tainted by cross-origin data." }
      ] } };
    }
    return {};
  };
  const frames = await collectCanvasFrames(command, "scene-1", "2026-07-15T00:00:00.000Z");
  assert.equal(frames.length, 3);
  assert.equal(frames[0].evidence.status, "readable");
  assert.equal(frames[0].pngBase64, "ZmFrZQ==");
  assert.equal(frames[1].evidence.status, "skipped");
  assert.equal(frames[2].evidence.status, "tainted");
});

test("CDP scene orchestrator captures normalized motion checkpoints and restores animation time", async () => {
  const calls = [];
  let screenshotCount = 0;
  const command = createMotionCommand(calls, () => { screenshotCount += 1; });
  const captures = await captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "desktop", width: 1200, height: 800, devicePixelRatio: 1 }],
    states: [],
    stateTargets: [],
    nodes: [{ nodeId: "card", selector: ".card" }]
  }, [{
    method: "Animation.animationStarted",
    params: { animation: { id: "anim-1", name: "enter", type: "CSSAnimation", playState: "running", source: { backendNodeId: 22, duration: 500, delay: 0, easing: "ease", iterations: 1 } } }
  }]);

  assert.equal(captures[0].scene.status, "captured");
  assert.deepEqual(captures[0].motionCheckpoints.map((checkpoint) => checkpoint.evidence.progress), [0.25, 0.5, 0.75]);
  assert.equal(captures[0].motionCheckpoints.every((checkpoint) => checkpoint.evidence.status === "captured" && checkpoint.screenshotBase64), true);
  assert.equal(captures[0].motionCheckpoints[0].evidence.animations[0].selector, ".card");
  assert.equal(screenshotCount, 4);
  assert.deepEqual(calls.filter(([method]) => method === "Animation.setPaused").map(([, params]) => params.paused), [true, false]);
  assert.deepEqual(calls.filter(([method]) => method === "Animation.seekAnimations").map(([, params]) => params.currentTime), [125, 250, 375, 123]);
});

test("CDP scene orchestrator rejects deep capture when animation time cannot be restored", async () => {
  const calls = [];
  const command = createMotionCommand(calls, () => {}, true);
  await assert.rejects(() => captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "desktop", width: 1200, height: 800, devicePixelRatio: 1 }],
    states: [],
    stateTargets: [],
    nodes: [{ nodeId: "card", selector: ".card" }]
  }, [{
    method: "Animation.animationStarted",
    params: { animation: { id: "anim-1", name: "enter", type: "CSSAnimation", playState: "running", source: { backendNodeId: 22, duration: 500, delay: 0, easing: "ease", iterations: 1 } } }
  }]), /Animation state restoration failed/);
  assert.equal(calls.some(([method]) => method === "Emulation.clearDeviceMetricsOverride"), true);
});

test("CDP scene orchestrator clears forced pseudo state and emulation after failure", async () => {
  const calls = [];
  const command = async (method, params = {}) => {
    calls.push([method, params]);
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 390, clientHeight: 844 } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "Page.captureScreenshot") throw new Error("screenshot failed");
    return {};
  };
  const captures = await captureCdpScenes(command, {
    phase: "recording-stop",
    viewports: [{ id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }],
    states: ["hover"],
    stateTargets: [{ state: "hover", nodeId: "card", selector: ".card" }],
    nodes: []
  }, []);
  const pseudoCalls = calls.filter(([method]) => method === "CSS.forcePseudoState");
  assert.equal(captures[0].scene.status, "failed");
  assert.deepEqual(pseudoCalls.map(([, params]) => params.forcedPseudoClasses), [["hover"], []]);
  assert.equal(calls.some(([method]) => method === "Emulation.clearDeviceMetricsOverride"), true);
  assert.equal(calls.some(([method]) => method === "DOMSnapshot.captureSnapshot"), false);
});

test("CDP scene orchestrator reacquires a target when deep collection invalidates its node id", async () => {
  const clearNodeIds = [];
  let documentReads = 0;
  const command = async (method, params = {}) => {
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 1200, clientHeight: 800 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") {
      documentReads += 1;
      return { root: { nodeId: documentReads } };
    }
    if (method === "DOM.querySelector") return { nodeId: documentReads === 1 ? 10 : 20 };
    if (method === "CSS.forcePseudoState" && params.forcedPseudoClasses?.length === 0) {
      clearNodeIds.push(params.nodeId);
      if (params.nodeId === 10) throw { code: -32000, message: "Could not find node with given id" };
    }
    if (method === "DOM.describeNode") return { node: { backendNodeId: 22, nodeName: "BUTTON" } };
    if (method === "CSS.getComputedStyleForNode") return { computedStyle: [] };
    if (method === "CSS.getMatchedStylesForNode") return {};
    if (method === "DOM.getBoxModel") return { model: { border: [0, 0, 100, 0, 100, 40, 0, 40] } };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    return {};
  };

  const captures = await captureCdpScenes(command, {
    phase: "recording-stop",
    viewports: [{ id: "desktop", width: 1200, height: 800, devicePixelRatio: 1 }],
    states: ["hover"],
    stateTargets: [{ state: "hover", nodeId: "button", selector: "button" }],
    nodes: []
  }, []);

  assert.equal(captures[0].scene.status, "captured");
  assert.deepEqual(clearNodeIds, [10, 20]);
});

test("CDP scene orchestrator fails the capture when emulation cannot be restored", async () => {
  const command = async (method) => {
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 390, clientHeight: 844 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    if (method === "Emulation.clearDeviceMetricsOverride") throw new Error("restore failed");
    return {};
  };
  await assert.rejects(() => captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }],
    states: [],
    stateTargets: [],
    nodes: []
  }, []), /restore failed/);
});

test("CDP scene orchestrator captures responsive scroll and restores the original position", async () => {
  const expressions = [];
  const command = async (method, params = {}) => {
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 120, clientWidth: 390, clientHeight: 844 }, cssContentSize: { x: 0, y: 0, width: 390, height: 2400 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    if (method === "Runtime.evaluate") expressions.push(params.expression);
    return {};
  };
  const captures = await captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }],
    states: ["scroll"],
    stateTargets: [],
    nodes: []
  }, []);
  assert.equal(captures.length, 2);
  assert.equal(captures[1].scene.phase, "responsive-scroll");
  assert.equal(captures[1].scene.status, "captured");
  assert.equal(expressions.some((expression) => expression === "window.scrollTo({ left: 0, top: 717, behavior: \"instant\" })"), true);
  assert.equal(expressions.filter((expression) => expression === "window.scrollTo({ left: 0, top: 120, behavior: \"instant\" })").length >= 2, true);
});

test("CDP scene orchestrator records short-page scroll as not applicable", async () => {
  const command = async (method) => {
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 390, clientHeight: 844 }, cssContentSize: { x: 0, y: 0, width: 390, height: 700 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    return {};
  };
  const captures = await captureCdpScenes(command, {
    phase: "recording-start",
    viewports: [{ id: "mobile", width: 390, height: 844, devicePixelRatio: 2 }],
    states: ["scroll"],
    stateTargets: [],
    nodes: []
  }, []);
  assert.equal(captures[1].scene.status, "not-applicable");
  assert.equal(captures[1].screenshotBase64, undefined);
});

test("CDP scene orchestrator creates unique pseudo scenes for multiple observed targets", async () => {
  const forcedSelectors = [];
  let nextNodeId = 10;
  const command = async (method, params = {}) => {
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 1200, clientHeight: 800 } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: nextNodeId++ };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "Page.captureScreenshot") return { data: "iVBORw==" };
    if (method === "CSS.forcePseudoState" && params.forcedPseudoClasses?.length) forcedSelectors.push(params.nodeId);
    return {};
  };
  const captures = await captureCdpScenes(command, {
    phase: "recording-stop",
    viewports: [{ id: "desktop", width: 1200, height: 800, devicePixelRatio: 1 }],
    states: ["hover"],
    stateTargets: [
      { state: "hover", nodeId: "card-1", selector: ".card-one" },
      { state: "hover", nodeId: "card-2", selector: ".card-two" }
    ],
    nodes: []
  }, []);
  assert.deepEqual(captures.map((capture) => capture.scene.id), ["cdp-desktop-hover-1", "cdp-desktop-hover-2"]);
  assert.deepEqual(captures.map((capture) => capture.scene.selector), [".card-one", ".card-two"]);
  assert.equal(forcedSelectors.length, 2);
});

function createMotionCommand(calls, onScreenshot, failRestore = false) {
  return async (method, params = {}) => {
    calls.push([method, params]);
    if (method === "Page.getLayoutMetrics") return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 1200, clientHeight: 800 }, cssContentSize: { x: 0, y: 0, width: 1200, height: 1600 } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame", loaderId: "loader" } } };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "DOM.describeNode") return { node: { backendNodeId: 22, nodeName: "ARTICLE" } };
    if (method === "CSS.getComputedStyleForNode") return { computedStyle: [] };
    if (method === "CSS.getMatchedStylesForNode") return {};
    if (method === "DOM.getBoxModel") return { model: { border: [10, 20, 110, 20, 110, 70, 10, 70] } };
    if (method === "DOMSnapshot.captureSnapshot") return { strings: [], documents: [] };
    if (method === "Animation.getCurrentTime") return { currentTime: 123 };
    if (method === "Animation.seekAnimations" && failRestore && params.currentTime === 123) throw new Error("animation detached");
    if (method === "Page.captureScreenshot") {
      onScreenshot();
      return { data: "iVBORw==" };
    }
    return {};
  };
}
