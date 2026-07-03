/**
 * Ensure the installer contains a Windows Chromium runtime for Playwright.
 *
 * This project launches the companion with PLAYWRIGHT_BROWSERS_PATH pointing to
 * resources/browsers. Packaging must fail if that directory does not contain a
 * Windows browser; otherwise clean machines will fail only after install.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BROWSERS_DIR = path.join(ROOT_DIR, 'browsers');

function findFile(dir, fileName, maxDepth = 6) {
  if (!fs.existsSync(dir) || maxDepth < 0) return null;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName, maxDepth - 1);
      if (found) return found;
    }
  }

  return null;
}

function findWindowsChromium() {
  const chromeExe = findFile(BROWSERS_DIR, 'chrome.exe');
  if (chromeExe) return chromeExe;

  return findFile(BROWSERS_DIR, 'headless_shell.exe');
}

function fail(message) {
  console.error(`[prepare-windows-browsers] ${message}`);
  console.error('[prepare-windows-browsers] Run this on Windows before packaging:');
  console.error('  npm install');
  console.error('  npm run prepare:windows-browsers');
  process.exit(1);
}

const existing = findWindowsChromium();
if (existing) {
  console.log(`[prepare-windows-browsers] Windows Chromium found: ${existing}`);
  process.exit(0);
}

fs.mkdirSync(BROWSERS_DIR, { recursive: true });

console.log(`[prepare-windows-browsers] Installing Chromium into ${BROWSERS_DIR}`);
const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR,
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  fail(`Playwright install failed: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(`Playwright install exited with code ${result.status}`);
}

const installed = findWindowsChromium();
if (!installed) {
  fail('Chromium was installed, but no Windows chrome.exe/headless_shell.exe was found. Build the Windows installer on Windows.');
}

console.log(`[prepare-windows-browsers] Windows Chromium ready: ${installed}`);
