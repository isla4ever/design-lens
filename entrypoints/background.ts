import { defineBackground } from "wxt/utils/define-background";

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "capture-selection") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isInjectableUrl(tab.url)) return;
    await browser.tabs.sendMessage(tab.id, { type: "DESIGN_LENS_CAPTURE_HOVER" }).catch(() => undefined);
  });
});

function isInjectableUrl(url?: string) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}
