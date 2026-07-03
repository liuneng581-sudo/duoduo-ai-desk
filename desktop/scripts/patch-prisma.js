/**
 * Patch Prisma client for Windows packaging.
 *
 * The packaged server runs from extraResources, so keep Prisma's generated
 * client as normal files and avoid entrypoints that reference a dot-prefixed
 * .prisma directory. Run this after every `prisma generate`.
 */
const fs = require('fs');
const path = require('path');

const PATCHED_ENTRYPOINT_SUFFIXES = ['.js', '.cjs', '.mjs', '.ts', '.d.ts'];

function patchEntrypoint(filePath) {
  const before = fs.readFileSync(filePath, 'utf8');
  const after = before.replace(/(['"`])(?:\.\/)?\.prisma\/client\//g, '$1./_prisma/client/');

  if (after !== before) {
    fs.writeFileSync(filePath, after);
    console.log('[patch-prisma] Patched', filePath);
  }
}

function patchPrismaClient(nodeModulesDir) {
  const prismaClientDir = path.join(nodeModulesDir, '@prisma', 'client');
  const targetPrisma = path.join(prismaClientDir, '_prisma');

  // Step 1: Collect all .prisma sources and merge them into @prisma/client/_prisma
  const sources = [];
  const topLevelDotPrisma = path.join(nodeModulesDir, '.prisma');
  const nestedDotPrisma = path.join(prismaClientDir, '.prisma');

  if (fs.existsSync(topLevelDotPrisma)) sources.push(topLevelDotPrisma);
  if (fs.existsSync(nestedDotPrisma)) sources.push(nestedDotPrisma);

  if (sources.length === 0) {
    // No standard-layout .prisma to move. Either this dir has no client, or it
    // was already patched on a previous run. If a patched client (_prisma) is
    // present, re-assert the entrypoint rewrite so the skip path still leaves a
    // fully-patched, packageable client (idempotent). Otherwise nothing to do.
    if (fs.existsSync(targetPrisma) && fs.existsSync(prismaClientDir)) {
      console.log('[patch-prisma] Already patched, re-asserting entrypoints:', nodeModulesDir);
      for (const entry of fs.readdirSync(prismaClientDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!PATCHED_ENTRYPOINT_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
        patchEntrypoint(path.join(prismaClientDir, entry.name));
      }
    } else {
      console.log('[patch-prisma] No .prisma found anywhere, skipping:', nodeModulesDir);
    }
    return;
  }

  // Remove target if it exists (leftover from previous run)
  if (fs.existsSync(targetPrisma)) {
    fs.rmSync(targetPrisma, { recursive: true, force: true });
  }

  // Merge all .prisma sources into @prisma/client/_prisma
  // (top-level .prisma contains the query engine, nested .prisma has the wrappers)
  for (const src of sources) {
    copyDir(src, targetPrisma);
    fs.rmSync(src, { recursive: true, force: true });
    console.log('[patch-prisma] Moved', src, '->', targetPrisma);
  }

  // Step 2: Patch entrypoints in @prisma/client to reference ./_prisma/
  if (fs.existsSync(prismaClientDir)) {
    for (const entry of fs.readdirSync(prismaClientDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!PATCHED_ENTRYPOINT_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
      patchEntrypoint(path.join(prismaClientDir, entry.name));
    }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rootNM = path.resolve(__dirname, '..', 'node_modules');
const serverNM = path.resolve(__dirname, '..', 'server', 'node_modules');

if (fs.existsSync(rootNM)) patchPrismaClient(rootNM);
if (fs.existsSync(serverNM)) patchPrismaClient(serverNM);

console.log('[patch-prisma] Done');
