import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const ICON_DIR = path.join(ROOT_DIR, "assets", "img", "icons");
const IOS_ASSET_DIR = path.join(ROOT_DIR, "ios", "App", "App", "Assets.xcassets");

const iconSets = [
  { source: "original-premium.png", assetSet: "AppIcon.appiconset" },
  { source: "aurora.png", assetSet: "AppIconAurora.appiconset" },
  { source: "transit-motion.png", assetSet: "AppIconTransitMotion.appiconset" },
  { source: "coastline-explorer.png", assetSet: "AppIconCoastlineExplorer.appiconset" }
];

const iosSizes = [
  ["Icon-20.png", 20],
  ["Icon-20@2x.png", 40],
  ["Icon-20@3x.png", 60],
  ["Icon-29.png", 29],
  ["Icon-29@2x.png", 58],
  ["Icon-29@3x.png", 87],
  ["Icon-40.png", 40],
  ["Icon-40@2x.png", 80],
  ["Icon-40@3x.png", 120],
  ["Icon-60@2x.png", 120],
  ["Icon-60@3x.png", 180],
  ["Icon-76.png", 76],
  ["Icon-76@2x.png", 152],
  ["Icon-83.5@2x.png", 167],
  ["Icon-1024.png", 1024]
];

function resize(source, target, size) {
  const result = spawnSync("/usr/bin/sips", ["-z", String(size), String(size), source, "--out", target], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `sips failed while generating ${target}`);
  }
}

async function build() {
  const primarySource = path.join(ICON_DIR, "original-premium.png");
  await copyFile(primarySource, path.join(ROOT_DIR, "assets", "img", "app-icon.png"));
  resize(primarySource, path.join(ROOT_DIR, "assets", "img", "app-icon-512.png"), 512);
  resize(primarySource, path.join(ROOT_DIR, "assets", "img", "app-icon-192.png"), 192);

  for (const iconSet of iconSets) {
    const source = path.join(ICON_DIR, iconSet.source);
    const outputDir = path.join(IOS_ASSET_DIR, iconSet.assetSet);
    await mkdir(outputDir, { recursive: true });
    iosSizes.forEach(([filename, size]) => resize(source, path.join(outputDir, filename), size));
  }

  console.log(`Generated web icons and ${iconSets.length} iOS app icon sets.`);
}

build().catch((error) => {
  console.error(`[icons:generate] ${error.message}`);
  process.exitCode = 1;
});
