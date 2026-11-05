-- Le rôle « lecture seule » est remplacé par le portail parent
ALTER TYPE "Role" RENAME VALUE 'LECTURE' TO 'PARENT';

-- Compte parent relié à un tuteur
ALTER TABLE "User" ADD COLUMN "guardianId" TEXT;
CREATE UNIQUE INDEX "User_guardianId_key" ON "User"("guardianId");
ALTER TABLE "User" ADD CONSTRAINT "User_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reçu de rémunération numéroté
ALTER TABLE "TeacherPay" ADD COLUMN "receiptNo" TEXT;
CREATE UNIQUE INDEX "TeacherPay_receiptNo_key" ON "TeacherPay"("receiptNo");
