-- Les métriques maison entrent dans le snapshot de diffusion (#166).
--
-- Purement additif. Aucune reprise : les planifications déjà diffusées repartent d'une liste vide,
-- ce qui est exact — les métriques personnalisées viennent d'être introduites (#162) et aucune
-- planification antérieure n'en cite. Une reprise devrait de toute façon joindre à travers du
-- JSON, pour zéro ligne concernée.

ALTER TABLE "scheduled_session_exercise"
  ADD COLUMN "customMetrics" JSONB NOT NULL DEFAULT '[]';
