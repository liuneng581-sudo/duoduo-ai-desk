/**
 * Build-time: generate the Prisma client, then normalize it for packaging.
 *
 * Replaces a bare `prisma generate` as the first build step. It exists to make
 * the step RE-RUNNABLE across repeated packaging runs on the same checkout.
 *
 * The problem it fixes:
 *   `electron:build` previously started with `prisma generate && patch-prisma`.
 *   patch-prisma.js rewrites @prisma/client so its entrypoints reference an
 *   `_prisma/` dir (electron-builder can't ship a dot-prefixed `.prisma` dir
 *   reliably). That leaves the tree in a "patched" terminal state. On the NEXT
 *   packaging run, `prisma generate` runs against that patched tree; on a build
 *   machine where Prisma's implicit "@prisma/client not found → auto-install"
 *   path fails (offline / restricted / permissions), generate dies with
 *   "Could not resolve @prisma/client despite the installation that we just
 *   tried", and the whole build aborts on step 1. This shipped: the second
 *   Windows build attempt failed here.
 *
 * Strategy:
 *   1. If a usable client is already present (PrismaClient instantiates with the
 *      current models), the client is current — skip generate, just ensure the
 *      packaging patch is applied, and exit. Re-running is a no-op.
 *   2. Otherwise run `prisma generate`. Then always run patch-prisma so the
 *      freshly generated `.prisma` is merged into `_prisma` and entrypoints are
 *      rewritten for packaging.
 *
 * Run: node scripts/generate-prisma.js   (invoked first by `electron:build`)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const fsMod = require('fs');
// prisma + @prisma/client are hoisted to the ROOT node_modules in this npm
// workspace. Resolve the CLI from root first, falling back to server/.
const PRISMA_CLI = [
  path.join(ROOT_DIR, 'node_modules', 'prisma', 'build', 'index.js'),
  path.join(SERVER_DIR, 'node_modules', 'prisma', 'build', 'index.js'),
].find((p) => fsMod.existsSync(p)) || path.join(ROOT_DIR, 'node_modules', 'prisma', 'build', 'index.js');
const SCHEMA = path.join(SERVER_DIR, 'prisma', 'schema.prisma');
const PATCH_SCRIPT = path.join(__dirname, 'patch-prisma.js');

function clientIsUsable() {
  // The generated client is self-contained after patching (@prisma/client/_prisma).
  // If it instantiates and exposes the schema's models, it's current and we can
  // skip a costly (and on some machines failure-prone) regenerate.
  try {
    const clientDir = require.resolve('@prisma/client', { paths: [SERVER_DIR, ROOT_DIR] });
    const { PrismaClient } = require(clientDir);
    const c = new PrismaClient();
    // A couple of models that must exist per schema.prisma.
    const ok = typeof c.user !== 'undefined' && typeof c.store !== 'undefined';
    // Best-effort disconnect; ignore if it throws (no DB connection needed here).
    if (typeof c.$disconnect === 'function') c.$disconnect().catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

function runPatch() {
  execFileSync(process.execPath, [PATCH_SCRIPT], { cwd: ROOT_DIR, stdio: 'inherit' });
}

if (!fs.existsSync(PRISMA_CLI)) {
  console.error('❌ Prisma CLI not found at', PRISMA_CLI);
  console.error('   Run `npm install` (and `npm install` in server/) on this machine first.');
  process.exit(1);
}

if (clientIsUsable()) {
  console.log('✅ Prisma client already generated and usable — skipping generate.');
  console.log('   Ensuring packaging patch is applied (idempotent)…');
  runPatch();
  console.log('[generate-prisma] Done (skipped generate).');
  process.exit(0);
}

console.log('🛠️  Generating Prisma client…');
try {
  execFileSync(process.execPath, [PRISMA_CLI, 'generate', '--schema', SCHEMA], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('\n❌ `prisma generate` failed.');
  console.error('   If the error mentions "Could not resolve @prisma/client despite');
  console.error('   the installation that we just tried", Prisma tried to auto-install');
  console.error('   @prisma/client and could not (offline / restricted / permissions).');
  console.error('   Fix: run `npm install` at the project root on this build machine');
  console.error('   so @prisma/client is present, then retry.');
  console.error('   Underlying error:', err && err.message ? err.message : err);
  process.exit(1);
}

console.log('[generate-prisma] Applying packaging patch…');
runPatch();
console.log('[generate-prisma] Done.');
