import type { DesignCapture } from "../../shared/schema";
import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan } from "./imported-recorder-flow";

const STORAGE_KEY = "designLensRebuildRouteProject";
export const MAX_REBUILD_ROUTES = 8;

export type RebuildRouteEntry = {
  id: string;
  url: string;
  path: string;
  title: string;
  capture: DesignCapture;
  recorderFlow?: ImportedRecorderFlowPlan;
  recorderFlowMatch?: ImportedRecorderFlowMatch;
  addedAt: string;
  updatedAt: string;
};

export type RebuildRouteProject = {
  version: 1;
  id: string;
  origin: string;
  routes: RebuildRouteEntry[];
  createdAt: string;
  updatedAt: string;
};

export function addCaptureToRouteProject(project: RebuildRouteProject | null, capture: DesignCapture, now = new Date().toISOString(), recorderFlow?: ImportedRecorderFlowPlan, recorderFlowMatch?: ImportedRecorderFlowMatch) {
  const url = normalizeRouteUrl(capture.page.url);
  if (project && project.origin !== url.origin) {
    throw new Error("All routes in a rebuild project must use the same origin.");
  }
  const id = routeId(url);
  const existing = project?.routes.find((route) => route.id === id);
  if (!existing && (project?.routes.length ?? 0) >= MAX_REBUILD_ROUTES) {
    throw new Error(`A rebuild project can contain at most ${MAX_REBUILD_ROUTES} routes.`);
  }
  const entry: RebuildRouteEntry = {
    id,
    url: url.href,
    path: routePath(url),
    title: capture.page.title || routePath(url),
    capture,
    ...(recorderFlow ? { recorderFlow } : existing?.recorderFlow ? { recorderFlow: existing.recorderFlow } : {}),
    ...(recorderFlowMatch ? { recorderFlowMatch } : existing?.recorderFlowMatch ? { recorderFlowMatch: existing.recorderFlowMatch } : {}),
    addedAt: existing?.addedAt ?? now,
    updatedAt: now
  };
  const routes = [...(project?.routes ?? []).filter((route) => route.id !== id), entry]
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    version: 1 as const,
    id: project?.id ?? `route-project-${shortHash(url.origin)}`,
    origin: url.origin,
    routes,
    createdAt: project?.createdAt ?? now,
    updatedAt: now
  };
}

export function removeRouteFromProject(project: RebuildRouteProject, routeIdToRemove: string, now = new Date().toISOString()) {
  return { ...project, routes: project.routes.filter((route) => route.id !== routeIdToRemove), updatedAt: now };
}

export async function getStoredRebuildRouteProject(): Promise<RebuildRouteProject | null> {
  const stored: Record<string, unknown> = await browser.storage.local.get(STORAGE_KEY).catch(() => ({}));
  return normalizeRouteProject(stored[STORAGE_KEY]);
}

export async function setStoredRebuildRouteProject(project: RebuildRouteProject | null) {
  if (!project?.routes.length) {
    await browser.storage.local.remove(STORAGE_KEY);
    return;
  }
  await browser.storage.local.set({ [STORAGE_KEY]: project });
}

function normalizeRouteProject(value: unknown): RebuildRouteProject | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<RebuildRouteProject>;
  if (maybe.version !== 1 || typeof maybe.id !== "string" || typeof maybe.origin !== "string" || !Array.isArray(maybe.routes)) return null;
  const routes = maybe.routes.filter((route): route is RebuildRouteEntry => Boolean(
    route && typeof route.id === "string" && typeof route.url === "string" && typeof route.path === "string"
    && typeof route.title === "string" && route.capture && typeof route.capture === "object"
  )).slice(0, MAX_REBUILD_ROUTES);
  if (!routes.length) return null;
  return {
    version: 1,
    id: maybe.id,
    origin: maybe.origin,
    routes,
    createdAt: typeof maybe.createdAt === "string" ? maybe.createdAt : routes[0]?.addedAt ?? new Date().toISOString(),
    updatedAt: typeof maybe.updatedAt === "string" ? maybe.updatedAt : routes.at(-1)?.updatedAt ?? new Date().toISOString()
  };
}

function normalizeRouteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") throw new Error("Route captures must use http, https, or file URLs.");
  url.username = "";
  url.password = "";
  return url;
}

function routePath(url: URL) {
  return `${url.pathname || "/"}${url.search}${url.hash}`;
}

function routeId(url: URL) {
  const label = url.pathname.split("/").filter(Boolean).at(-1)?.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "home";
  return `route-${label}-${shortHash(routePath(url))}`;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
