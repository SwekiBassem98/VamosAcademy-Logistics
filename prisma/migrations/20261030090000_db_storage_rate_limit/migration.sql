-- CreateTable
CREATE TABLE "AttachmentContent" (
    "attachmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "AttachmentContent_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "AttachmentContent" ADD CONSTRAINT "AttachmentContent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ExpenseAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

