import { defineConfig } from "wxt";
import { buildExtensionManifest } from "./src/config/extension-manifest";

const isCollectorBuild = process.env.DESIGN_LENS_COLLECTOR === "1";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: isCollectorBuild ? ".output/collector" : ".output",
  vite: () => ({
    plugins: [{
      name: "design-lens-escape-forbidden-code-points",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            output.code = output.code.replace(/[\uFEFF\uFFFE\uFFFF]/g, (character) => `\\u${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
          }
        }
      }
    }]
  }),
  manifest: ({ mode }) => buildExtensionManifest(isCollectorBuild ? "collector" : mode),
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      if (!manifest.content_scripts?.length) delete manifest.content_scripts;
    }
  }
});
