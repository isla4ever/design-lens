import { defineConfig } from "wxt";
import { buildExtensionManifest } from "./src/config/extension-manifest";

const isCollectorBuild = process.env.DESIGN_LENS_COLLECTOR === "1";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: isCollectorBuild ? ".output/collector" : ".output",
  manifest: ({ mode }) => buildExtensionManifest(isCollectorBuild ? "collector" : mode),
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      if (!manifest.content_scripts?.length) delete manifest.content_scripts;
    }
  }
});
