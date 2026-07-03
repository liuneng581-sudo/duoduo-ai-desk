-- v1.0.4 schema extension: Product new fields + Store.lastConnectedAt + Announcement model

-- Product: add freight/material/specs/shippingTime/lastSyncedAt
ALTER TABLE "Product" ADD COLUMN "freight" TEXT;
ALTER TABLE "Product" ADD COLUMN "material" TEXT;
ALTER TABLE "Product" ADD COLUMN "specs" TEXT;
ALTER TABLE "Product" ADD COLUMN "shippingTime" TEXT;
ALTER TABLE "Product" ADD COLUMN "lastSyncedAt" DATETIME;

-- Store: add lastConnectedAt
ALTER TABLE "Store" ADD COLUMN "lastConnectedAt" DATETIME;

-- Announcement model
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX "Announcement_active_publishedAt_idx" ON "Announcement"("active", "publishedAt" DESC);
