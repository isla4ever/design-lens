const OPENAI_API_KEY = "designLensOpenAiApiKey";
const OPENAI_MODEL = "designLensOpenAiModel";
const OPENAI_BASE_URL = "designLensOpenAiBaseUrl";
const OPENAI_ENDPOINT = "designLensOpenAiEndpoint";
const AI_SETTINGS_STATE = "designLensAiSettingsState";

export const DEFAULT_AI_MODEL = "gpt-5.4-mini";
export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_AI_PROFILE_ID = "openai";
export type AiEndpoint = "responses" | "chat-completions";

export type AiSettings = {
  apiKey: string;
  model: string;
  baseUrl: string;
  endpoint: AiEndpoint;
};

export type AiProviderProfile = AiSettings & {
  id: string;
  presetId: string;
  name: string;
  updatedAt: string;
};

export type AiSettingsState = {
  activeProfileId: string;
  profiles: Record<string, AiProviderProfile>;
};

export function createDefaultAiProfile(): AiProviderProfile {
  return normalizeProfile({
    id: DEFAULT_AI_PROFILE_ID,
    presetId: DEFAULT_AI_PROFILE_ID,
    name: "OpenAI",
    apiKey: "",
    model: DEFAULT_AI_MODEL,
    baseUrl: DEFAULT_AI_BASE_URL,
    endpoint: "responses",
    updatedAt: new Date(0).toISOString()
  });
}

export function createDefaultAiSettingsState(): AiSettingsState {
  const profile = createDefaultAiProfile();
  return {
    activeProfileId: profile.id,
    profiles: {
      [profile.id]: profile
    }
  };
}

export async function getAiSettingsState(): Promise<AiSettingsState> {
  try {
    const result = await browser.storage.local.get([AI_SETTINGS_STATE, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL, OPENAI_ENDPOINT]);
    const stored = parseSettingsState(result[AI_SETTINGS_STATE]);
    if (stored) return stored;

    const migrated = migrateLegacySettings(result);
    await browser.storage.local.set({ [AI_SETTINGS_STATE]: migrated });
    return migrated;
  } catch {
    return createDefaultAiSettingsState();
  }
}

export async function setAiSettingsState(state: AiSettingsState) {
  await browser.storage.local.set({ [AI_SETTINGS_STATE]: normalizeSettingsState(state) });
}

export async function getAiSettings(): Promise<AiSettings> {
  const state = await getAiSettingsState();
  return getActiveAiProfile(state);
}

export async function setAiSettings(settings: AiSettings) {
  const now = new Date().toISOString();
  const state = await getAiSettingsState();
  const current = getActiveAiProfile(state);
  await setAiSettingsState({
    ...state,
    profiles: {
      ...state.profiles,
      [current.id]: normalizeProfile({
        ...current,
        ...settings,
        updatedAt: now
      })
    }
  });
}

export async function clearAiSettings() {
  await browser.storage.local.remove([AI_SETTINGS_STATE, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL, OPENAI_ENDPOINT]);
}

export function getActiveAiProfile(state: AiSettingsState): AiProviderProfile {
  return state.profiles[state.activeProfileId] ?? Object.values(state.profiles)[0] ?? createDefaultAiProfile();
}

export function upsertAiProfile(state: AiSettingsState, profile: AiProviderProfile): AiSettingsState {
  const normalized = normalizeProfile(profile);
  return {
    activeProfileId: normalized.id,
    profiles: {
      ...state.profiles,
      [normalized.id]: normalized
    }
  };
}

export function normalizeEndpoint(value: unknown): AiEndpoint {
  return value === "chat-completions" ? "chat-completions" : "responses";
}

export function profileIdForPreset(presetId: string) {
  return presetId === "custom" ? "custom" : presetId;
}

function parseSettingsState(value: unknown): AiSettingsState | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<AiSettingsState>;
  if (!maybe.profiles || typeof maybe.profiles !== "object") return null;
  return normalizeSettingsState({
    activeProfileId: typeof maybe.activeProfileId === "string" ? maybe.activeProfileId : DEFAULT_AI_PROFILE_ID,
    profiles: maybe.profiles as Record<string, AiProviderProfile>
  });
}

function normalizeSettingsState(state: AiSettingsState): AiSettingsState {
  const entries = Object.entries(state.profiles)
    .map(([id, profile]) => normalizeProfile({ ...profile, id: profile.id || id }))
    .filter((profile) => profile.id);
  const fallback = createDefaultAiProfile();
  const profiles = Object.fromEntries(entries.length ? entries.map((profile) => [profile.id, profile]) : [[fallback.id, fallback]]);
  const activeProfileId = profiles[state.activeProfileId] ? state.activeProfileId : Object.keys(profiles)[0] ?? fallback.id;
  return { activeProfileId, profiles };
}

function normalizeProfile(profile: AiProviderProfile): AiProviderProfile {
  const id = String(profile.id || DEFAULT_AI_PROFILE_ID).trim() || DEFAULT_AI_PROFILE_ID;
  const presetId = String(profile.presetId || id || "custom").trim() || "custom";
  const name = String(profile.name || presetId || "Custom").trim() || "Custom";
  const model = String(profile.model || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL;
  const baseUrl = String(profile.baseUrl || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_AI_BASE_URL;
  const updatedAt = typeof profile.updatedAt === "string" && profile.updatedAt ? profile.updatedAt : new Date().toISOString();
  return {
    id,
    presetId,
    name,
    apiKey: String(profile.apiKey || "").trim(),
    model,
    baseUrl,
    endpoint: normalizeEndpoint(profile.endpoint),
    updatedAt
  };
}

function migrateLegacySettings(result: Record<string, unknown>): AiSettingsState {
  const legacy: AiProviderProfile = {
    ...createDefaultAiProfile(),
    apiKey: typeof result[OPENAI_API_KEY] === "string" ? result[OPENAI_API_KEY] : "",
    model: typeof result[OPENAI_MODEL] === "string" && result[OPENAI_MODEL] ? result[OPENAI_MODEL] : DEFAULT_AI_MODEL,
    baseUrl: typeof result[OPENAI_BASE_URL] === "string" && result[OPENAI_BASE_URL] ? result[OPENAI_BASE_URL] : DEFAULT_AI_BASE_URL,
    endpoint: normalizeEndpoint(result[OPENAI_ENDPOINT]),
    updatedAt: new Date().toISOString()
  };
  return {
    activeProfileId: legacy.id,
    profiles: {
      [legacy.id]: normalizeProfile(legacy)
    }
  };
}
