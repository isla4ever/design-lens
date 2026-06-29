import { DEFAULT_LOCALE, type Locale } from "../../shared/i18n";
import type { DesignCapture } from "../../shared/schema";
import { buildEvidencePack } from "../../evidence/evidence-pack";

export function generatePrototypeHtml(capture: DesignCapture, locale: Locale = DEFAULT_LOCALE) {
  const title = escapeHtml(capture.scope === "component" ? "Component Prototype" : "Design Prototype");
  const evidencePack = buildEvidencePack(capture);
  const colors = capture.tokens.colors.map((token) => token.value).filter(Boolean);
  const backgrounds = capture.tokens.backgrounds.map((token) => token.value).filter(Boolean);
  const typography = capture.tokens.typography[0];
  const radius = capture.tokens.radii[0]?.value ?? "18px";
  const shadow = capture.tokens.shadows[0]?.value ?? "0 24px 80px rgba(0,0,0,.18)";
  const accent = safeColor(colors[0], "#d7ff67");
  const ink = safeColor(colors.find((color) => !/rgba?\(255,\s*255,\s*255|#fff/i.test(color)), "#111713");
  const surface = safeColor(backgrounds[0], "#f5f2ea");
  const family = typography?.family ?? "Inter, ui-sans-serif, system-ui, sans-serif";
  const scopeLabel = capture.scope === "component" ? (locale === "zh" ? "组件原型" : "Component prototype") : (locale === "zh" ? "页面原型" : "Page prototype");
  const patterns = capture.interactionTimeline?.patterns.slice(0, 4).map((pattern) => pattern.kind) ?? [];
  const components = capture.components.slice(0, 6);
  const isComponent = evidencePack.prototypeRecipe.recommendedTemplate === "component-module";
  const recipeLabel = evidencePack.prototypeRecipe.states.join(" / ") || "stable";
  const motionHooks = evidencePack.prototypeRecipe.motionHooks.join(" / ") || "captured timing";

  return `<!doctype html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --bg: ${surface};
      --ink: ${ink};
      --accent: ${accent};
      --muted: color-mix(in srgb, var(--ink) 62%, transparent);
      --line: color-mix(in srgb, var(--ink) 16%, transparent);
      --radius: ${radius};
      --shadow: ${shadow};
      font-family: ${family};
    }
    * { box-sizing: border-box; }
    body {
      background:
        radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 32%),
        linear-gradient(135deg, color-mix(in srgb, var(--bg) 86%, white), var(--bg));
      color: var(--ink);
      margin: 0;
      min-height: 100vh;
      padding: clamp(22px, 5vw, 72px);
    }
    main {
      display: grid;
      gap: clamp(20px, 4vw, 44px);
      margin: 0 auto;
      max-width: ${isComponent ? "860px" : "1120px"};
    }
    .hero {
      display: grid;
      gap: 18px;
      max-width: 820px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(42px, 8vw, 96px);
      letter-spacing: 0;
      line-height: .92;
      margin: 0;
    }
    p {
      color: var(--muted);
      font-size: clamp(15px, 2vw, 20px);
      line-height: 1.55;
      margin: 0;
      max-width: 68ch;
    }
    .board {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .card {
      background: color-mix(in srgb, var(--bg) 72%, white);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      display: grid;
      gap: 14px;
      min-height: 190px;
      overflow: hidden;
      padding: 18px;
      position: relative;
      transition: transform 260ms cubic-bezier(.2,.8,.2,1), border-color 260ms ease, filter 260ms ease;
    }
    .card::before {
      background: linear-gradient(90deg, var(--accent), transparent);
      content: "";
      height: 3px;
      inset: 0 0 auto;
      position: absolute;
      transform: scaleX(.28);
      transform-origin: left;
      transition: transform 360ms cubic-bezier(.2,.8,.2,1);
    }
    .card:hover,
    .card:focus-within {
      border-color: color-mix(in srgb, var(--accent) 56%, var(--line));
      filter: saturate(1.05);
      transform: translateY(-6px);
    }
    .card:hover::before,
    .card:focus-within::before {
      transform: scaleX(1);
    }
    .card h2 {
      font-size: 18px;
      line-height: 1.15;
      margin: 0;
    }
    .meta {
      align-items: end;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      padding: 7px 9px;
    }
    .motion-field {
      aspect-ratio: 16 / 7;
      background:
        radial-gradient(circle at var(--x, 35%) var(--y, 45%), color-mix(in srgb, var(--accent) 42%, transparent), transparent 18%),
        repeating-linear-gradient(90deg, color-mix(in srgb, var(--ink) 8%, transparent) 0 1px, transparent 1px 22px);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      position: relative;
    }
    .motion-field::before {
      background:
        radial-gradient(circle at var(--x, 35%) var(--y, 45%), color-mix(in srgb, white 55%, transparent), transparent 9%),
        radial-gradient(circle at calc(var(--x, 35%) - 8%) calc(var(--y, 45%) + 5%), color-mix(in srgb, var(--accent) 34%, transparent), transparent 14%);
      content: "";
      filter: blur(18px) saturate(1.25);
      inset: -12%;
      mix-blend-mode: ${ink.includes("255") || surface.includes("0, 0, 0") ? "screen" : "multiply"};
      opacity: .72;
      pointer-events: none;
      position: absolute;
      transition: opacity 220ms ease;
    }
    .motion-field::after {
      color: color-mix(in srgb, var(--ink) 68%, transparent);
      content: "${patterns.join(" / ") || "captured motion evidence"}";
      font-size: clamp(28px, 6vw, 76px);
      font-weight: 950;
      inset: auto 18px 14px;
      line-height: .92;
      position: absolute;
    }
    .prototype-shell {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      display: grid;
      gap: 18px;
      overflow: hidden;
      padding: clamp(18px, 4vw, 34px);
      position: relative;
    }
    .prototype-shell::after {
      border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
      content: "";
      inset: 12px;
      pointer-events: none;
      position: absolute;
    }
    .prototype-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }
    .recipe {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
      text-transform: uppercase;
    }
    .module-preview {
      display: grid;
      gap: 16px;
      grid-template-columns: ${isComponent ? "1fr" : "minmax(0, 1.1fr) minmax(220px, .9fr)"};
      position: relative;
      z-index: 1;
    }
    .module-preview h2 {
      font-size: clamp(30px, 6vw, 72px);
      line-height: .92;
      margin: 0;
      max-width: 10ch;
    }
    .media-lens {
      aspect-ratio: 4 / 3;
      background:
        radial-gradient(circle at var(--x, 50%) var(--y, 50%), color-mix(in srgb, var(--accent) 42%, transparent), transparent 18%),
        linear-gradient(135deg, color-mix(in srgb, var(--ink) 12%, transparent), transparent),
        color-mix(in srgb, var(--bg) 70%, var(--ink));
      border-radius: calc(var(--radius) * .7);
      filter: contrast(1.05) saturate(1.15);
      min-height: 210px;
      overflow: hidden;
      position: relative;
    }
    .media-lens::before {
      background: repeating-linear-gradient(115deg, transparent 0 14px, color-mix(in srgb, white 18%, transparent) 14px 15px);
      content: "";
      inset: -30%;
      opacity: .35;
      position: absolute;
      transform: translateX(calc((var(--x, 50%) - 50%) * .08));
    }
    @media (prefers-reduced-motion: reduce) {
      .card, .card::before { transition: none; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">${scopeLabel}</div>
      <h1>${escapeHtml(capture.page.title || "Captured reference")}</h1>
      <p>${escapeHtml(capture.analysis.character)}</p>
    </section>
    <section class="prototype-shell">
      <div class="prototype-toolbar">
        <span class="pill">${escapeHtml(recipeLabel)}</span>
        <span class="recipe">${escapeHtml(motionHooks)}</span>
      </div>
      <div class="module-preview">
        <div>
          <h2>${escapeHtml(isComponent ? components[0]?.name || "Reference module" : capture.layoutProfile.composition || "Reference stage")}</h2>
          <p>${escapeHtml(isComponent ? components[0]?.textSample || capture.analysis.character : capture.layoutProfile.structure.slice(0, 3).join(" / ") || capture.analysis.character)}</p>
        </div>
        <div class="media-lens" aria-hidden="true"></div>
      </div>
    </section>
    <section class="motion-field" aria-label="Captured motion field"></section>
    <section class="board">
      ${components.length ? components.map((component) => componentCard(component.name, component.textSample, component.selector)).join("\n      ") : fallbackCards(locale)}
    </section>
  </main>
  <script>
    const field = document.querySelector('.motion-field');
    const lens = document.querySelector('.media-lens');
    field?.addEventListener('pointermove', (event) => {
      const rect = field.getBoundingClientRect();
      field.style.setProperty('--x', ((event.clientX - rect.left) / rect.width * 100).toFixed(2) + '%');
      field.style.setProperty('--y', ((event.clientY - rect.top) / rect.height * 100).toFixed(2) + '%');
    });
    lens?.addEventListener('pointermove', (event) => {
      const rect = lens.getBoundingClientRect();
      lens.style.setProperty('--x', ((event.clientX - rect.left) / rect.width * 100).toFixed(2) + '%');
      lens.style.setProperty('--y', ((event.clientY - rect.top) / rect.height * 100).toFixed(2) + '%');
    });
  </script>
</body>
</html>`;
}

function componentCard(name: string, text: string, selector: string) {
  return `<article class="card" tabindex="0">
        <h2>${escapeHtml(name)}</h2>
        <p>${escapeHtml(text || "Reusable captured component pattern.")}</p>
        <div class="meta"><span class="pill">${escapeHtml(selector)}</span></div>
      </article>`;
}

function fallbackCards(locale: Locale) {
  const title = locale === "zh" ? "参考模块" : "Reference module";
  const copy = locale === "zh" ? "使用捕捉到的 token、布局和动效证据生成原创界面。" : "Use captured tokens, layout, and motion evidence to create an original interface.";
  return componentCard(title, copy, "generated");
}

function safeColor(value: string | undefined, fallback: string) {
  return value && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(value) ? value : fallback;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return replacements[char] ?? char;
  });
}
