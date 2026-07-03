/**
 * Build-time: regenerate the schema-only, EMPTY template database that ships
 * with the installer (server/prisma/template-empty.db).
 *
 * Why this exists: the packaged app has NO Prisma CLI and NO Windows
 * schema-engine bundled, so it cannot run `migrate deploy` at runtime on a
 * fresh install. Instead electron/main.ts copies this pre-migrated empty DB
 * into userData on first run. Users then register through the app — we
 * deliberately do NOT ship the dev DB (which contains a demo admin account).
 *
 * Regenerating here (rather than committing a static file) guarantees the
 * template always matches the current migrations.
 *
 * Run: node scripts/prepare-template-db.js   (invoked by `electron:build`)
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
// prisma is hoisted to root node_modules in this workspace; fall back to server/.
const prismaCli = [
  path.join(rootDir, 'node_modules', 'prisma', 'build', 'index.js'),
  path.join(serverDir, 'node_modules', 'prisma', 'build', 'index.js'),
].find((p) => fs.existsSync(p)) || path.join(rootDir, 'node_modules', 'prisma', 'build', 'index.js');
const templatePath = path.join(serverDir, 'prisma', 'template-empty.db');

if (!fs.existsSync(prismaCli)) {
  console.error('❌ Prisma CLI not found at', prismaCli, '— run npm install in server/ first.');
  process.exit(1);
}

// Start from a clean file so no stale rows survive a re-run.
try { fs.rmSync(templatePath); } catch {}
try { fs.rmSync(templatePath + '-journal'); } catch {}

// Absolute file: URL — relative URLs resolve against CWD and can hit the wrong DB.
const dbUrl = 'file:' + templatePath;
console.log('🗄️  Building empty template DB at', templatePath);

try {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
} catch (err) {
  console.error('\n❌ `prisma migrate deploy` failed while building the template DB.');
  console.error('   This step needs the platform schema-engine binary, which');
  console.error('   `npm install` downloads from Prisma\'s CDN. Common causes:');
  console.error('     • npm install was not run on THIS machine/OS, or');
  console.error('     • the schema-engine download was blocked (offline / proxy / firewall).');
  console.error('   Fix: run `npm install` on the build machine with network access, then retry.');
  console.error('   Underlying error:', err && err.message ? err.message : err);
  process.exit(1);
}

// Sanity: file exists and is non-empty.
const size = fs.existsSync(templatePath) ? fs.statSync(templatePath).size : 0;
if (size === 0) {
  console.error('❌ Template DB is empty/missing after migrate deploy.');
  process.exit(1);
}
console.log(`✅ Template DB ready (${size} bytes).`);
