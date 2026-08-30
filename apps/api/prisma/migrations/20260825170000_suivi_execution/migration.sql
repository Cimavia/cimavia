-- Suivi d'exécution de l'athlète (#168).
--
-- Purement additif, et NULLABLE à dessein : `NULL` signifie « non suivi », ce qui n'est pas
-- « zéro coché ». Un défaut à `'{}'` effacerait cette distinction sur toutes les séances déjà
-- diffusées — elles seraient toutes marquées « suivies, rien fait », c'est-à-dire exactement le
-- reproche qu'on ne veut jamais adresser à l'athlète.

ALTER TABLE "scheduled_session_exercise" ADD COLUMN "tracking" JSONB;
