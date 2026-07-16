import React from "react";
import {
  briefBorrowLabel,
  type BorrowMode,
  type DesignBrief
} from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import { OutputField, StackField, type BriefPanelProps } from "./BriefFields";
import { RebuildBriefPanel } from "./RebuildBriefPanel";

export function IntentBriefPanel({
  locale,
  brief,
  disabled = false,
  onChange
}: {
  locale: Locale;
  brief: DesignBrief;
  disabled?: boolean;
  onChange: (brief: DesignBrief) => void;
}) {
  return brief.mode === "rebuild"
    ? <RebuildBriefPanel locale={locale} brief={brief} disabled={disabled} onChange={onChange} />
    : <ReferenceBriefPanel locale={locale} brief={brief} disabled={disabled} onChange={onChange} />;
}

function ReferenceBriefPanel({ locale, brief, disabled, onChange }: BriefPanelProps) {
  const zh = locale === "zh";
  const borrowModes: BorrowMode[] = ["visual", "layout", "motion", "interaction", "media", "content-structure"];
  const siteTypeOptions = zh
    ? ["个人技术博客", "SaaS 官网", "作品集", "企业官网", "工具站", "活动页", "电商页", "落地页"]
    : ["Personal blog", "SaaS site", "Portfolio", "Company site", "Tool site", "Campaign page", "Commerce page", "Landing page"];

  function toggleBorrow(mode: BorrowMode) {
    const exists = brief.borrow.includes(mode);
    const nextBorrow = exists ? brief.borrow.filter((item) => item !== mode) : [...brief.borrow, mode];
    onChange({ ...brief, borrow: nextBorrow.length ? nextBorrow : [mode] });
  }

  return (
    <section className="intent-panel" aria-label={zh ? "设计参照要求" : "Reference brief"}>
      <div className="intent-head"><strong>{zh ? "创作意图与参照要求" : "Build intent and reference requirements"}</strong></div>

      <div className="site-type-grid" aria-label={zh ? "网站类型快捷选项" : "Site type presets"}>
        {siteTypeOptions.map((option) => (
          <button key={option} className={brief.siteType === option ? "site-type-chip active" : "site-type-chip"} type="button" disabled={disabled} onClick={() => onChange({ ...brief, siteType: option })}>
            {option}
          </button>
        ))}
      </div>

      <label className="intent-field">
        <span>{zh ? "网站类型" : "Site type"}</span>
        <input value={brief.siteType} placeholder={zh ? "例如：SaaS 官网、AI 工具站、作品集" : "e.g. SaaS site, AI tool, portfolio"} onChange={(event) => onChange({ ...brief, siteType: event.currentTarget.value })} disabled={disabled} />
      </label>

      <label className="intent-field">
        <span>{zh ? "你要做什么" : "What are you building"}</span>
        <textarea value={brief.goal} rows={3} placeholder={zh ? "例如：个人技术博客首页，借鉴首屏大字和鼠标水纹，但不要工作室官网感。" : "Example: a personal engineering blog borrowing the large-type stage and pointer ripple without agency branding."} onChange={(event) => onChange({ ...brief, goal: event.currentTarget.value })} disabled={disabled} />
      </label>

      <div className="borrow-grid" aria-label={zh ? "希望借鉴" : "Borrow from reference"}>
        {borrowModes.map((mode) => (
          <button key={mode} className={brief.borrow.includes(mode) ? "borrow-chip active" : "borrow-chip"} type="button" disabled={disabled} onClick={() => toggleBorrow(mode)}>
            {briefBorrowLabel(mode, locale)}
          </button>
        ))}
      </div>

      <div className="intent-row">
        <OutputField locale={locale} brief={brief} disabled={disabled} onChange={onChange} />
        <StackField locale={locale} brief={brief} disabled={disabled} onChange={onChange} />
      </div>

      <div className="intent-row">
        <label className="intent-field">
          <span>{zh ? "参考强度" : "Reference strength"}</span>
          <select value={brief.referenceStrength} disabled={disabled} onChange={(event) => onChange({ ...brief, referenceStrength: event.currentTarget.value as DesignBrief["referenceStrength"] })}>
            <option value="inspired">{zh ? "气质启发" : "Inspired"}</option>
            <option value="strong-reference">{zh ? "明显参考" : "Strong reference"}</option>
          </select>
        </label>
        <label className="intent-field">
          <span>{zh ? "避免像什么" : "Avoid"}</span>
          <input value={brief.avoid} placeholder={zh ? "例如：不要像营销页" : "e.g. not a marketing landing page"} onChange={(event) => onChange({ ...brief, avoid: event.currentTarget.value })} disabled={disabled} />
        </label>
      </div>
    </section>
  );
}
