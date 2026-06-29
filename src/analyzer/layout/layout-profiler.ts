import type { LayoutProfile, LayoutSpec } from "../../shared/schema";

export function buildLayoutProfile(layout: LayoutSpec[], viewportWidth: number): LayoutProfile {
  const gaps = topValues(layout.map((item) => item.gap).filter((gap) => gap && gap !== "normal"));
  const displays = topValues(layout.map((item) => item.display).filter(Boolean));
  const alignment = topValues([...layout.map((item) => item.alignItems), ...layout.map((item) => item.justifyContent)].filter(Boolean));
  const density = inferDensity(gaps);
  const structure = inferStructure(layout, viewportWidth);
  const cadence = inferCadence(layout, viewportWidth);
  const emphasis = inferEmphasis(layout, viewportWidth);

  return {
    density,
    composition: inferComposition(layout, structure),
    dominantDisplays: displays,
    dominantGaps: gaps,
    alignment,
    structure,
    cadence,
    emphasis
  };
}

function inferDensity(gaps: string[]): LayoutProfile["density"] {
  const firstGap = gaps.map((gap) => Number.parseFloat(gap)).find((value) => Number.isFinite(value)) ?? 16;
  if (firstGap <= 10) return "compact";
  if (firstGap >= 28) return "open";
  return "balanced";
}

function inferStructure(layout: LayoutSpec[], viewportWidth: number) {
  const structure = new Set<string>();

  if (layout.some((item) => item.display === "grid")) structure.add("grid-led sections");
  if (layout.some((item) => item.display === "flex")) structure.add("flex clusters");
  if (layout.some((item) => item.gridTemplateColumns && item.gridTemplateColumns !== "none")) structure.add("explicit column system");
  if (layout.some((item) => item.width > viewportWidth * 0.72 && item.height > 220)) structure.add("wide hero or feature band");
  if (layout.some((item) => item.width < 160 && item.height < 160 && (item.position === "fixed" || item.position === "sticky"))) structure.add("anchored micro-media layer");
  if (layout.some((item) => item.width < 420 && item.height > 80)) structure.add("repeated card/list blocks");
  if (layout.some((item) => item.position === "sticky" || item.position === "fixed")) structure.add("persistent navigation or controls");

  return Array.from(structure).slice(0, 6);
}

function inferComposition(layout: LayoutSpec[], structure: string[]) {
  if (structure.includes("wide hero or feature band") && structure.includes("grid-led sections")) return "hero-led grid composition";
  if (structure.includes("repeated card/list blocks")) return "card/list driven composition";
  if (layout.filter((item) => item.display === "flex").length > layout.filter((item) => item.display === "grid").length) return "clustered flex composition";
  if (structure.includes("explicit column system")) return "column-based editorial composition";
  return "standard document composition";
}

function inferCadence(layout: LayoutSpec[], viewportWidth: number) {
  const heroBand = layout.find((item) => item.width > viewportWidth * 0.6 && item.height > 260);
  const listRuns = layout.filter((item) => item.width < viewportWidth * 0.5 && item.height > 70).length;
  const denseGrid = layout.filter((item) => item.display === "grid" && item.gap && parseFloat(item.gap) <= 18).length;

  const cadence: string[] = [];
  if (heroBand) cadence.push("large opening band");
  if (layout.some((item) => item.position === "sticky")) cadence.push("pinned stage transition");
  if (denseGrid > 0) cadence.push("tight modular beats");
  if (listRuns >= 4) cadence.push("long scrolling list rhythm");
  if (layout.some((item) => item.position === "sticky" || item.position === "fixed")) cadence.push("persistent control layer");
  if (!cadence.length) cadence.push("steady editorial cadence");

  return cadence.slice(0, 5);
}

function inferEmphasis(layout: LayoutSpec[], viewportWidth: number) {
  const emphasis: string[] = [];
  const heroBand = layout.find((item) => item.width > viewportWidth * 0.65 && item.height > 240);
  const tallPanels = layout.filter((item) => item.height > 160).length;

  if (heroBand) emphasis.push("hero-first hierarchy");
  if (layout.some((item) => item.position === "fixed" && item.width < viewportWidth * 0.2)) emphasis.push("fixed anchor contrast");
  if (tallPanels >= 3) emphasis.push("section stack emphasis");
  if (layout.some((item) => item.display === "grid")) emphasis.push("modular content emphasis");
  if (layout.some((item) => item.position === "sticky")) emphasis.push("persistent navigation emphasis");
  if (!emphasis.length) emphasis.push("balanced emphasis");

  return emphasis.slice(0, 5);
}

function topValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([value]) => value);
}
