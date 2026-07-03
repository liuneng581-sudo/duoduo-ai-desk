/**
 * Build-time guard: ensure the standalone Windows node.exe that the packaged
 * app spawns the backend server with is actually present before electron-builder
 * runs.
 *
 * Why this exists: package.json's build.extraResources copies `node.exe`
 * (project root) into the installer at resources/node.exe. electron-builder
 * SILENTLY SKIPS an extraResources entry whose source file is missing — so a
 * build machine without node.exe produces an installer that looks fine but has
 * no node.exe. At runtime electron/main.ts spawns
 *   path.join(process.resourcesPath, 'node.exe')
 * which then doesn't exist, the server never starts, and the app dies with a
 * misleading "服务返回 HTTP 404" (the health probe hits a stale/absent server).
 *
 * This shipped once (2026-06): the first Windows installer was missing node.exe
 * because the build dir never had it. Fail loudly here instead.
 *
 * Run: node scripts/check-node-exe.js   (invoked first by `electron:build`)
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_EXE = path.join(ROOT_DIR, 'node.exe');

// The PE header for a Windows x64 executable starts with "MZ". A token of the
// wrong platform (e.g. a symlink to the build machine's mac/linux node) would
// produce an installer that can't spawn the server, so sanity-check the magic
// bytes too — cheap insurance against a wrong-arch copy.
function looksLikeWindowsExe(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    return buf.toString('ascii') === 'MZ';
  } finally {
    fs.closeSync(fd);
  }
}

if (!fs.existsSync(NODE_EXE)) {
  console.error('❌ node.exe is missing from the project root:', NODE_EXE);
  console.error('   The packaged app spawns the backend server with this binary');
  console.error('   (resources/node.exe). Without it the installer builds fine but');
  console.error('   the server never starts → app shows "服务返回 HTTP 404".');
  console.error('');
  console.error('   Fix: place a Windows x64 node.exe at the project root before');
  console.error('   packaging. Download from https://nodejs.org/dist/ (win-x64,');
  console.error('   the bare node.exe), or copy the one used in a known-good build.');
  process.exit(1);
}

const size = fs.statSync(NODE_EXE).size;
if (size < 20 * 1024 * 1024) {
  console.error(`❌ node.exe at ${NODE_EXE} is only ${size} bytes — too small to be a real`);
  console.error('   Node runtime (expected ~80MB). It may be a placeholder, an LFS');
  console.error('   pointer, or a truncated download. Replace it with a real Windows');
  console.error('   x64 node.exe before packaging.');
  process.exit(1);
}

if (!looksLikeWindowsExe(NODE_EXE)) {
  console.error(`❌ node.exe at ${NODE_EXE} does not start with the "MZ" Windows PE`);
  console.error('   signature — it is not a Windows executable. The packaged app can');
  console.error('   only spawn a Windows node.exe. Replace it with a win-x64 build.');
  process.exit(1);
}

console.log(`✅ node.exe present and looks like a Windows binary (${(size / 1024 / 1024).toFixed(1)} MB).`);
