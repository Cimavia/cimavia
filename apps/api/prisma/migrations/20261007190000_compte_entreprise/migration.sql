-- Compte Entreprise (#600) : une troisième capacité, EXCLUSIVE des deux autres, et l'entreprise
-- qu'elle ouvre.
--
-- Prisma ne modélise pas les CHECK : celui-ci ne se lit QUE dans les migrations, comme
-- `coach_athlete_not_self` (#11) et `conversation_not_self` (#316).

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isCompany" BOOLEAN NOT NULL DEFAULT false;

-- Le verrou : une entreprise ne coache ni ne s'entraîne. `create.before` refuse déjà le cumul à
-- l'inscription (400) et `PATCH /me/capabilities` le refuse ensuite (403) ; ce CHECK survit au
-- prochain chemin qui oublierait les deux. Aucune ligne existante ne le viole : la colonne naît
-- à `false` partout.
ALTER TABLE "user"
  ADD CONSTRAINT "user_company_exclusive" CHECK (NOT ("isCompany" AND ("isCoach" OR "isAthlete")));

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_id_fkey" FOREIGN KEY ("id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
