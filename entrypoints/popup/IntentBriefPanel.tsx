import React from "react";
import { briefBorrowLabel, type BorrowMode, type DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";

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
    <section className="intent-panel" aria-label={zh ? "创作意图" : "Build intent"}>
      <div className="intent-head">
        <strong>{zh ? "创作意图与生成要求" : "Build intent and prompt requirements"}</strong>
      </div>

      <div className="site-type-grid" aria-label={zh ? "网站类型快捷选项" : "Site type presets"}>
        {siteTypeOptions.map((option) => (
          <button
            key={option}
            className={brief.siteType === option ? "site-type-chip active" : "site-type-chip"}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...brief, siteType: option })}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="intent-field">
        <span>{zh ? "网站类型" : "Site type"}</span>
        <input
          value={brief.siteType}
          placeholder={zh ? "例如：个人技术博客、SaaS 官网、AI 工具站、作品集、电商活动页" : "e.g. personal tech blog, SaaS site, AI tool, portfolio, commerce campaign"}
          onChange={(event) => onChange({ ...brief, siteType: event.currentTarget.value })}
          disabled={disabled}
        />
      </label>

      <label className="intent-field">
        <span>{zh ? "你要做什么" : "What are you building"}</span>
        <textarea
          value={brief.goal}
          rows={3}
          placeholder={zh ? "例如：个人技术博客首页，借鉴首屏大字、黑白舞台切换和鼠标水纹，但不要工作室官网感。" : "Example: a personal engineering blog homepage that borrows the large-type stage, monochrome transitions, and pointer ripple without feeling like an agency site."}
          onChange={(event) => onChange({ ...brief, goal: event.currentTarget.value })}
          disabled={disabled}
        />
      </label>

      <div className="borrow-grid" aria-label={zh ? "希望借鉴" : "Borrow from reference"}>
        {borrowModes.map((mode) => (
          <button key={mode} className={brief.borrow.includes(mode) ? "borrow-chip active" : "borrow-chip"} type="button" disabled={disabled} onClick={() => toggleBorrow(mode)}>
            {briefBorrowLabel(mode, locale)}
          </button>
        ))}
      </div>

      <div className="intent-row">
        <label className="intent-field">
          <span>{zh ? "输出" : "Output"}</span>
          <select value={brief.output} disabled={disabled} onChange={(event) => onChange({ ...brief, output: event.currentTarget.value as DesignBrief["output"] })}>
            <option value="homepage">{zh ? "首页" : "Homepage"}</option>
            <option value="component">{zh ? "组件/模块" : "Component"}</option>
            <option value="full-site">{zh ? "完整网站" : "Full site"}</option>
            <option value="prototype">{zh ? "可验证原型" : "Prototype"}</option>
          </select>
        </label>
        <label className="intent-field">
          <span>{zh ? "技术栈" : "Stack"}</span>
          <select value={brief.stack} disabled={disabled} onChange={(event) => onChange({ ...brief, stack: event.currentTarget.value as DesignBrief["stack"] })}>
            <option value="html">HTML/CSS/JS</option>
            <option value="react">React</option>
            <option value="vue">Vue</option>
            <option value="next">Next.js</option>
          </select>
        </label>
      </div>

      <div className="intent-row">
        <label className="intent-field">
          <span>{zh ? "参考强度" : "Similarity"}</span>
          <select value={brief.similarity} disabled={disabled} onChange={(event) => onChange({ ...brief, similarity: event.currentTarget.value as DesignBrief["similarity"] })}>
            <option value="inspired">{zh ? "气质启发" : "Inspired"}</option>
            <option value="strong-reference">{zh ? "明显参考" : "Strong reference"}</option>
            <option value="high-fidelity-structure">{zh ? "高保真结构学习" : "High-fidelity structure"}</option>
          </select>
        </label>
        <label className="intent-field">
          <span>{zh ? "避免像什么" : "Avoid"}</span>
          <input
            value={brief.avoid}
            placeholder={zh ? "例如：不要像营销页" : "e.g. not a marketing landing page"}
            onChange={(event) => onChange({ ...brief, avoid: event.currentTarget.value })}
            disabled={disabled}
          />
        </label>
      </div>
    </section>
  );
}
