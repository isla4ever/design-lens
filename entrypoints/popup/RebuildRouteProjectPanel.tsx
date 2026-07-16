import React from "react";
import { Archive, FolderPlus, Plus, Route, Trash2 } from "lucide-react";
import { MAX_REBUILD_ROUTES, type RebuildRouteProject } from "../../src/capture-v2/core/rebuild-route-project";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";

export function RebuildRouteProjectPanel({ capture, project, locale, disabled, onAdd, onRemove, onExport, onStartNew }: {
  capture: DesignCapture;
  project: RebuildRouteProject | null;
  locale: Locale;
  disabled: boolean;
  onAdd: () => void;
  onRemove: (routeId: string) => void;
  onExport: () => void;
  onStartNew: () => void;
}) {
  const zh = locale === "zh";
  const currentUrl = safeUrl(capture.page.url);
  const currentSaved = project?.routes.some((route) => route.url === currentUrl) ?? false;
  const originMismatch = Boolean(project && currentUrl && new URL(currentUrl).origin !== project.origin);
  const routeCount = project?.routes.length ?? 0;
  return (
    <section className="route-project" aria-label={zh ? "网站路由项目" : "Site route project"}>
      <div className="route-project-head">
        <div>
          <strong><Route aria-hidden="true" />{zh ? "网站路由项目" : "Site route project"}</strong>
          <span>{zh ? `${routeCount}/${MAX_REBUILD_ROUTES} 条同源路由` : `${routeCount}/${MAX_REBUILD_ROUTES} same-origin routes`}</span>
        </div>
        <button className="route-add" type="button" onClick={onAdd} disabled={disabled || originMismatch || !capture.rebuildEvidence}>
          <Plus aria-hidden="true" />
          {zh ? currentSaved ? "更新当前路由" : "加入当前路由" : currentSaved ? "Update route" : "Add route"}
        </button>
      </div>
      {originMismatch ? <div className="route-warning"><span>{zh ? "当前页面与项目不同源。" : "The current page has a different origin."}</span><button className="route-new" type="button" onClick={onStartNew} disabled={disabled}><FolderPlus aria-hidden="true" />{zh ? "以当前页面新建" : "Start with current page"}</button></div> : null}
      {routeCount ? (
        <div className="route-list">
          {project?.routes.map((route) => (
            <div className="route-item" key={route.id}>
              <div><strong>{route.path}</strong><span>{route.title}</span></div>
              <button type="button" aria-label={zh ? `移除 ${route.path}` : `Remove ${route.path}`} title={zh ? "移除路由" : "Remove route"} onClick={() => onRemove(route.id)} disabled={disabled}>
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : <p className="route-empty">{zh ? "录制完成后，把当前页面加入项目；切换到下一条路由后重复采集。" : "After recording, add this page, navigate manually, and capture the next route."}</p>}
      <button className="route-export" type="button" onClick={onExport} disabled={disabled || routeCount < 2}>
        <Archive aria-hidden="true" />
        {zh ? "导出网站重建项目" : "Export site rebuild project"}
      </button>
    </section>
  );
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return "";
  }
}
