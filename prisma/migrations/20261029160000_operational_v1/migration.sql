-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('DEVOIR', 'TEST', 'EXAMEN_BLANC', 'ORAL');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'RESPONSABLE', 'COMPTABLE', 'ENSEIGNANT', 'LECTURE');
-- DIRECTION et SECRETARIAT deviennent RESPONSABLE (responsable administratif)
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text WHEN 'DIRECTION' THEN 'RESPONSABLE' WHEN 'SECRETARIAT' THEN 'RESPONSABLE' ELSE "role"::text END
)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "StudentStatus_new" AS ENUM ('PREINSCRIT', 'ACTIF', 'SUSPENDU', 'ARCHIVE');
ALTER TABLE "public"."Student" ALTER COLUMN "status" DROP DEFAULT;
-- PARTI devient ARCHIVE
ALTER TABLE "Student" ALTER COLUMN "status" TYPE "StudentStatus_new" USING (
  CASE "status"::text WHEN 'PARTI' THEN 'ARCHIVE' ELSE "status"::text END
)::"StudentStatus_new";
ALTER TYPE "StudentStatus" RENAME TO "StudentStatus_old";
ALTER TYPE "StudentStatus_new" RENAME TO "StudentStatus";
DROP TYPE "public"."StudentStatus_old";
ALTER TABLE "Student" ALTER COLUMN "status" SET DEFAULT 'ACTIF';
COMMIT;

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "kind" "AssessmentKind" NOT NULL DEFAULT 'DEVOIR',
ADD COLUMN     "term" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "baseFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountTypeId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "className" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TeacherCycle" (
    "teacherId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,

    CONSTRAINT "TeacherCycle_pkey" PRIMARY KEY ("teacherId","cycleId")
);

-- CreateTable
CREATE TABLE "TeacherAvailability" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "TeacherAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiscountType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAvailability_teacherId_idx" ON "TeacherAvailability"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountType_name_key" ON "DiscountType"("name");

-- AddForeignKey
ALTER TABLE "TeacherCycle" ADD CONSTRAINT "TeacherCycle_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCycle" ADD CONSTRAINT "TeacherCycle_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAvailability" ADD CONSTRAINT "TeacherAvailability_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_discountTypeId_fkey" FOREIGN KEY ("discountTypeId") REFERENCES "DiscountType"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reprise : tarif de base = tarif appliqué pour les inscriptions existantes
UPDATE "Enrollment" SET "baseFee" = "monthlyFee" WHERE "baseFee" = 0;
