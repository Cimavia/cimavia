-- Les invitations en attente d'un compte qui ne coache plus passent en retirées (#314).
--
-- Depuis #314, cesser de coacher retire ses invitations en attente, dans la même transaction. Celles
-- émises AVANT par un compte qui a déjà retiré sa capacité coach y ont échappé : acceptées, elles
-- lieraient un athlète à un compte qui n'est plus coach, sans moyen d'en sortir (#213).
--
-- Une révocation, pas une suppression : l'athlète qui ouvrirait encore la carte lit « retirée par
-- le coach » (#524), pas « introuvable ». Rejouée sur une base propre, elle ne touche aucune ligne.
UPDATE "coach_invitation" AS i
SET "status" = 'REVOKED'
FROM "user" AS u
WHERE i."coachId" = u."id"
  AND i."status" = 'PENDING'
  AND u."isCoach" = false;
