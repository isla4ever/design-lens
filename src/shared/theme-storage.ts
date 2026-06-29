const THEME_KEY = "designLensTheme";

export type ThemeMode = "light" | "dark";

export async function getStoredTheme(): Promise<ThemeMode> {
  try {
    const result = await browser.storage.local.get(THEME_KEY);
    const value = result[THEME_KEY];
    if (value === "light" || value === "dark") return value;
    return resolveSystemTheme();
  } catch {
    return resolveSystemTheme();
  }
}

export async function setStoredTheme(theme: ThemeMode) {
  await browser.storage.local.set({ [THEME_KEY]: theme });
}

export function resolveSystemTheme(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}
