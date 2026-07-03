import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// SQLite concurrency tuning. The app runs many stores + concurrent customer-message
// handlers against one SQLite file; the default journal mode + zero busy timeout
// makes concurrent writers throw SQLITE_BUSY ("database is locked") immediately,
// which would bubble up and drop a customer reply. WAL lets readers and one writer
// proceed in parallel, and busy_timeout makes a contending writer wait-and-retry
// (up to 5s) instead of failing. Best-effort: applied once at startup; a failure
// here is non-fatal (we just run with defaults).
(async () => {
  try {
    // PRAGMAs that SET-and-return a value (journal_mode, busy_timeout) emit a row,
    // so they must use queryRaw — $executeRawUnsafe rejects result rows. synchronous
    // returns nothing, so executeRaw is fine for it.
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
    await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  } catch {
    /* non-fatal — fall back to SQLite defaults */
  }
})();

export default prisma;

