-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "orderSn" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "relatedGoodsIds" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_orderSn_idx" ON "Conversation"("orderSn");
