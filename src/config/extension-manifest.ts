export function buildExtensionManifest(mode: string) {
  const isCollector = mode === "collector";
  return {
    name: isCollector ? "Design Lens Collector" : "Design Lens",
    description: isCollector
      ? "Capture authorized rebuild evidence with optional Chrome DevTools Protocol inspection."
      : "Capture design tokens, component patterns, layout rules, and motion cues from live websites.",
    version: "0.2.0",
    permissions: ["activeTab", "scripting", "storage", "tabs", "sidePanel", ...(isCollector ? ["debugger"] : [])],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: isCollector ? "Analyze with Design Lens Collector" : "Analyze with Design Lens",
      default_popup: "popup.html"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    commands: {
      "capture-selection": {
        suggested_key: {
          default: "Alt+Shift+D",
          mac: "Alt+Shift+D"
        },
        description: "Capture the selected element with Design Lens"
      }
    }
  };
}
