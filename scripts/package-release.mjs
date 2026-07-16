import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = packageJson.version;
const basePermissions = ["activeTab", "scripting", "sidePanel", "storage", "tabs"];
const hostPermissions = ["<all_urls>"];

if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
  throw new Error(`Package version is not compatible with a Chrome extension manifest: ${version}`);
}

if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Release tag ${process.env.GITHUB_REF_NAME} does not match package version v${version}`);
}

const variants = [
  {
    name: "standard",
    source: resolve(root, `.output/design-lens-extension-${version}-chrome.zip`),
    target: `design-lens-${version}-standard-chrome.zip`,
    expectedName: "Design Lens",
    permissions: basePermissions
  },
  {
    name: "collector",
    source: resolve(root, `.output/collector/design-lens-extension-${version}-chrome.zip`),
    target: `design-lens-${version}-collector-chrome.zip`,
    expectedName: "Design Lens Collector",
    permissions: [...basePermissions, "debugger"]
  }
];

const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const checksums = [];
for (const variant of variants) {
  const bytes = await readFile(variant.source);
  const archive = unzipSync(bytes);
  const manifestPath = Object.keys(archive).find((entry) => entry === "manifest.json" || entry.endsWith("/manifest.json"));
  if (!manifestPath) throw new Error(`${variant.name} archive does not contain manifest.json`);

  const manifest = JSON.parse(strFromU8(archive[manifestPath]));
  if (manifest.version !== version) {
    throw new Error(`${variant.name} manifest version ${manifest.version} does not match package version ${version}`);
  }
  if (manifest.name !== variant.expectedName) {
    throw new Error(`${variant.name} archive has an unexpected extension name: ${manifest.name}`);
  }
  assertStringSet(`${variant.name} permissions`, manifest.permissions, variant.permissions);
  assertStringSet(`${variant.name} host permissions`, manifest.host_permissions, hostPermissions);
  if (manifest.content_scripts?.length) {
    throw new Error(`${variant.name} archive must inject the page bridge on demand instead of registering a persistent content script`);
  }

  const targetPath = resolve(dist, variant.target);
  await copyFile(variant.source, targetPath);
  checksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${variant.target}`);
}

await writeFile(resolve(dist, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");
console.log(`Prepared Design Lens v${version} release artifacts in ${dist}`);

function assertStringSet(label, actual, expected) {
  const normalizedActual = Array.isArray(actual) ? [...actual].sort() : [];
  const normalizedExpected = [...expected].sort();
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(`${label} changed: expected ${normalizedExpected.join(", ")}; received ${normalizedActual.join(", ") || "none"}`);
  }
}
