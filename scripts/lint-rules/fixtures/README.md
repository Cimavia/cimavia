# Banc des règles Biome maison

Chaque fichier est linté par `pnpm check:lint-rules` avec la config du dépôt, à son chemin relatif :
les `includes` de chaque plugin s'appliquent comme sur le vrai code. **Une ligne qui porte
`✗ <règle>` doit être signalée par cette règle ; rien d'autre ne doit l'être.** Le dossier est
exclu de `biome ci`.
