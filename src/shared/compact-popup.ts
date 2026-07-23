export function buildCompactPopupPath(tabId: number) {
  return `popup.html?targetTabId=${tabId}`;
}

export async function openCompactActionPopup(tabId: number) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error("The target tab is unavailable.");
  if (typeof browser.action.openPopup !== "function") throw new Error("The browser does not support opening the extension popup from the Side Panel.");

  await browser.action.setPopup({ tabId, popup: buildCompactPopupPath(tabId) });
  try {
    await browser.action.openPopup();
  } finally {
    await browser.action.setPopup({ tabId, popup: "" }).catch(() => undefined);
  }
}
