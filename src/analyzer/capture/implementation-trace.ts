import type { ImplementationAsset, ImplementationTrace } from "../../shared/schema";

const LIBRARY_PATTERNS = [
  ["gsap", "GSAP timeline/animation"],
  ["scrolltrigger", "GSAP ScrollTrigger"],
  ["framer-motion", "Motion / Framer Motion"],
  ["motion", "Motion-style animation"],
  ["three", "Three.js / WebGL"],
  ["@react-three", "React Three Fiber"],
  ["pixi", "PixiJS renderer/effects"],
  ["matter", "Matter.js physics"],
  ["anime", "Anime.js animation"],
  ["lottie", "Lottie vector animation"],
  ["rive", "Rive interactive animation"],
  ["lenis", "Lenis smooth scroll"],
  ["locomotive", "Locomotive Scroll"],
  ["embla", "Embla Carousel"],
  ["swiper", "Swiper carousel"],
  ["splide", "Splide carousel"],
  ["barba", "Barba page transition"],
  ["paper", "Paper.js vector/canvas"],
  ["p5", "p5.js creative coding"]
] as const;

export function collectImplementationTrace(doc: Document, win: Window): ImplementationTrace {
  const assets = [
    ...collectScriptAssets(doc, win),
    ...collectStylesheetAssets(doc, win),
    ...collectInlineAssets(doc),
    ...collectPerformanceResources(win)
  ].filter((asset) => !isTraceNoiseAsset(asset)).slice(0, 80);

  const frameworkSignals = collectFrameworkSignals(doc, win, assets);
  const librarySignals = collectLibrarySignals(doc, win, assets);
  const sourceMapHints = collectSourceMapHints(doc);
  const eventModelHints = collectEventModelHints(doc, win);
  const styleRuntimeHints = collectStyleRuntimeHints(doc, win);
  const networkHints = collectNetworkHints(assets);

  return {
    assets,
    frameworkSignals,
    librarySignals,
    sourceMapHints,
    eventModelHints,
    styleRuntimeHints,
    networkHints
  };
}

function isTraceNoiseAsset(asset: ImplementationAsset) {
  const text = `${asset.url ?? ""} ${asset.label}`.toLowerCase();
  return text.includes("design-lens")
    || text.includes("capture-browser-bundle")
    || text.includes("capture-browser-entry")
    || text.startsWith("chrome-extension:")
    || text.includes("/content-scripts/content.js")
    || text.includes("/chunks/popup-");
}

function collectScriptAssets(doc: Document, win: Window): ImplementationAsset[] {
  return Array.from(doc.scripts).slice(0, 36).map((script) => {
    const url = script.src || undefined;
    const label = url ? compactUrl(url, win) : "inline script";
    const signals = [
      script.type ? `type:${script.type}` : "",
      script.async ? "async" : "",
      script.defer ? "defer" : "",
      script.noModule ? "nomodule" : "",
      script.type === "module" ? "esm-module" : "",
      url && /chunk|bundle|app|main|vendor|framework/i.test(url) ? "bundled-script" : "",
      url && /\.m?js($|\?)/i.test(url) ? "javascript" : ""
    ].filter(Boolean);
    return {
      kind: url ? "script" : "inline-script",
      url,
      label,
      origin: url ? assetOrigin(url, win) : "inline",
      loading: [script.async ? "async" : "", script.defer ? "defer" : "", script.type || ""].filter(Boolean),
      signals
    };
  });
}

function collectStylesheetAssets(doc: Document, win: Window): ImplementationAsset[] {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'], link[rel='preload'], link[as='style']"));
  return links.slice(0, 36).map((link) => {
    const url = link.href || undefined;
    const label = url ? compactUrl(url, win) : "stylesheet link";
    const signals = [
      link.rel ? `rel:${link.rel}` : "",
      link.media ? `media:${link.media}` : "",
      link.as ? `as:${link.as}` : "",
      url && /tailwind|bootstrap|normalize|reset|style|css/i.test(url) ? "style-system" : "",
      url && /\.css($|\?)/i.test(url) ? "css" : ""
    ].filter(Boolean);
    return {
      kind: "stylesheet",
      url,
      label,
      origin: url ? assetOrigin(url, win) : "unknown",
      loading: [link.rel, link.as, link.media].filter(Boolean),
      signals
    };
  });
}

function collectInlineAssets(doc: Document): ImplementationAsset[] {
  const styles = Array.from(doc.querySelectorAll("style")).slice(0, 12).map((style, index): ImplementationAsset => {
    const text = style.textContent ?? "";
    return {
      kind: "inline-style",
      label: `inline style ${index + 1}`,
      origin: "inline",
      signals: [
        text.includes("@keyframes") ? "inline-keyframes" : "",
        text.includes("--") ? "css-variables" : "",
        /transform|clip-path|mask|filter|backdrop-filter/.test(text) ? "visual-effect-css" : "",
        text.length > 12000 ? "large-inline-css" : ""
      ].filter(Boolean)
    };
  });

  const inlineScripts = Array.from(doc.scripts).filter((script) => !script.src).slice(0, 8).map((script, index): ImplementationAsset => {
    const text = script.textContent ?? "";
    return {
      kind: "inline-script",
      label: `inline script ${index + 1}`,
      origin: "inline",
      signals: [
        /addEventListener|onpointer|onmouse|requestAnimationFrame/.test(text) ? "event-or-raf-code" : "",
        /gsap|ScrollTrigger|three|pixi|lottie|rive|lenis|swiper|embla/i.test(text) ? "library-reference" : "",
        text.length > 12000 ? "large-inline-js" : ""
      ].filter(Boolean)
    };
  });

  return [...styles, ...inlineScripts];
}

function collectPerformanceResources(win: Window): ImplementationAsset[] {
  const entries = win.performance?.getEntriesByType?.("resource") ?? [];
  return entries.slice(0, 80).map((entry): ImplementationAsset => {
    const resource = entry as PerformanceResourceTiming;
    return {
      kind: "resource",
      url: resource.name,
      label: compactUrl(resource.name, win),
      origin: assetOrigin(resource.name, win),
      loading: [resource.initiatorType].filter(Boolean),
      signals: [
        resource.initiatorType ? `initiator:${resource.initiatorType}` : "",
        resource.duration > 800 ? "slow-resource" : "",
        resource.transferSize === 0 ? "cached-or-opaque" : "",
        /\.(woff2?|ttf|otf)($|\?)/i.test(resource.name) ? "font-resource" : "",
        /\.(webp|avif|png|jpe?g|gif|mp4|webm|svg)($|\?)/i.test(resource.name) ? "media-resource" : ""
      ].filter(Boolean)
    };
  });
}

function collectFrameworkSignals(doc: Document, win: Window, assets: ImplementationAsset[]) {
  const html = doc.documentElement;
  const scripts = assets.map((asset) => `${asset.url ?? ""} ${asset.label}`).join(" ").toLowerCase();
  const signals = [
    html.hasAttribute("data-reactroot") || doc.querySelector("[data-reactroot], [data-reactid]") ? "React legacy root markers" : "",
    doc.querySelector("[data-nextjs], #__next") || scripts.includes("_next/") ? "Next.js app/router assets" : "",
    doc.querySelector("#__nuxt, [data-v-]") || scripts.includes("/_nuxt/") ? "Nuxt/Vue scoped-style markers" : "",
    doc.querySelector("[ng-version]") ? "Angular runtime marker" : "",
    doc.querySelector("[data-svelte-h]") || scripts.includes("svelte") ? "Svelte markers" : "",
    scripts.includes("astro") || doc.querySelector("astro-island") ? "Astro island markers" : "",
    scripts.includes("vite") ? "Vite-built assets" : "",
    scripts.includes("webpack") || scripts.includes("chunk") ? "Bundled/chunked JS assets" : "",
    "React" in win ? "window.React present" : "",
    "__VUE__" in win || "__VUE_DEVTOOLS_GLOBAL_HOOK__" in win ? "Vue devtools/runtime hook present" : ""
  ].filter(Boolean);
  return Array.from(new Set(signals)).slice(0, 16);
}

function collectLibrarySignals(doc: Document, win: Window, assets: ImplementationAsset[]) {
  const haystack = [
    ...assets.map((asset) => `${asset.url ?? ""} ${asset.label} ${asset.signals.join(" ")}`),
    Array.from(doc.querySelectorAll("[class]")).slice(0, 220).map((element) => String(element.getAttribute("class"))).join(" ")
  ].join(" ").toLowerCase();

  const signals: string[] = LIBRARY_PATTERNS
    .filter(([needle]) => haystack.includes(needle) || needle in win)
    .map(([, label]) => label);

  if (doc.querySelector("canvas")) signals.push("Canvas surface present");
  if (doc.querySelector("svg filter, filter feDisplacementMap")) signals.push("SVG filter/displacement present");
  if (doc.querySelector("[data-scroll], [data-lenis], [data-scroll-container]")) signals.push("Smooth-scroll data markers");

  return Array.from(new Set(signals)).slice(0, 24);
}

function collectSourceMapHints(doc: Document) {
  const hints = [
    ...Array.from(doc.scripts).map((script) => script.src).filter(Boolean).filter((src) => /\.map($|\?)/i.test(src)).map((src) => `script sourcemap asset: ${src}`),
    ...Array.from(doc.querySelectorAll<HTMLLinkElement>("link[href]")).map((link) => link.href).filter((href) => /\.map($|\?)/i.test(href)).map((href) => `stylesheet sourcemap asset: ${href}`),
    ...Array.from(doc.scripts).filter((script) => /sourceMappingURL=/.test(script.textContent ?? "")).slice(0, 4).map((_, index) => `inline script ${index + 1} contains sourceMappingURL`),
    ...Array.from(doc.querySelectorAll("style")).filter((style) => /sourceMappingURL=/.test(style.textContent ?? "")).slice(0, 4).map((_, index) => `inline style ${index + 1} contains sourceMappingURL`)
  ];
  return hints.slice(0, 12);
}

function collectEventModelHints(doc: Document, win: Window) {
  const interactive = Array.from(doc.querySelectorAll("button, a[href], input, textarea, select, [role='button'], [role='link'], [tabindex], [aria-expanded], [aria-controls]"));
  const inlineHandlers = interactive.filter((element) => Array.from(element.attributes).some((attribute) => attribute.name.startsWith("on")));
  const delegatedRoots = ["body", "main", "nav", "header", "[data-controller]", "[data-action]", "[x-data]", "[data-state]"]
    .filter((selector) => doc.querySelector(selector));
  const eventEntries = win.performance?.getEntriesByType?.("event") ?? [];
  return [
    `${interactive.length} interactive candidates`,
    inlineHandlers.length ? `${inlineHandlers.length} inline event handler attributes` : "no inline handler attributes detected",
    delegatedRoots.length ? `possible delegated/state roots: ${delegatedRoots.join(", ")}` : "",
    eventEntries.length ? `${eventEntries.length} PerformanceEventTiming entries captured` : "event timing unavailable or not triggered",
    "CDP DOMDebugger.getEventListeners is required for exact listener function locations"
  ].filter(Boolean);
}

function collectStyleRuntimeHints(doc: Document, win: Window) {
  const styleCount = doc.querySelectorAll("style").length;
  const stylesheetCount = doc.styleSheets.length;
  const animated = "getAnimations" in doc ? doc.getAnimations().length : 0;
  const cssVariables = Array.from(doc.styleSheets).length;
  return [
    `${stylesheetCount} stylesheet objects`,
    `${styleCount} inline style tags`,
    `${animated} active Web Animations at sample time`,
    `${cssVariables} stylesheet scopes need CSS rule coverage for exact source mapping`,
    "CDP CSS.getMatchedStylesForNode / CSS.startRuleUsageTracking can map computed styles back to rules"
  ];
}

function collectNetworkHints(assets: ImplementationAsset[]) {
  const scripts = assets.filter((asset) => asset.kind === "script").length;
  const styles = assets.filter((asset) => asset.kind === "stylesheet").length;
  const thirdParty = assets.filter((asset) => asset.origin === "third-party" || asset.origin === "cdn").length;
  const slow = assets.filter((asset) => asset.signals.includes("slow-resource")).length;
  return [
    `${scripts} script assets`,
    `${styles} stylesheet assets`,
    `${thirdParty} external/CDN assets`,
    slow ? `${slow} slow resources observed` : "no slow resources in sampled window"
  ];
}

function assetOrigin(url: string, win: Window): ImplementationAsset["origin"] {
  try {
    const parsed = new URL(url, win.location.href);
    if (parsed.origin === win.location.origin) return "same-origin";
    if (/cdn|jsdelivr|unpkg|cdnjs|cloudflare|akamai|vercel|netlify|googleapis|gstatic/i.test(parsed.hostname)) return "cdn";
    return "third-party";
  } catch {
    return "unknown";
  }
}

function compactUrl(url: string, win: Window) {
  try {
    const parsed = new URL(url, win.location.href);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 120);
  } catch {
    return url.slice(0, 120);
  }
}
