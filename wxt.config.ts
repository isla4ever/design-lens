import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Design Lens",
    description:
      "Capture design tokens, component patterns, layout rules, and motion cues from live websites.",
    version: "0.1.0",
    permissions: ["activeTab", "scripting", "storage", "tabs"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Analyze with Design Lens",
      default_popup: "popup.html"
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
  }
});
