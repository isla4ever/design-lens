import React from "react";
import {
  rebuildAssetPolicyLabel,
  rebuildStateLabel,
  rebuildViewportLabel,
  type DesignBrief,
  type RebuildState,
  type RebuildViewport
} from "../../src/shared/design-brief";
import { OutputField, StackField, type BriefPanelProps } from "./BriefFields";

export function RebuildBriefPanel({ locale, brief, disabled, onChange }: BriefPanelProps) {
  const zh = locale === "zh";
  const viewports: RebuildViewport[] = ["desktop", "mobile"];
  const states: RebuildState[] = ["initial", "scroll", "hover", "focus", "open"];

  function toggleViewport(viewport: RebuildViewport) {
    const selected = brief.rebuild.viewports.includes(viewport);
    const next = selected ? brief.rebuild.viewports.filter((item) => item !== viewport) : [...brief.rebuild.viewports, viewport];
    onChange({ ...brief, rebuild: { ...brief.rebuild, viewports: next.length ? next : [viewport] } });
  }

  function toggleState(state: RebuildState) {
    if (state === "initial") return;
    const selected = brief.rebuild.states.includes(state);
    const next = selected ? brief.rebuild.states.filter((item) => item !== state) : [...brief.rebuild.states, state];
    onChange({ ...brief, rebuild: { ...brief.rebuild, states: next } });
  }

  return (
    <section className="intent-panel rebuild-intent-panel" aria-label={zh ? "重建范围" : "Rebuild scope"}>
      <div className="intent-head"><strong>{zh ? "重建范围与授权" : "Rebuild scope and authorization"}</strong></div>
      <label className="intent-field">
        <span>{zh ? "重建目标或限制" : "Rebuild target or constraints"}</span>
        <textarea value={brief.goal} rows={2} placeholder={zh ? "例如：只重建首页首屏和导航，替换品牌图片与文案。" : "Example: rebuild only the homepage hero and navigation, replacing branded assets and copy."} onChange={(event) => onChange({ ...brief, goal: event.currentTarget.value })} disabled={disabled} />
      </label>
      <div className="intent-row">
        <OutputField locale={locale} brief={brief} disabled={disabled} onChange={onChange} />
        <StackField locale={locale} brief={brief} disabled={disabled} onChange={onChange} />
      </div>
      <ChoiceGroup label={zh ? "目标视口" : "Target viewports"}>
        {viewports.map((viewport) => (
          <button key={viewport} className={brief.rebuild.viewports.includes(viewport) ? "choice-button active" : "choice-button"} type="button" aria-pressed={brief.rebuild.viewports.includes(viewport)} disabled={disabled} onClick={() => toggleViewport(viewport)}>
            {rebuildViewportLabel(viewport, locale)}
          </button>
        ))}
      </ChoiceGroup>
      <ChoiceGroup label={zh ? "需要验收的状态" : "Required states"}>
        {states.map((state) => (
          <button key={state} className={brief.rebuild.states.includes(state) ? "choice-button active" : "choice-button"} type="button" aria-pressed={brief.rebuild.states.includes(state)} disabled={disabled || state === "initial"} onClick={() => toggleState(state)}>
            {rebuildStateLabel(state, locale)}
          </button>
        ))}
      </ChoiceGroup>
      <label className="intent-field">
        <span>{zh ? "资产策略" : "Asset policy"}</span>
        <select value={brief.rebuild.assetPolicy} disabled={disabled} onChange={(event) => onChange({ ...brief, rebuild: { ...brief.rebuild, assetPolicy: event.currentTarget.value as DesignBrief["rebuild"]["assetPolicy"] } })}>
          <option value="manifest-only">{rebuildAssetPolicyLabel("manifest-only", locale)}</option>
          <option value="bundle-authorized">{rebuildAssetPolicyLabel("bundle-authorized", locale)}</option>
        </select>
      </label>
      <label className="authorization-check">
        <input type="checkbox" checked={brief.rebuild.captureCanvas} disabled={disabled} onChange={(event) => onChange({ ...brief, rebuild: { ...brief.rebuild, captureCanvas: event.currentTarget.checked } })} />
        <span>{zh ? "采集受限 Canvas 位图证据（可能包含页面视觉内容）" : "Capture bounded Canvas bitmap evidence (may contain page visuals)"}</span>
      </label>
      <label className="authorization-check">
        <input type="checkbox" checked={brief.rebuild.authorizationConfirmed} disabled={disabled} onChange={(event) => onChange({ ...brief, rebuild: { ...brief.rebuild, authorizationConfirmed: event.currentTarget.checked } })} />
        <span>{zh ? "我确认拥有该页面重建及所选资产的使用权限" : "I confirm I have permission to rebuild this page and use selected assets"}</span>
      </label>
    </section>
  );
}

function ChoiceGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <fieldset className="choice-group"><legend>{label}</legend><div>{children}</div></fieldset>;
}
