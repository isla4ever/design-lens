import React, { useEffect, useState } from "react";
import { Save, ShieldCheck, Trash2 } from "lucide-react";
import { AI_PROVIDER_PRESETS } from "../../src/ai/provider-presets";
import { createDefaultAiSettingsState, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, getActiveAiProfile, profileIdForPreset, type AiEndpoint, type AiProviderProfile, type AiSettingsState } from "../../src/shared/ai-settings";
import type { Locale } from "../../src/shared/i18n";

export function AiSettingsMenu({
  locale,
  state,
  onSave,
  onClear
}: {
  locale: Locale;
  state: AiSettingsState;
  onSave: (profile: AiProviderProfile) => void | Promise<void>;
  onClear: (profileId: string) => void | Promise<void>;
}) {
  const zh = locale === "zh";
  const activeProfile = getActiveAiProfile(state);
  const [draft, setDraft] = useState<AiProviderProfile>(activeProfile);
  const [showKey, setShowKey] = useState(false);
  const selectedPreset = draft.presetId || "custom";
  const savedProfile = state.profiles[draft.id];
  const hasSavedKey = Boolean(savedProfile?.apiKey);
  const isActiveProfile = state.activeProfileId === draft.id;
  const isDirty = !savedProfile || JSON.stringify(stripProfileTime(savedProfile)) !== JSON.stringify(stripProfileTime(draft));
  const canSave = isDirty || !isActiveProfile || !hasSavedKey;

  useEffect(() => {
    setDraft(activeProfile);
  }, [activeProfile]);

  function choosePreset(presetId: string) {
    if (presetId === "custom") {
      const existing = state.profiles.custom;
      setDraft(existing ?? {
        id: "custom",
        presetId: "custom",
        name: zh ? "自定义 Provider" : "Custom Provider",
        apiKey: "",
        model: draft.model || DEFAULT_AI_MODEL,
        baseUrl: draft.baseUrl || DEFAULT_AI_BASE_URL,
        endpoint: draft.endpoint,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    const preset = AI_PROVIDER_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const id = profileIdForPreset(preset.id);
    setDraft(state.profiles[id] ?? {
      id,
      presetId: preset.id,
      name: preset.name,
      apiKey: "",
      model: preset.model,
      baseUrl: preset.baseUrl,
      endpoint: preset.endpoint,
      updatedAt: new Date().toISOString()
    });
  }

  return (
    <form className="ai-menu" onSubmit={(event) => event.preventDefault()} aria-label={zh ? "AI 配置" : "AI settings"}>
      <div className="ai-menu-head">
        <div>
          <strong>{zh ? "AI 连接" : "AI Connection"}</strong>
          <span>{zh ? "按服务商本地保存，key 不通用。" : "Saved locally per provider; keys are not universal."}</span>
        </div>
        <span className={hasSavedKey ? "ai-badge saved" : "ai-badge"}>
          {hasSavedKey ? (isActiveProfile ? (zh ? "当前" : "Active") : (zh ? "已保存" : "Saved")) : (zh ? "未保存" : "Unsaved")}
        </span>
      </div>

      <label className="ai-field">
        <span>{zh ? "服务商" : "Provider"}</span>
        <select value={selectedPreset} onChange={(event) => choosePreset(event.currentTarget.value)}>
          <option value="custom">{zh ? "自定义" : "Custom"}</option>
          {AI_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <div className="ai-field-grid">
        <label className="ai-field">
          <span>{zh ? "模型" : "Model"}</span>
          <input
            value={draft.model}
            placeholder={DEFAULT_AI_MODEL}
            onChange={(event) => setDraft({ ...draft, model: event.currentTarget.value })}
          />
        </label>
        <label className="ai-field">
          <span>{zh ? "接口" : "Endpoint"}</span>
          <select value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.currentTarget.value as AiEndpoint })}>
            <option value="responses">Responses</option>
            <option value="chat-completions">Chat</option>
          </select>
        </label>
      </div>

      <label className="ai-field">
        <span>{zh ? "Base URL" : "Base URL"}</span>
        <input
          value={draft.baseUrl}
          placeholder={DEFAULT_AI_BASE_URL}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.currentTarget.value })}
        />
      </label>

      <label className="ai-field">
        <span>{zh ? "API Key" : "API Key"}</span>
        <div className="key-row">
          <input
            type={showKey ? "text" : "password"}
            value={draft.apiKey}
            placeholder={zh ? "只保存当前服务商的 key" : "Only for this provider"}
            onChange={(event) => setDraft({ ...draft, apiKey: event.currentTarget.value })}
          />
          <button className="key-reveal" type="button" onClick={() => setShowKey((value) => !value)}>
            {showKey ? (zh ? "隐藏" : "Hide") : (zh ? "显示" : "Show")}
          </button>
        </div>
      </label>

      <p className="ai-provider-note">
        {selectedPreset === "custom"
          ? (zh ? "自定义服务需要兼容 Responses 或 Chat Completions。" : "Custom providers must support Responses or Chat Completions.")
          : AI_PROVIDER_PRESETS.find((preset) => preset.id === selectedPreset)?.note}
      </p>

      <div className="ai-menu-footer">
        <span><ShieldCheck aria-hidden="true" />{formatSavedAt(savedProfile?.updatedAt, locale)}</span>
        <div>
          <button className="clear-ai" type="button" onClick={() => onClear(draft.id)}>
            <Trash2 aria-hidden="true" />
            {zh ? "清除" : "Clear"}
          </button>
          <button className="save-ai" type="button" onClick={() => onSave(draft)} disabled={!canSave}>
            <Save aria-hidden="true" />
            {zh ? "保存配置" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

function stripProfileTime(profile: AiProviderProfile) {
  const { updatedAt, ...rest } = profile;
  return rest;
}

function formatSavedAt(value: string | undefined, locale: Locale) {
  if (!value) return locale === "zh" ? "仅本地保存" : "Local only";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return locale === "zh" ? "仅本地保存" : "Local only";
  return locale === "zh" ? "已本地保存" : "Saved locally";
}
