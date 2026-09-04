---
name: review
description: Revue de qualité de TOUT le code du monorepo cimavia (pas du diff) — règles dures, architecture, bugs, duplication, sécurité, couverture, dette. Mesure d'abord, découpe le dépôt en lots, rend des constats vérifiés et classés. À utiliser dès qu'on demande un audit global, une revue de code du monorepo, une chasse aux bugs / duplications / failles, ou « qu'est-ce qui fait baisser la qualité ».
---

# Revue du monorepo

Auditer le code **déjà là**. Ce n'est pas `/code-review` (qui relit le diff en cours) : ici on relit
l'existant, y compris ce qui est vert en CI depuis six mois. Ce fichier dit quoi lancer, dans quel
ordre, et sous quelle forme rendre. **Il ne contient aucune règle projet** — elles vivent dans les
docs.

Portée : `/review` = tout le dépôt. `/review api`, `/review web`, `/review shared`,
`/review sécurité` = un sous-ensemble ; la mécanique reste la même, seuls les lots du §2 changent.

## Règles d'or

1. **On constate, on ne répare pas.** Aucune modification de code pendant une revue, même
   « évidente » : une revue qui corrige au fil de l'eau produit un diff que personne ne relit. Les
   corrections se planifient après, et sont validées par Le développeur.
2. **Un constat non vérifié n'est pas un constat.** Ouvrir le fichier, lire autour, chercher le
   test qui couvre peut-être déjà le cas, vérifier que l'appelant existe vraiment. Douze constats
   vrais valent mieux que quarante dont quinze sont faux : c'est le taux de faux positifs qui
   décide si la prochaine revue sera lue.
3. **Les outils d'abord, la lecture ensuite.** Ce que Biome, `tsc`, Vitest et Sonar trouvent déjà
   ne se re-cherche pas à la main. La lecture sert à trouver ce qu'aucun d'eux ne voit.
4. **Les références sont celles du dépôt** : `CLAUDE.md` (les 7 règles dures, la porte qualité),
   `docs/architecture-choice.md`, `docs/CONTEXT.cimavia.md`, `docs/dette-technique.md`. Un écart
   **déjà consigné** comme dette assumée n'est pas un constat neuf — le citer comme tel, avec sa
   ligne de journal.
5. **Je ne lance ni git ni les interfaces web** (GitHub, Sonar, Scaleway, Neon). Je les liste.

## 1. Passe machine — avant de lire une ligne

Ces sorties sont le socle du rapport, et elles cadrent le §2 : là où Sonar est **muet ou aveugle**
(fichiers exclus, couverture à 0, code que la gate ne mord pas), c'est là qu'il faut aller lire.

```bash
# La porte qualité (CLAUDE.md). Elle échoue déjà ? C'est le premier constat du rapport.
pnpm biome ci .
pnpm turbo typecheck test
pnpm check:i18n --strict          # --strict : clés mortes comprises

# SonarCloud — projet public, aucun token nécessaire
curl -s "https://sonarcloud.io/api/measures/component?component=cimavia&metricKeys=ncloc,coverage,duplicated_lines_density,bugs,vulnerabilities,security_hotspots,code_smells,sqale_index,cognitive_complexity"
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=cimavia&resolved=false&ps=100&facets=rules,severities,types"
curl -s "https://sonarcloud.io/api/hotspots/search?projectKey=cimavia&status=TO_REVIEW"
curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=cimavia"

# Angles morts de couverture : les fichiers à 0 % dans les lcov lus par Sonar
grep -h '^SF:' apps/*/coverage*/lcov.info packages/*/coverage/lcov.info
```

Puis les marqueurs que le dépôt s'est donnés, et ceux qu'aucun outil ne classe :

```bash
# `g` = les greps de code du dépôt : sans ces exclusions, node_modules et le client Prisma
# généré noient le signal sous des milliers de lignes.
g() { grep -rnE "$1" apps packages --include='*.ts' --include='*.tsx' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated \
        --exclude-dir=.expo --exclude='routeTree.gen.ts'; }

g "MOCKED"                                    # convention §11 de architecture-choice.md
g "TODO|FIXME|@ts-ignore|@ts-expect-error|biome-ignore"
g "\bas any\b|as unknown as|!\."             # échappatoires de typage
g "#[0-9a-fA-F]{6}"                           # règle dure n°3 — doit sortir vide hors tokens
```

Ne pas recopier ces sorties dans le rapport : les **compter**, et n'en citer que ce qui devient un
constat.

## 2. Découper en lots

Le dépôt fait ~58 000 lignes de TS/TSX : aucune revue sérieuse ne tient en une passe, et une passe
unique produit une bouillie générique. Re-mesurer (les tailles bougent), puis découper en lots de
**4 à 6 k lignes** :

```bash
for d in apps/api/src/*/ apps/web/src/feature/*/ apps/web/src/shared/ \
         apps/mobile/feature/*/ apps/mobile/shared/ packages/shared/src/*/; do
  echo "$(find "$d" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l) $d"
done | sort -rn
```

**Un lot = un sous-agent `general-purpose`**, lancé en parallèle par 4 à 6 maximum — au-delà, les
rendus arrivent plus vite qu'ils ne sont relus. Chaque agent reçoit : le chemin du lot, la grille
§3, le format §5, la règle d'or n°2, et l'ordre de rendre **au plus 10 constats classés**.

Gabarit de prompt d'agent :

> Revue de qualité du lot `<chemin>` du monorepo cimavia. Lis d'abord `CLAUDE.md` (7 règles dures)
> et `docs/architecture-choice.md`. Ne modifie AUCUN fichier. Pour chaque constat : ouvre le
> fichier, lis le contexte, cherche le test qui le couvre peut-être déjà, et vérifie qu'il n'est pas
> déjà consigné dans `docs/dette-technique.md` — sinon ne le rapporte pas. Cherche : <grille §3>.
> Rends au plus 10 constats au format `[S<n>] <fichier>:<ligne> — <titre>` + Constat / Pourquoi /
> Piste. Dis explicitement ce que tu n'as pas pu vérifier.

**Deux lots restent à ma charge, pas à celle d'un sous-agent** — ils exigent de voir tout le dépôt
en même temps, ce qu'un agent cantonné à un dossier ne peut pas faire :

- **duplication inter-paquets** : web ↔ mobile ↔ `@cmv/shared` (c'est là que vit la vraie
  duplication, celle que Sonar compte mal parce qu'elle est reformulée) ;
- **cohérence des contrats** `@cmv/shared` ↔ appelants : un DTO changé d'un côté, l'autre app qui
  suit encore l'ancienne forme, un type exporté que plus personne n'importe.

## 3. Grille — ce qu'on cherche

| Axe | Ce qui compte comme constat |
|---|---|
| **Règles dures** (`CLAUDE.md`) | requête non scopée au tenant · type métier dupliqué hors `@cmv/shared` · `#xxxxxx` hors tokens · logique dans `apps/mobile/app/` · fallback `0`/`""` là où `null` veut dire « indisponible » · string UI en dur · média stocké en base |
| **Bugs** | `null`/`undefined` non gardé sur un chemin réel · `await` manquant · promesse non attendue · état React dérivé d'un rendu précédent · dépendances de hook fausses (au-delà de ce que Biome voit) · erreur avalée en `catch` vide · comparaison de dates sans fuseau · `parseInt` sans base, arrondi monétaire |
| **Duplication** | même logique métier écrite deux fois (web ET mobile) alors que `@cmv/shared` existe · composant `Cmv*` recopié plutôt que réutilisé · requête Prisma quasi identique dans deux services · schéma Zod jumeau |
| **Sécurité** | route sans guard de tenancy ni test e2e d'isolation · entrée non validée par Zod · URL signée trop longue ou trop large · secret en dur, `.env` versionné, secret étendu dans un `run:` de workflow · action GitHub non épinglée · conteneur en root · CORS/headers permissifs · log qui recrache un token ou une donnée personnelle |
| **Tests** | fichier de production à 0 % de couverture · test qui n'assertionne rien · `beforeAll` dont l'échec saute la suite en silence · e2e d'isolation manquant sur une route neuve |
| **Architecture** | module qui contourne `app.setup.ts` · accès Prisma hors du service qui le porte · import croisé entre features · fichier > 400 lignes ou fonction au-delà de la complexité 15 que Biome n'a pas vue (paquet non linté) |
| **Dette & docs** | `MOCKED` sans phase de raccrochage · dette réelle absente de `docs/dette-technique.md` · ligne de journal qui ment sur l'état du code |

## 4. Ce qui n'est PAS un constat

À écarter avant de rédiger — ce sont eux qui font qu'un rapport n'est plus lu :

- une préférence de style que Biome ne signale pas ;
- une dette **déjà consignée** avec son déclencheur (la citer une fois en annexe, pas la re-plaider) ;
- « on pourrait extraire ceci » sans **deuxième appelant réel** ;
- une couverture manquante sur un fichier exclu **symétriquement** (Vitest + Sonar) ;
- la reprise d'une issue Sonar déjà ouverte : les compter par règle, en citer les trois plus
  parlantes, pas les cinquante ;
- un « risque » qu'on ne sait pas déclencher. Si aucun scénario concret ne le produit, il tombe.

## 5. Format de rendu

Un constat :

```
[S2] apps/api/src/plan/plan.service.ts:118 — la requête ignore le scope tenant
  Constat : findMany sans clause coachId, hors extension Prisma.
  Pourquoi : règle dure n°1 — un coach peut lire le plan d'un autre.
  Piste   : passer par le client scopé ; ajouter l'e2e d'isolation manquant.
```

Sévérités : **S1** bug ou faille qui mord en prod · **S2** écart à une règle dure, ou risque de
régression · **S3** qualité (duplication, complexité, couverture, dette non consignée) · **S4**
confort.

Le rendu complet va dans un **fichier du scratchpad** (`revue-<date>.md`). En terminal : la synthèse
chiffrée (état de la porte, métriques Sonar, nombre de lots), **tous les S1 et S2**, le compte des
S3/S4, puis **ce que je n'ai pas pu vérifier**. Cette dernière section n'est jamais vide — dire
qu'on n'a pas pu lancer les e2e, ou qu'un lot n'a pas été couvert, vaut mieux que de le taire.

## 6. Suites

- **Rien n'est corrigé dans la foulée sans accord.** Proposer un ordre de traitement : ce qui se
  règle en un commit, ce qui demande une issue, ce qui n'a pas de déclencheur et attend.
- S1/S2 → issues (skill `issue`) ; raccourci assumé → ligne dans `docs/dette-technique.md`.
- Un constat qui **contredit un encadré « Tranché en #N »** ne devient pas une issue : il se
  remonte comme une contradiction, à trancher par Le développeur.
- Les corrections retenues repartent par le skill `feature` — commits atomiques, relus un par un.
