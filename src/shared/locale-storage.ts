import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./i18n";

const LOCALE_KEY = "designLensLocale";

export async function getStoredLocale(): Promise<Locale> {
  try {
    const result = await browser.storage.local.get(LOCALE_KEY);
    return normalizeLocale(result[LOCALE_KEY]);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function setStoredLocale(locale: Locale) {
  await browser.storage.local.set({ [LOCALE_KEY]: locale });
}
