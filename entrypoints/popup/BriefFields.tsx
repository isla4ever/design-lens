import React from "react";
import type { DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";

export function OutputField({ locale, brief, disabled, onChange }: BriefPanelProps) {
  const zh = locale === "zh";
  return (
    <label className="intent-field">
      <span>{zh ? "输出" : "Output"}</span>
      <select value={brief.output} disabled={disabled} onChange={(event) => onChange({ ...brief, output: event.currentTarget.value as DesignBrief["output"] })}>
        <option value="homepage">{zh ? "首页" : "Homepage"}</option>
        <option value="component">{zh ? "组件/模块" : "Component"}</option>
        <option value="full-site">{zh ? "完整网站" : "Full site"}</option>
        <option value="prototype">{zh ? "可验证原型" : "Prototype"}</option>
      </select>
    </label>
  );
}

export function StackField({ locale, brief, disabled, onChange }: BriefPanelProps) {
  return (
    <label className="intent-field">
      <span>{locale === "zh" ? "技术栈" : "Stack"}</span>
      <select value={brief.stack} disabled={disabled} onChange={(event) => onChange({ ...brief, stack: event.currentTarget.value as DesignBrief["stack"] })}>
        <option value="html">HTML/CSS/JS</option>
        <option value="react">React</option>
        <option value="vue">Vue</option>
        <option value="next">Next.js</option>
      </select>
    </label>
  );
}

export type BriefPanelProps = {
  locale: Locale;
  brief: DesignBrief;
  disabled: boolean;
  onChange: (brief: DesignBrief) => void;
};
