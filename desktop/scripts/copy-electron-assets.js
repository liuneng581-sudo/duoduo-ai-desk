/**
 * Build-time: copy non-TS Electron assets into dist-electron so they ship in the
 * asar (build.files includes dist-electron/**, but tsc only emits .js — it does
 * not copy images). The tray + window + installer icon all come from icon.png;
 * without this copy the tray icon is blank at runtime.
 *
 * Run: node scripts/copy-electron-assets.js  (invoked by electron:build after tsc)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'electron');
const OUT_DIR = path.join(ROOT, 'dist-electron');

const ASSETS = ['icon.png'];

fs.mkdirSync(OUT_DIR, { recursive: true });

let copied = 0;
for (const name of ASSETS) {
  const src = path.join(SRC_DIR, name);
  const dst = path.join(OUT_DIR, name);
  if (!fs.existsSync(src)) {
    console.error(`❌ Electron asset missing: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[copy-electron-assets] ${name} -> dist-electron/`);
}
console.log(`✅ Copied ${copied} electron asset(s).`);
