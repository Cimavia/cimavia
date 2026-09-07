-- Preuve de possession de l'appareil à l'enregistrement d'un token push (#90, dette P4-3).
--
-- Le token Expo est une ADRESSE de livraison, pas un secret : qui la connaissait pouvait la
-- réenregistrer sur son propre compte et priver son propriétaire de ses notifications. La colonne
-- porte l'empreinte d'un secret d'installation, que l'api émet et que le téléphone conserve — la
-- réaffectation n'est désormais accordée qu'à qui peut le présenter.
--
-- NULLABLE, et c'est le point délicat : toutes les lignes déjà en base sont dans ce cas, et aucune
-- ne peut prouver quoi que ce soit. Les refuser condamnerait les appareils de la bêta. Une ligne
-- sans empreinte est donc ADOPTÉE au premier enregistrement, qui la scelle du même geste ;
-- `usePushToken` réenregistrant à chaque montage, la fenêtre se referme dès la première ouverture
-- de l'app à jour. Pas de valeur par défaut : une chaîne vide se serait présentée comme une
-- empreinte que personne ne peut produire, donc comme un verrou définitif déguisé.

ALTER TABLE "push_token" ADD COLUMN "installationSecretHash" TEXT;
