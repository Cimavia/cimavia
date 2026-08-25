-- Surcharge de dosage à trois niveaux (#164).
--
-- Écrite à la MAIN et non générée : `prescription` → `note` est un RENOMMAGE, et le diff de
-- Prisma le verrait comme un DROP suivi d'un ADD. Les notes déjà écrites par le coach seraient
-- perdues sans que rien ne le signale.

-- ── Niveau 2 : la séance-type ───────────────────────────────────────────────────────────────

ALTER TABLE "session_exercise" RENAME COLUMN "prescription" TO "note";
ALTER TABLE "session_exercise"
  ADD COLUMN "blocks"      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "baseline"    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "adjustments" JSONB NOT NULL DEFAULT '[]';

-- Reprise : une composition existante n'a jamais rien copié — elle référençait l'exercice et
-- lisait son dosage à la volée. Sans cette copie, toutes les séances déjà composées afficheraient
-- une grille VIDE après le déploiement.
--
-- `blocks` ET `baseline` reçoivent la même valeur : la séance part du défaut, sans aucun
-- ajustement, ce qui est exactement l'état d'une composition d'avant #164.
UPDATE "session_exercise" se
SET "blocks" = e."blocks", "baseline" = e."blocks"
FROM "exercise" e
WHERE e."id" = se."exerciseId";

-- ── Niveau 3 : la séance planifiée ──────────────────────────────────────────────────────────

ALTER TABLE "scheduled_session_exercise" RENAME COLUMN "prescription" TO "note";
ALTER TABLE "scheduled_session_exercise"
  ADD COLUMN "baseline"    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "adjustments" JSONB NOT NULL DEFAULT '[]';

-- `blocks` est déjà rempli depuis #162 (snapshot de diffusion) : la référence du niveau 3 est
-- donc ce que l'athlète a déjà sous les yeux, et non le contenu actuel de la bibliothèque.
UPDATE "scheduled_session_exercise" SET "baseline" = "blocks";
