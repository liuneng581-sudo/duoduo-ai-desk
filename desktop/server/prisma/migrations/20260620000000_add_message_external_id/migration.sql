-- AlterTable
ALTER TABLE "Message" ADD COLUMN "externalMsgId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalMsgId_key" ON "Message"("externalMsgId");

