import React from "react";
import type { RebuildRouteProject } from "../../src/capture-v2/core/rebuild-route-project";
import type { Locale } from "../../src/shared/i18n";
import type { DesignCapture } from "../../src/shared/schema";
import { EvidenceHealth } from "../popup/EvidenceHealth";
import { RebuildCoverage } from "../popup/RebuildCoverage";
import { RebuildRouteProjectPanel } from "../popup/RebuildRouteProjectPanel";
import type { ImportedRecorderFlowMatch, ImportedRecorderFlowPlan } from "../../src/capture-v2/core/imported-recorder-flow";
import { WorkspaceRecorderImport } from "./WorkspaceRecorderImport";

export function WorkspaceCoverage({ capture, locale, isBusy, routeProject, recorderFlow, recorderFlowMatch, canEditCurrentRoute, onAddRoute, onRemoveRoute, onExportRouteProject, onStartNewRouteProject, onImportRecorderFlow, onClearRecorderFlow }: {
  capture: DesignCapture | null;
  locale: Locale;
  isBusy: boolean;
  routeProject: RebuildRouteProject | null;
  recorderFlow: ImportedRecorderFlowPlan | undefined;
  recorderFlowMatch: ImportedRecorderFlowMatch | undefined;
  canEditCurrentRoute: boolean;
  onAddRoute: () => void;
  onRemoveRoute: (routeId: string) => void;
  onExportRouteProject: () => void;
  onStartNewRouteProject: () => void;
  onImportRecorderFlow: (file: File) => void;
  onClearRecorderFlow: () => void;
}) {
  const zh = locale === "zh";
  if (!capture) return <p className="workspace-placeholder">{zh ? "暂无覆盖数据" : "No coverage data"}</p>;
  const isRebuild = capture.smartCapture?.mode === "rebuild" || Boolean(capture.rebuildEvidence);
  return (
    <div className="coverage-layout">
      <section className="workspace-section" aria-labelledby="coverage-title">
        <div className="section-heading"><div><span>{zh ? "证据" : "Evidence"}</span><h2 id="coverage-title">{zh ? "覆盖状态" : "Coverage status"}</h2></div></div>
        {isRebuild ? <RebuildCoverage capture={capture} locale={locale} /> : <EvidenceHealth capture={capture} locale={locale} />}
      </section>
      <section className="workspace-section" aria-labelledby="implementation-title">
        <div className="section-heading"><div><span>{zh ? "实现" : "Implementation"}</span><h2 id="implementation-title">{zh ? "技术线索" : "Technical signals"}</h2></div></div>
        <dl className="technical-signals">
          <Signal label={zh ? "框架" : "Frameworks"} values={capture.implementationTrace?.frameworkSignals ?? []} />
          <Signal label={zh ? "库" : "Libraries"} values={capture.implementationTrace?.librarySignals ?? []} />
          <Signal label={zh ? "事件模型" : "Event model"} values={capture.implementationTrace?.eventModelHints ?? []} />
          <Signal label={zh ? "样式运行时" : "Style runtime"} values={capture.implementationTrace?.styleRuntimeHints ?? []} />
        </dl>
      </section>
      {isRebuild ? (
        <section className="workspace-section recorder-workspace" aria-label={zh ? "Recorder 流程导入" : "Recorder flow import"}>
          <WorkspaceRecorderImport flow={recorderFlow} match={recorderFlowMatch} locale={locale} disabled={isBusy || !canEditCurrentRoute} onImport={onImportRecorderFlow} onClear={onClearRecorderFlow} />
        </section>
      ) : null}
      {isRebuild ? (
        <section className="workspace-section route-workspace" aria-labelledby="route-workspace-title">
          <h2 className="sr-only" id="route-workspace-title">{zh ? "网站路由项目" : "Site route project"}</h2>
          <RebuildRouteProjectPanel capture={capture} project={routeProject} locale={locale} disabled={isBusy || !canEditCurrentRoute} onAdd={onAddRoute} onRemove={onRemoveRoute} onExport={onExportRouteProject} onStartNew={onStartNewRouteProject} />
        </section>
      ) : null}
    </div>
  );
}

function Signal({ label, values }: { label: string; values: string[] }) {
  return <div><dt>{label}</dt><dd>{values.length ? values.slice(0, 5).join(" · ") : "-"}</dd></div>;
}
