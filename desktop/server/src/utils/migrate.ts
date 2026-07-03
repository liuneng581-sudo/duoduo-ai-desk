/**
 * Runtime migration runner — applies any pending Prisma migrations on every
 * startup, using @prisma/client's $executeRawUnsafe (already bundled). This
 * exists because the packaged Electron app ships NO prisma CLI and NO
 * schema-engine for Windows, so `prisma migrate deploy` can't run in production.
 *
 * Behaviour (idempotent, safe to run every boot):
 *  1. Ensure the _prisma_migrations bookkeeping table exists.
 *  2. Read prisma/migrations/<timestamp>_<name>/migration.sql in lexical order
 *     (Prisma names are timestamp-prefixed, so lexical === chronological).
 *  3. Skip migrations already recorded as applied; for each pending one, run its
 *     statements and record it.
 *
 * A failure here is fatal-by-default to the caller (it throws) — the caller
 * decides whether to block startup. We never silently serve an unmigrated DB.
 */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../config/database';
import logger from './logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

/** Split a migration.sql into individual statements (naive but sufficient for
 *  Prisma-generated SQLite DDL: statements end with ';' at line end, and we
 *  strip line comments). */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runMigrations(): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn('No migrations directory found — skipping migration runner');
    return;
  }

  // 1. Ensure bookkeeping table exists (matches Prisma's schema).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  // 2. Which migrations are already applied?
  const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
  );
  const appliedNames = new Set(applied.map((r) => r.migration_name));

  // 3. Migration folders in chronological (lexical) order.
  const dirs = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let appliedCount = 0;
  for (const name of dirs) {
    if (appliedNames.has(name)) continue;
    const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = splitStatements(sql);
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    logger.info(`Applying migration: ${name} (${statements.length} statements)`);
    // SQLite DDL is auto-committed per statement; run sequentially and record on
    // success. If a statement fails because the column/table already exists
    // (e.g. a DB that was hand-patched before this runner existed), we tolerate
    // it so the migration can still be marked applied and the drift is healed.
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (/already exists|duplicate column/i.test(msg)) {
          logger.warn(`  (tolerated) ${name}: ${msg.split('\n')[0]}`);
          continue;
        }
        throw new Error(`Migration ${name} failed: ${msg}`);
      }
    }

    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
      crypto.randomUUID(), checksum, now, name, now, statements.length,
    );
    appliedCount++;
  }

  if (appliedCount > 0) logger.info(`✅ Applied ${appliedCount} pending migration(s)`);
  else logger.info('✅ Database schema up to date');
}
