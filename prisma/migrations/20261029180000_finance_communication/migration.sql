-- CreateEnum
CREATE TYPE "PaymentPlan" AS ENUM ('MENSUEL', 'TRIMESTRIEL', 'ANNUEL');

-- CreateEnum
CREATE TYPE "TeacherPayStatus" AS ENUM ('BROUILLON', 'VALIDE', 'PAYE', 'ANNULE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NOUVEL_INSCRIT', 'PAIEMENT', 'ABSENCE', 'ECHEANCE', 'RETARD', 'JUSTIFICATIF', 'SYSTEME');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('NOUVELLE', 'LUE', 'TRAITEE');

-- CreateEnum
CREATE TYPE "MessageAudience" AS ENUM ('PARENT', 'ENSEIGNANT');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('MANUEL', 'SMS', 'WHATSAPP_API', 'EMAIL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PREPARE', 'ENVOYE', 'ANNULE', 'ECHEC');

-- AlterEnum
ALTER TYPE "PayMode" ADD VALUE 'PAR_SEANCE';

-- DropIndex
DROP INDEX "Invoice_enrollmentId_period_key";

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "plan" "PaymentPlan" NOT NULL DEFAULT 'MENSUEL';

-- CreateTable
CREATE TABLE "PaymentMode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiresReference" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentMode_pkey" PRIMARY KEY ("id")
);

-- Moyens de paiement par défaut (reprise de l'ancienne énumération PaymentMethod)
INSERT INTO "PaymentMode" ("id", "code", "label", "requiresReference", "order") VALUES
  ('mode_especes', 'ESPECES', 'Espèces', false, 1),
  ('mode_cheque', 'CHEQUE', 'Chèque', true, 2),
  ('mode_virement', 'VIREMENT', 'Virement bancaire', true, 3),
  ('mode_d17', 'D17', 'D17 / e-Dinar', true, 4);

-- Paiements : method (enum) → modeId (table configurable), sans perte de données
ALTER TABLE "Payment" ADD COLUMN "correctsId" TEXT, ADD COLUMN "modeId" TEXT;
UPDATE "Payment" SET "modeId" = 'mode_' || lower("method"::text);
ALTER TABLE "Payment" ALTER COLUMN "modeId" SET NOT NULL, DROP COLUMN "method";

-- Dépenses : idem + annulation, correction, référence, lien paie
ALTER TABLE "Expense"
  ADD COLUMN "cancelReason" TEXT, ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "correctsId" TEXT,
  ADD COLUMN "modeId" TEXT, ADD COLUMN "reference" TEXT, ADD COLUMN "teacherPayId" TEXT;
UPDATE "Expense" SET "modeId" = 'mode_' || lower("method"::text);
ALTER TABLE "Expense" ALTER COLUMN "modeId" SET NOT NULL, DROP COLUMN "method";

DROP TYPE "PaymentMethod";


-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 1;


-- CreateTable
CREATE TABLE "FeeRule" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "cycleId" TEXT,
    "levelId" TEXT,
    "subjectId" TEXT,
    "monthlyFee" INTEGER NOT NULL,
    "registrationFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPay" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "payMode" "PayMode" NOT NULL,
    "rate" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "computedAmount" INTEGER NOT NULL,
    "adjustment" INTEGER NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT,
    "amount" INTEGER NOT NULL,
    "details" JSONB,
    "status" "TeacherPayStatus" NOT NULL DEFAULT 'BROUILLON',
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "modeId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "permission" TEXT NOT NULL,
    "teacherId" TEXT,
    "dedupeKey" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'NOUVELLE',
    "readAt" TIMESTAMP(3),
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "handledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "MessageAudience" NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "templateId" TEXT,
    "audience" "MessageAudience" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'MANUEL',
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "studentId" TEXT,
    "guardianId" TEXT,
    "teacherId" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PREPARE',
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeRule_schoolYearId_idx" ON "FeeRule"("schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMode_code_key" ON "PaymentMode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAttachment_storedName_key" ON "ExpenseAttachment"("storedName");

-- CreateIndex
CREATE INDEX "TeacherPay_teacherId_period_idx" ON "TeacherPay"("teacherId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_code_key" ON "MessageTemplate"("code");

-- CreateIndex
CREATE INDEX "Message_batchId_idx" ON "Message"("batchId");

-- CreateIndex
CREATE INDEX "Message_status_createdAt_idx" ON "Message"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_correctsId_key" ON "Expense"("correctsId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_teacherPayId_key" ON "Expense"("teacherPayId");

-- CreateIndex
CREATE INDEX "Invoice_enrollmentId_period_idx" ON "Invoice"("enrollmentId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_correctsId_key" ON "Payment"("correctsId");

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "PaymentMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "PaymentMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_teacherPayId_fkey" FOREIGN KEY ("teacherPayId") REFERENCES "TeacherPay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPay" ADD CONSTRAINT "TeacherPay_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPay" ADD CONSTRAINT "TeacherPay_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "PaymentMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

