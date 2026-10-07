-- L'entreprise ajoute des Coachs à son équipe (#601).
--
-- Une invitation peut désormais venir d'une entreprise, et proposer de devenir Coach plutôt
-- qu'athlète. Une table, pas une table sœur : `SignupPolicy` compte les invitations en cours à une
-- adresse, quel que soit l'émetteur, sans changer de logique.
--
-- Prisma ne modélise pas les CHECK : les deux ci-dessous ne se lisent QUE dans les migrations,
-- comme `user_company_exclusive` (#600).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ORGANIZATION_INVITATION_RECEIVED';

-- CreateEnum
CREATE TYPE "InvitationRole" AS ENUM ('ATHLETE', 'COACH');

-- 1. Celui qui accepte n'est plus forcément un athlète. Un renommage, pas une colonne neuve : la
--    trace des invitations déjà acceptées (#146) reste en place.
ALTER TABLE "coach_invitation" RENAME COLUMN "acceptedByAthleteId" TO "acceptedById";
ALTER TABLE "coach_invitation" RENAME CONSTRAINT "coach_invitation_acceptedByAthleteId_fkey" TO "coach_invitation_acceptedById_fkey";

-- 2. Le second émetteur, et le rôle proposé. Toutes les lignes existantes viennent d'un Coach et
--    proposent de devenir athlète : le défaut `ATHLETE` les décrit telles qu'elles sont.
ALTER TABLE "coach_invitation" ALTER COLUMN "coachId" DROP NOT NULL;
ALTER TABLE "coach_invitation" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "coach_invitation" ADD COLUMN "role" "InvitationRole" NOT NULL DEFAULT 'ATHLETE';

-- 3. Les verrous. Exactement un émetteur : une invitation sans émetteur n'aurait personne à
--    rejoindre, une invitation à deux émetteurs ne dirait pas lequel. Et une invitation de Coach
--    n'est émise que par une entreprise — un Coach n'en recrute pas un autre.
ALTER TABLE "coach_invitation"
  ADD CONSTRAINT "invitation_single_issuer" CHECK (num_nonnulls("coachId", "organizationId") = 1);
ALTER TABLE "coach_invitation"
  ADD CONSTRAINT "invitation_coach_by_organization" CHECK ("role" <> 'COACH' OR "organizationId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "coach_invitation_organizationId_idx" ON "coach_invitation"("organizationId");

-- AddForeignKey
ALTER TABLE "coach_invitation" ADD CONSTRAINT "coach_invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "organization_coach" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_coach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_coach_coachId_idx" ON "organization_coach"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_coach_organizationId_coachId_key" ON "organization_coach"("organizationId", "coachId");

-- AddForeignKey
ALTER TABLE "organization_coach" ADD CONSTRAINT "organization_coach_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_coach" ADD CONSTRAINT "organization_coach_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
