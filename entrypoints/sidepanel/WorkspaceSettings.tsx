import React, { useEffect, useState } from "react";
import { ChevronDown, Save, Settings2 } from "lucide-react";
import { getActiveAiProfile, type AiProviderProfile, type AiSettingsState } from "../../src/shared/ai-settings";
import type { DesignBrief } from "../../src/shared/design-brief";
import type { Locale } from "../../src/shared/i18n";
import { AiSettingsMenu } from "../popup/AiSettingsMenu";
import { CaptureModeSelector } from "../popup/CaptureModeSelector";
import { IntentBriefPanel } from "../popup/IntentBriefPanel";

export function WorkspaceSettings({ locale, brief, aiSettings, onSaveBrief, onSaveAi, onClearAi }: {
  locale: Locale;
  brief: DesignBrief;
  aiSettings: AiSettingsState;
  onSaveBrief: (brief: DesignBrief) => void;
  onSaveAi: (profile: AiProviderProfile) => void;
  onClearAi: (profileId: string) => void;
}) {
  const [draft, setDraft] = useState(brief);
  const zh = locale === "zh";
  const hasAiKey = Boolean(getActiveAiProfile(aiSettings).apiKey.trim());
  useEffect(() => setDraft(brief), [brief]);
  return (
    <div className="settings-layout">
      <section className="workspace-section" aria-labelledby="capture-settings-title">
        <div className="section-heading"><div><span>{zh ? "范围" : "Scope"}</span><h2 id="capture-settings-title">{zh ? "捕获与导出要求" : "Capture and export brief"}</h2></div></div>
        <CaptureModeSelector mode={draft.mode} locale={locale} disabled={false} onChange={(mode) => setDraft({ ...draft, mode })} />
        <IntentBriefPanel locale={locale} brief={draft} onChange={setDraft} />
        <button className="workspace-primary save-brief" type="button" onClick={() => onSaveBrief(draft)}><Save aria-hidden="true" />{zh ? "保存要求" : "Save brief"}</button>
      </section>
      {draft.mode === "reference" ? (
        <details className="workspace-disclosure workspace-section ai-settings-disclosure" open={!hasAiKey}>
          <summary><Settings2 aria-hidden="true" /><span>{zh ? "AI 配置" : "AI settings"}</span><ChevronDown className="disclosure-chevron" aria-hidden="true" /></summary>
          <div className="ai-settings-body"><AiSettingsMenu locale={locale} state={aiSettings} onSave={onSaveAi} onClear={onClearAi} /></div>
        </details>
      ) : null}
    </div>
  );
}
