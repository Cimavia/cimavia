# Dette technique — Séances et exercices

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P2 — Exercices & Séances

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P2-1 | **Objets orphelins en object storage** : upload réussi mais `POST /documents` échoué → fichier dans le bucket sans ligne en base. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |
| P2-2 | **Pas de pagination** sur `GET /exercises` et `GET /sessions` : tout est renvoyé. | 🟢 | [#79](https://github.com/Cimavia/cimavia/issues/79) |
| P2-4 | **`crypto.randomUUID()` pour la clé objet**, alors que les `id` de tables sont des `cuid`. | 🟢 | — *(incohérence assumée, déclencheur : aucun)* |
| P2-5 | **Suppression d'un document : pas de rollback**. L'objet S3 part **avant** la ligne — ordre choisi volontairement. | 🟢 | [#75](https://github.com/Cimavia/cimavia/issues/75) |

*Résolues, à l'[archive](archive.md) : P2-3.*

---

## Post-MVP — Refonte du modèle d'exercice ([#157](https://github.com/Cimavia/cimavia/issues/157))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| EX-1 | **`description` survit à côté d'`instructions`** : phase *expand* d'un expand/migrate/contract. Deux sources pour la même consigne tant que le constructeur n'écrit pas la version structurée — l'API alimente les deux, et rien n'empêche qu'elles divergent. La moitié `category` → `tags` est **close** (#163, migration `20260824120000_retrait_categorie_exercice`). *Nommée **R-1** avant [#624](https://github.com/Cimavia/cimavia/issues/624), comme une dette des rappels — la migration `20260824070000_reprise_descriptions_en_consigne` la cite encore sous ce nom.* | 🟡 | [#163](https://github.com/Cimavia/cimavia/issues/163) *(le contract est sa dernière étape)* |
| EX-2 | **`customMetricId` n'est pas une clé étrangère** : les blocs vivent en JSON, la référence y est un simple identifiant. Supprimer une métrique maison laisse une colonne orpheline dans les exercices qui l'employaient. *Nommée **R-2** avant [#624](https://github.com/Cimavia/cimavia/issues/624).* | 🟢 | — *(`validateBlockValues` la signale au coach ; le nettoyage en masse attend un besoin réel)* |

> **Tranché — les blocs en JSON, pas en tables.** Quatre tables (bloc / métrique / ligne / valeur)
> donnaient l'intégrité référentielle sur `customMetricId` et des cellules interrogeables en SQL.
> Aucune des deux ne sert : rien ne filtre sur une valeur de cellule, et la valeur est polymorphe
> (nombre · durée · texte · échelle), donc finit en colonne typée ou en JSON de toute façon. Ce qui
> départage, c'est le **snapshot de diffusion** (P3) : en JSON c'est la copie d'un champ, en
> relationnel c'est quatre SELECT/INSERT imbriqués avec remapping des identifiants de colonnes
> dans chaque ligne — soit exactement l'endroit où une planif diffusée se dégrade en silence. Le
> contrat est tenu par `exerciseBlocksSchema` à l'entrée. Coût accepté : **EX-2**.
>
> **Tranché — aucun rattrapage des descriptions.** `description → instructions` touche tous les
> exercices existants. La base en contient 7, dont 4 avec description, d'une longueur moyenne de
> **10 caractères** (« a », « z »), plus 2 prescriptions (« 1kg », « 2kg ») : ce sont des données
> de test. Chaque `description` non nulle devient **un unique bloc paragraphe**, sans parsing ni
> rapport de reprise. Le `down` restitue le texte brut par concaténation
> (`richDocumentToPlainText`). À reconsidérer **uniquement** si la refonte est livrée après une
> mise en production réelle.
>
> **Écarts assumés avec la maquette du constructeur** (tranchés en recette, #163) :
>
> - **Les raccourcis « Pyramide » et « Intervalles » sont retirés.** Ils ne préremplissaient qu'un
>   bandeau de Séries, et le seul geste qu'ils promettaient vraiment — les paliers en miroir —
>   vit dans le menu de colonne, accessible depuis n'importe quelle Séries. Deux entrées de moins
>   à l'écran pour zéro perte.
> - **L'image de consigne a trois largeurs** (petite · moyenne · pleine), là où la frame 13 disait
>   « pleine largeur, jamais habillée de texte ». Trois paliers et non une valeur libre : un
>   pourcentage dépendrait de l'écran où l'image a été posée, et React Native devrait l'interpréter
>   au pixel près. **#166 doit rendre les trois**, sinon les deux surfaces divergent.
> - **« Dupliquer en variante » n'existe que depuis le constructeur de SÉANCE.** L'entrée de la
>   frame 14, dans l'éditeur d'exercice, n'est pas implémentée : absente de la liste « À faire » de
>   l'issue, donc laissée de côté plutôt qu'ajoutée d'autorité. Le geste de la séance, lui, est
>   arrivé avec le constructeur de séance, et copie côté serveur depuis
>   [#315](https://github.com/Cimavia/cimavia/issues/315). *Depuis
>   [#609](https://github.com/Cimavia/cimavia/issues/609), l'éditeur d'exercice l'offre pour
>   l'exercice d'un autre Coach (voir le journal, comptes et tenancy).*
> - **`2:75` vaut `3'15` au lieu d'être refusé.** Les secondes au-delà de 59 débordent sur les
>   minutes. Le refus protégeait mieux de la faute de frappe, mais le rendu canonique montre
>   aussitôt ce qui a été compris — ce qui la rattrape sans bloquer la saisie.
> - **Les unités ne s'accordent pas** : « 1 répétitions ». Chaque libellé d'unité devrait passer en
>   clé plurielle dans les deux catalogues ; non fait, non demandé.
>
> **Trois pièges de CSS payés cash** (le même, trois fois) : sur un élément qui porte déjà `border`
> ou `bg-*`, un utilitaire Tailwind de la MÊME propriété a la même spécificité — c'est l'ordre du
> fichier CSS qui tranche, pas l'ordre où on écrit les classes. Un repère de dépôt en `border-t-2`,
> puis en `outline`, s'est fait écraser sans que rien ne le signale. La forme qui tient : le hook
> rend un ÉTAT (`isOver`), et chaque appelant choisit **un seul** fond. Même famille : `uppercase`
> posé sur une ligne d'en-tête remonte dans tout ce qu'elle contient, menu flottant compris.
>
> **Découvert en route** : `pnpm turbo lint` ne voit pas `packages/shared` — seuls `api`, `web` et
> `mobile` ont un script `lint`. Une fonction à complexité cognitive 22 (max 15, niveau `error`)
> est passée sous le radar jusqu'au `biome ci` complet. La porte réelle est
> `pnpm exec biome ci . && pnpm turbo typecheck test && pnpm check:i18n`.

> **Le replace-all d'une séance planifiée efface tout ce que le client n'émet pas.** Découvert en
> recette : le panneau du coach n'envoyait que `sourceExerciseId`, `title`, `description`, `tags`
> et `note` — chaque enregistrement d'une séance diffusée VIDAIT donc consigne, dosage, métriques
> maison et ajustements, sans le moindre signal. Le panneau date d'avant le modèle structuré et
> n'a été mis à jour ni en #162 ni en #164. Deux correctifs, l'un ne suffisant pas : le client
> renvoie l'intégralité du snapshot, et le serveur reporte par `id` ce qui ne transite JAMAIS par
> lui — le **suivi d'exécution**, qui appartient à l'athlète. Verrouillé par deux e2e vérifiés
> rouges avant correctif.
>
> **Incomplet, corrigé en #296/#311** : ce report ne sauvait que le suivi **déjà en base**. Les
> lignes étaient recréées sous un **nouvel** `id`, alors que l'athlète coche en local contre
> l'ancien : ses coches non encore débriefées retombaient sur une ligne disparue, et le débrief
> répondait 200 sans rien écrire. Les documents étaient recréés eux aussi, depuis la bibliothèque,
> et les images de la consigne ne désignaient plus rien. Voir l'encadré suivant.

> **Tranché en #296** (l'édition d'une séance planifiée garde l'identité de ses lignes) : une ligne
> citée par son `id` est **mise à jour en place**, jamais détruite puis recréée
> (`rewriteScheduledSessionExercises`). La reprise de l'`id` sur une ligne recréée a été écartée :
> ce qui est rattaché à la ligne (documents, tags, et demain tout nouvel enfant) serait resté
> détruit en cascade à chaque enregistrement du coach. Quatre conséquences : **(1)** une ligne
> reprise garde ses documents **sans copie**, la bibliothèque ne sert qu'aux exercices
> **ajoutés**, et un `sourceExerciseId` passé à `null` ne coûte plus aucun document ni objet ;
> **(2)** `baseline`, `tracking` et `sourceExerciseId` d'une ligne reprise ne se réécrivent pas
> depuis le panneau du coach ; **(3)** un `id` inconnu de la séance est une ligne **nouvelle**, et
> un `id` cité deux fois vaut **400** ; **(4)** les rangs passent par un garage, comme `writeDay`,
> car `@@unique([scheduledSessionId, position])` mord pendant l'écriture. La copie de semaine (#4)
> recrée ses lignes, et c'est voulu : ce sont des séances neuves, et ses documents viennent de
> l'instance source. Un e2e le verrouille désormais pour les images de consigne.
>
> Le débrief qui cite un exercice absent de la séance répond maintenant **400**, avant toute
> écriture, texte compris (#311). Ce refus a un coût côté clients : une coche restée en local sur
> un exercice que le coach a retiré ferait refuser tout le débrief. Les deux clients filtrent donc
> le suivi avant l'envoi (`trackingOfExercises`, `@cmv/shared`) — le web en #311, le mobile en
> [#490](https://github.com/Cimavia/cimavia/issues/490). Le filtre lit la séance **en cache**,
> qui peut ignorer un retrait tout juste fait : cinq minutes sur mobile, où elle est persistée,
> une minute sur le web. Un 400 au débrief invalide donc la séance sur les deux clients — le
> mobile en #490, le web en [#499](https://github.com/Cimavia/cimavia/issues/499) — et l'envoi
> suivant passe ; le suivi local, lui, n'est vidé qu'au succès. #296/#311 et #490 se
> **promeuvent ensemble** en preview.

> **Tranché — le repos par ligne passe par une COLONNE, pas par un champ de modèle.** Un exercice
> à deux repos — « 1 min entre les tractions, 8 min entre les séries » — demandait un repos par
> ligne, là où `restBetweenSetsSeconds` vit sur la structure, une seule valeur pour tout le bloc.
> Retenu : la colonne de catalogue `REST_BETWEEN_SETS` / `REST_BETWEEN_ROUNDS` posée dans la
> grille, que `blockSegments` lit ligne à ligne et qui l'emporte alors sur le repos d'ensemble.
> Aucune migration, aucun champ nouveau, et le coach la pose comme n'importe quelle métrique.
> L'alternative — un champ `restSeconds` par ligne — était plus explicite mais coûtait une
> migration, un constructeur retouché et un second endroit où lire un repos.

> **Tranché — une séance À VENIR se coche et se débriefe.** #170 demandait « séance à venir :
> aucune case, le suivi s'ouvre le jour venu ». Livré, puis retiré : l'athlète qui avance sa séance
> du lendemain se retrouvait à ne pouvoir ni cocher ni débriefer ce qu'il venait de faire. La date
> planifiée est une INTENTION du coach, pas une porte. La cohérence se fait dans l'autre sens :
> tout est ouvert, tout le temps.

> **Tranché — une séance débriefée reste cochable.** #170 demandait de FIGER les cases une fois la
> séance débriefée (« cases visibles mais figées »). Livré tel quel, puis retiré : la prémisse est
> fausse. Un débrief se complète et se corrige en plusieurs fois — le bouton dit « Voir / **modifier**
> mon débrief », le `PUT` est idempotent, et le crayon du récapitulatif rouvre le décompte. Figer
> les cases de la séance pendant que l'écran de débrief les rouvre ne décrivait aucun état réel :
> l'athlète qui avait débriefé ne pouvait plus corriger son décompte là où il l'avait saisi. Rien
> dans le modèle ne rend une séance définitive aujourd'hui ; le jour où quelque chose la clôturera
> (cycle archivé, facture émise), la règle se réintroduira sur CE fait-là, pas sur `status = DONE`.

> **Tranché en #543** (plus de cotation d'escalade à dupliquer) : #162 livrait la cotation française
> et la cotation V comme échelles pré-remplies, à dupliquer dans une métrique maison. Cimavia ne
> cible pas un sport (#544) : une échelle d'escalade n'a pas à servir de raccourci générique. Une
> échelle maison démarre donc **vide**, et `V_BOULDERING_SCALE` disparaît. La cotation française
> reste **dans le catalogue**, parce que les coachs actuels grimpent, mais elle quitte la famille
> Intensité pour une famille **« Spécifique »**, et son libellé nomme son sport (« Cotation
> escalade (FR) »). La clé `GRADE` ne change pas : elle est stockée dans les blocs et dans les
> snapshots des planifs diffusées, donc aucune migration. Les familles suivent l'ordre où
> `MetricFamily` les déclare, plus celui de leur première métrique dans le catalogue : sans ça,
> « Spécifique » se serait affichée au milieu, à la place qu'occupait `GRADE`.

---

## Post-MVP — Repère de champ obligatoire ([#97](https://github.com/Cimavia/cimavia/issues/97))

> **Tranché en #97** (l'astérisque parle du FORMULAIRE, pas du cycle) : un astérisque veut dire
> « obligatoire pour valider *ce formulaire-ci* », jamais « obligatoire pour diffuser ». C'est ce
> qui autorise la facturation à marquer montant et échéance — un `DRAFT` est toujours complet —
> sans contredire l'encadré *Tranché en #144*, et ce qui interdit de marquer l'athlète d'un cycle,
> qui n'entre pas dans son `canSubmit`. Sans cette phrase, la revue champ par champ n'a pas de
> critère et chaque écran retranche à son goût.

> **Tranché en #97** (on ne marque que les formulaires MIXTES) : le repère distingue l'obligatoire
> du facultatif ; là où tout est obligatoire, il n'informe personne. L'auth (connexion, inscription,
> mot de passe oublié, réinitialisation), le code coach et le **panneau de rappel** restent donc
> nus — ce dernier a même *perdu* l'astérisque qu'il portait sur son échéance. Corollaire : la prop
> n'est **pas** dérivée de `required`, qui n'exprime pas ce choix. Corollaire du corollaire, `unit`
> d'une métrique maison reste nue à côté d'un `label` marqué : c'est le contraste qui informe.

> **Tranché en #97** (ni `CmvSelect` ni `CmvTextArea` ne reçoivent la prop) : l'issue demandait les
> deux. Après inventaire, **aucun appelant** ne la réclame — les deux `CmvSelect` du produit sont
> un choix facultatif et un champ obligatoire à la diffusion seulement ; la seule zone de texte
> requise, la note d'un rappel, vit dans un panneau que la règle ci-dessus laisse nu. Ajouter la
> prop aurait créé du code mort dans le design system. Le jour où un formulaire mixte a besoin de
> l'une des deux, le patron à recopier est celui de `CmvTextField` — `aria-hidden` compris.

> **Tranché en #97** (le repère est MUET, et c'est ce qui le rend correct) : l'astérisque vit dans
> le `<label>`. Sans `aria-hidden="true"`, il entre dans le **nom accessible** du champ, qui
> s'annonce « Montant astérisque » — c'est ce que faisaient les sept champs déjà marqués. L'attribut
> `required` porte déjà l'obligation pour les lecteurs d'écran ; le repère n'est donc que visuel.
>
> **Piège de test qui en découle** : `getByLabelText` lit le `textContent` du `<label>`, astérisque
> compris, et ne trouve plus un champ marqué — même avec l'`aria-hidden`, qui ne change pas le
> texte. `getByRole("textbox", { name })` lit le nom accessible et le trouve. **Marquer un champ
> casse donc les tests qui le visaient par son label** : douze l'ont été ici. Le message
> (`Unable to find a label with the text of: …`) ne dit rien de l'astérisque, et c'est ce qui rend
> le piège coûteux la première fois.

> **Tranché en #97** (l'astérisque est terracotta, pas rouge) : `text-cmv-error` sortait à
> **4.20:1** sur `surface`, sous le seuil AA de 4.5 — l'en-tête de `tailwind-preset.js` interdit
> justement le `DEFAULT` d'une famille d'état en texte. `text-cmv-accent-on` donne **7.32:1** et
> suit les maquettes, qui dessinent ce repère en terracotta et gardent le rouge pour l'**erreur de
> validation** (bordure `error` + message `error-on`). Le mélange des deux effaçait cette frontière.
>
> **Angle mort non traité ici** : `text-cmv-error` est employé comme texte à **quarante autres
> endroits**, messages `titleRequired` des deux constructeurs compris, tous sous AA. Même famille
> que [#178](https://github.com/Cimavia/cimavia/issues/178) — là un token *inexistant*, ici un token
> du *mauvais rôle*, et aucune porte ne voit ni l'un ni l'autre.

> **Tranché en #97** (le mobile sort du périmètre, faute de quoi le porter) : son `CmvTextField`
> n'a ni `required` ni repère, son `<Text>` de label n'est **pas associé** au `TextInput` — RN n'a
> pas de `htmlFor` — et surtout **React Native n'expose aucun état accessible `required`**
> (`accessibilityState` = disabled/selected/checked/busy/expanded). Un astérisque y serait purement
> décoratif, sans la contrepartie sémantique qui rend le geste correct sur le web. C'est le terrain
> de [#199](https://github.com/Cimavia/cimavia/issues/199), qui traite déjà l'accessibilité des
> composants partagés du mobile.

> **Tranché en #97** (une légende par SURFACE, pas par composant) : `common.requiredLegend` remplace
> les deux clés dupliquées `invoice.billing.requiredLegend` et `plan.header.requiredLegend`. Trois
> écrans montraient jusqu'ici un astérisque que rien n'expliquait. La légende suit son champ quand
> celui-ci est conditionnel : sur la séance planifiée, choisir un modèle retire le titre **et** la
> légende, qui n'expliquerait plus aucun astérisque. Le formulaire de métrique maison a sa propre
> légende sans faire doublon avec celle du constructeur d'exercice : il vit dans un `CmvPanel`, donc
> sur une autre surface.

---

## Post-MVP — Recherche d'exercices sans accent ([#141](https://github.com/Cimavia/cimavia/issues/141))

> **Tranché en #141** (la normalisation vit en TYPESCRIPT, pas dans Postgres) : l'issue proposait
> l'extension `unaccent`. Refusée — elle poserait une **seconde** définition de « sans accent »
> (table de translittération par locale) à côté de celle de `comparableText` (@cmv/shared), et les
> deux divergeraient au premier caractère qu'elles ne traitent pas pareil. Or le défaut que l'issue
> nomme est exactement celui-là : deux champs de recherche voisins qui ne se comportent pas pareil.
> Le corriger en dupliquant la règle un étage plus bas l'aurait reconduit. La colonne `titleSearch`
> est donc remplie par la MÊME fonction que les recherches client alignées en #123.
>
> Le backfill, lui, est du SQL — il ne peut pas être autre chose. Il reproduit la fonction terme à
> terme avec `normalize(…, NFD)`, **natif depuis PG 13**, donc toujours sans extension ; il ne
> s'exécute qu'une fois et le commentaire de la migration le dit, pour que personne ne le prenne
> pour la règle.

> **Tranché en #141** (AUCUN index, et ce n'est pas un oubli) : l'issue demandait un index
> d'expression en `text_pattern_ops`. Il n'aurait jamais servi — le filtre est un `contains`, donc
> un `LIKE '%x%'`, qu'aucun btree ne peut satisfaire ; `text_pattern_ops` ne sert que les préfixes.
> Le seul index utile serait un GIN `pg_trgm`, soit une extension pour des dizaines de lignes par
> coach, déjà réduites par l'index `coachId`. Consigné ici parce qu'un index absent ne se justifie
> pas tout seul, et sera reproposé sinon.

> **Tranché en #141** (colonne normalisée plutôt que `$queryRaw`) : la seconde voie de l'issue
> aurait **contourné l'extension de tenancy** (§6 de `architecture-choice.md`), imposant un
> `coachId` explicite et un e2e d'isolation pour prouver ce que le client scopé fait déjà seul. Le
> piège réel de la voie retenue n'est pas là : c'est `ExerciseService.update`, qui n'écrit `title`
> que sous `!== undefined`. `titleSearch` passe sous la **même** garde — sans quoi un renommage
> laisserait la ligne introuvable par l'ancien mot comme par le nouveau, sans rien d'anormal à
> l'écran. Le test de `exerciseListWhere` tient la symétrie de la LECTURE ; un e2e tient l'autre
> moitié — il renomme, puis vérifie que l'ancien mot ne ramène plus rien et que le nouveau ramène
> la ligne.
>
> Cet e2e n'était pas prévu : la Quality Gate l'a réclamé (couverture du code neuf à **76,9 %**,
> 10 lignes et conditions sur 13). Ce qu'elle désignait n'était pas une dette du changement mais un
> angle mort d'avant lui — **`PATCH /exercises/:id` portant un titre n'était exercé par AUCUN e2e**
> depuis P2. La ligne n'est devenue visible que parce que le correctif l'a déplacée dans un bloc.
> C'est le cas d'école de ce que la gate sur le code neuf est censée attraper : elle ne mesure pas
> la qualité du diff, elle éclaire ce que le diff touche.

> **Tranché en #141** (`titleSearch` est NON-NULL) : la rendre nullable créerait un troisième état,
> « pas encore rempli », que le filtre écarterait sans le dire — une ligne invisible sans erreur.
> C'est la règle dure n°5 lue dans le bon sens : `null` doit vouloir dire quelque chose. Ici il ne
> voudrait rien dire, donc il n'existe pas. Le `DEFAULT ''` de la migration ne sert qu'à poser la
> colonne sur les lignes déjà là et **ne lui survit pas**.

> **Fermé par #79** (le filtrage client n'est pas une option, malgré les voisins) : `LibraryPicker`
> et `ExercisePicker` filtrent en mémoire, et il aurait été tentant d'aligner la liste dessus.
> [#79](https://github.com/Cimavia/cimavia/issues/79) paginera `GET /exercises` — filtrer une page
> deviendrait faux. Écrit ici pour que la voie ne soit pas rouverte.

> **Tranché en [#654](https://github.com/Cimavia/cimavia/issues/654)** (plusieurs tags à la fois) :
> - **OU, pas ET** : « force et gainage » cochés montrent ce qui porte l'UN des deux. Le besoin
>   remonté en recette de #606 était de réunir deux familles d'exercices, pas d'en chercher
>   l'intersection. La règle est écrite une fois, `matchesTagFilter` (`@cmv/shared`), que les
>   séances appliquent côté client ; le serveur la tient pour les exercices en `some … in`. Le
>   texte de l'état vide ne change pas : « Rien ne correspond à ces filtres » vaut pour les deux.
> - **Un `?tag=` invalide est refusé (400)**, plus ignoré : un tag trop long rendait toute la
>   bibliothèque sous un filtre que le client croyait actif. Une valeur VIDE, elle, reste « pas de
>   filtre » (`exerciseTagFilterSchema`). Au-delà de `EXERCISE_TAG_FILTER_MAX` (50) tags, la
>   requête est refusée aussi : chacun finit dans un `IN` SQL, et ce n'est plus un geste de Coach.
> - **Un tag choisi garde sa pastille** même s'il sort des tags connus après une relecture
>   (`tagFilterOptions`, dans `LibraryFilterBar`) : sans elle, il ne se décocherait plus. Seul
>   l'onglet Séances le tenait jusque-là ; la règle vaut désormais pour les trois listes.
> - **Écart à la maquette #597**, à choix unique (« Tous les tags ») : consigné dans
>   `docs/maquettes/README.md`.

> **Ce qui a manqué au journal** : cette dette a vécu depuis P2 sans jamais y être écrite — ni
> ligne, ni mention dans l'en-tête des dettes sans issue. Elle n'a été vue que parce que #123 a
> aligné les recherches client à côté d'elle. La règle de capture n'a pas joué ; c'est le seul
> constat à en tirer, il n'y a rien à rattraper d'autre.

---

## Post-MVP — Saisie décimale dans la grille de dosage ([#298](https://github.com/Cimavia/cimavia/issues/298) · [#299](https://github.com/Cimavia/cimavia/issues/299) · [#332](https://github.com/Cimavia/cimavia/issues/332))

> **Tranché en [#298](https://github.com/Cimavia/cimavia/issues/298)** (un nombre s'écrit dans la
> langue du lecteur, PARTOUT) : l'issue ne visait que la saisie, mais une cellule qui affiche
> « 12,5 » au coach pendant que l'aperçu et le mobile écrivent « 12.5 » à l'athlète ferait douter
> de ce qui a été enregistré. `formatMetricValue` et `metricCellText` prennent donc la `locale` en
> dernier paramètre, comme les autres formateurs du paquet. La saisie (`parseDecimal`) accepte la
> virgule ET le point, donc aucun séparateur de milliers : « 1.500 » vaut 1,5, et l'affichage
> n'en met pas non plus (« 1500 »), pour qu'une valeur relue se ressaisisse telle quelle.

> **Tranché en [#299](https://github.com/Cimavia/cimavia/issues/299)** (Entrée transmet la valeur
> validée, pas de mise à jour fonctionnelle) : l'issue proposait aussi de faire dériver l'ajout de
> ligne de l'état courant. Côté exercice, la chaîne `BlockGrid` → `StructureSection` →
> `draft.setBlocks` passe des tableaux COMPLETS à chaque étage : il aurait fallu la réécrire en
> entier. Retenu : `onCommitLine(value)` reçoit la valeur validée, et la grille écrit la cellule ET
> la nouvelle ligne en une seule fois (`withCellValue` puis `withDuplicatedLastRow`). Deux règles
> vont avec :
>
> - **Une saisie refusée ne crée pas de ligne** : l'erreur reste dans la cellule, sous les yeux du
>   coach, au lieu de glisser sous la ligne suivante.
> - **Retaper la valeur déjà enregistrée n'écrit rien** : côté séance, l'écriture aurait posé un
>   marqueur d'ajustement sur une cellule qui n'a pas bougé. La règle « le marqueur vient de la
>   donnée, jamais d'une comparaison avec la référence » (`SessionBlockGrid`) n'est pas touchée :
>   on compare à la valeur EN PLACE, pas à la référence.

> **Tranché en [#332](https://github.com/Cimavia/cimavia/issues/332)** (le pas suit le type de
> colonne) : décimal sur une colonne de nombres (« +2,5 kg »), entier sur une échelle, où un palier
> et demi n'existe pas. Un pas refusé ferme le bouton au lieu d'être arrondi en silence.
> `fillStep` arrondit au nombre de décimales du départ ou du pas, le plus grand des deux : sans
> ça, un pas de 0,1 écrivait `0.30000000000000004` dans la quatrième ligne.

---

## Post-MVP — Lisibilité du constructeur ([#525](https://github.com/Cimavia/cimavia/issues/525))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| L-1 | **L'écriture des durées est figée en français, hors i18next** : `formatTrainingDuration` (`@cmv/shared`) rend « 45 s · 3' · 2'30 », notation qui n'a pas de sens en anglais. Pris en #528, qui en fait la seule voie d'affichage d'une durée d'entraînement. | 🟢 | — *(déclencheur : un catalogue d'interface anglais — l'`en.json` mobile actuel ne porte que les permissions iOS)* |

> **Tranché en [#520](https://github.com/Cimavia/cimavia/issues/520)** (une ligne par série, et les
> lignes restent un tableau) : la grille d'une Séries montrait les lignes STOCKÉES, et le coach qui
> saisissait « 4 séries » sur une ligne ne voyait pas que les trois autres la reprenaient. Elle
> montre désormais une ligne par série ; celles qui n'ont pas de ligne propre sont des **fantômes**
> estompés, qui disent quelle série ils reprennent. Le modèle ne bouge pas — `setCount` reste
> distinct des lignes, aucune migration — mais sa lecture change sur un point : une série sans
> ligne propre reprend la **DERNIÈRE** ligne (`rowForUnit`), et non plus rien. C'est ce que la
> grille montre, et l'exécution guidée devait jouer la même chose.
>
> - **Saisir dans un fantôme le matérialise**, avec les fantômes qui le précèdent, en copie de la
>   dernière ligne : la ligne n reste la série n (`withMaterializedSeries`). La ligne matérialisée
>   prend l'identifiant RÉSERVÉ de son fantôme, donc la même clé React : sans ça, le coach qui
>   tabule hors de la cellule qu'il vient de remplir perdait le focus. Pour la même raison, les
>   deux natures de ligne partagent UN seul `<tr>` (`BlockGridRow`).
> - **Plus de « Ajouter une ligne » en Séries**, et Entrée n'en crée plus : c'est le champ
>   « Séries » du bandeau qui fixe le nombre de lignes. Une ligne au-delà de `setCount` reste
>   visible, marquée « non jouée », pour que le coach qui baisse le nombre de séries ne perde rien.
> - **La corbeille fait remonter les séries suivantes** : la dernière redevient fantôme. Les lignes
>   sont un tableau, pas des cases numérotées — retirer la série 2 sur 4 ne laisse pas de trou.
> - **L'arbitrage de `resetRow` est conservé** : « Revenir au défaut » ne retire pas une ligne
>   ajoutée en séance. Une série matérialisée au niveau séance est une ligne ajoutée comme une
>   autre, sans marqueur d'ajustement ; c'est la corbeille qui la rend fantôme.
> - **Le remplissage de colonne agit sur les N séries** (`fillableRows`), fantômes compris, et non
>   sur les seules lignes stockées : « progression sur 4 séries » qui n'en remplit qu'une n'a pas
>   de sens.
> - **La lecture regroupe les séries identiques** (`readingRows`) : l'aperçu du web et la séance
>   mobile disent « 1 » puis « 2–4 », plutôt que de répéter trois fois la même ligne ou de taire
>   les séries reprises. Une ligne non jouée n'y apparaît pas.

> **Tranché en [#526](https://github.com/Cimavia/cimavia/issues/526)** (« Ex. » sur les exemples,
> rien sur les consignes) : la frontière se lit dans la phrase. Restent sans préfixe, parce qu'ils
> disent QUOI écrire et non une valeur qu'on croirait saisie : « Palier » (échelle maison), « Ce
> qui vaut pour toute la séance… », « Sensations, difficultés, ce qui a marché… » (débrief),
> « Objectifs, points de vigilance, blessures… » (note de suivi, mobile), « Précisions sur la
> prestation (optionnel) », et `https://…`, qui est un format. Le champ de durée garde sa largeur
> (`w-20`) : « Ex. 2'30 » y tient, de justesse. Aucune garde automatique — `check:i18n` ne sait
> pas distinguer un exemple d'une consigne ; la règle vit dans le commentaire de `index.css` et
> dans les conventions du README.

> **Tranché en [#528](https://github.com/Cimavia/cimavia/issues/528)** (une durée d'entraînement
> ne s'écrit que par `formatTrainingDuration`) : un texte du catalogue ne contient jamais « min »
> en dur pour une durée d'entraînement — il reçoit la durée déjà mise en forme. La saisie reste
> tolérante (« 2 min » est compris) et l'affichage montre ce qui a été compris (« 2' ») ; c'est
> pourquoi le message d'erreur du champ ne propose plus « 2 min » comme format, et dit enfin que
> le nombre nu compte des secondes. Deux phrases suivent : l'EMOM d'une minute dit « Chaque minute
> pendant 10' » plutôt que « Toutes les 1' » (seule la valeur 60 s a sa clé — « Toutes les 1'30 »
> se lit bien), et le repos d'un Circuit prend la tournure de celui des Séries, « 3' de repos
> entre les tours ». Hors de la règle, parce que ce ne sont pas des durées d'entraînement : « il y
> a 2 min » (horodatage relatif) et les compteurs média (`formatMmSs`). L'indice « défaut 150 »
> reste à [#369](https://github.com/Cimavia/cimavia/issues/369).

---

## Post-MVP — Bornes des compositions et du suivi ([#297](https://github.com/Cimavia/cimavia/issues/297))

> **Tranché en #297** (50 exercices, et le serveur seul le dit) : `SESSION_MAX_EXERCISES` borne les
> séances modèles comme planifiées, et par ricochet le suivi d'un débrief. C'est un garde-fou sur
> ce qu'un Coach fait vraiment, pas sur ce que la machine tient — le seuil d'OOM n'a pas été
> mesuré. Comme `PLAN_MAX_WEEKS`, aucun constructeur ne ferme l'ajout au plafond : personne ne
> l'atteint, et le 400 nomme la borne. Le corps de requête est plafonné à 1 Mio **par écrit**
> (`API_BODY_LIMIT_BYTES`), sur l'adaptateur que `main.ts` et les e2e partagent.
>
> **Tranché en #297** (le suivi se borne par l'EMOM, pas par les lignes) : la revue proposait
> `checked ≤ BLOCK_MAX_ROWS`. Un EMOM donne une case par top — 24 h à 5 s, 17 280 cases — et ce
> plafond aurait refusé le suivi d'un EMOM d'une heure. `BLOCK_MAX_TRACKING_UNITS` prend le plus
> grand des plafonds d'unités. Une case cochée deux fois est **refusée** : elle se comptait deux
> fois (« 6 sur 4 »), et aucun client ne l'envoie.
>
> **Tranché en #297** (l'entrée est bornée, la relecture non) : les plafonds du suivi vivent sur
> `exerciseTrackingInputSchema`, pas sur `exerciseTrackingSchema`, qui relit ce qui est stocké. Un
> suivi enregistré avant la borne et qui la dépasse ferait sinon échouer en 500 la lecture de toute
> la séance, pour le coach comme pour l'athlète.
>
> **Tranché en #297** (refuser plutôt que filtrer) : l'issue demandait de « n'écrire que les clés
> qui correspondent à un exercice de la séance ». #311 avait déjà choisi le **refus** en 400 : un
> filtre silencieux laissait le client vider un suivi qui n'avait atterri nulle part. Le filtre vit
> côté client (`trackingOfExercises`), désormais aussi pour les **blocs** retirés : sans lui, une
> clé morte suffisait à dépasser le plafond de blocs, et l'athlète restait bloqué à chaque envoi.

---

## Post-MVP — Créer l'exercice manquant sans perdre la séance ([#303](https://github.com/Cimavia/cimavia/issues/303))

> **Tranché en [#303](https://github.com/Cimavia/cimavia/issues/303)** (enregistrer, partir,
> revenir — pas de nouvel onglet) : « Créer l'exercice « gainage » » naviguait dans le même onglet
> sans rien enregistrer, et la séance en cours partait avec. Deux voies :
>
> - **Un nouvel onglet** a été écarté : il n'invalide que son propre cache. Revenu sur sa séance,
>   le coach y voit encore « aucun résultat » pour « gainage » jusqu'à une minute (le `staleTime`
>   de la bibliothèque), et il lui reste un onglet à fermer.
> - **Enregistrer puis partir**, comme « Dupliquer en variante » le faisait déjà. Le sélecteur ne
>   navigue plus : il remonte le titre à l'écran, qui enregistre et ouvre
>   `/library/exercises/new?title=…&session=<id>`. Une séance neuve devient ainsi une séance
>   enregistrée, visible en bibliothèque même si le coach abandonne en route : c'est le prix du
>   geste, le même que pour la variante.
>
> Ce qui en découle :
>
> - **Le retour passe par un id, pas par un chemin** : la cible se reconstruit dans l'écran, l'URL
>   ne peut donc ramener nulle part ailleurs — pas besoin de `safeRedirect` (#337).
> - **L'exercice enregistré est ajouté à la séance** au retour (`?add=<id>`), parce que le geste
>   voulait dire « je veux gainage dans cette séance ». Il entre dans l'état INITIAL du brouillon,
>   pas par un effet : l'écran attend l'exercice avant de monter le brouillon, puis retire `add`
>   de l'URL. Un F5 ne l'ajoute pas une seconde fois. Il reste à enregistrer, comme tout ajout.
> - **Retour en `replace`** : le détour par la création ne reste pas dans l'historique, où un
>   retour arrière rouvrirait le formulaire d'un exercice déjà créé. Annuler et Supprimer
>   ramènent aussi à la séance, sans rien ajouter.
> - **Une séance sans titre ne s'enregistre pas, et rien ne part** : le champ réclame son titre et
>   un toast dit pourquoi. La variante, qui passe par le même enregistrement, y gagne le même
>   message au lieu d'un échec serveur muet.
>
> Pour [#327](https://github.com/Cimavia/cimavia/issues/327) (garde « modifications non
> enregistrées ») : ces deux sorties partent APRÈS un enregistrement réussi, et la garde les laisse
> passer comme `onSubmit`. Sur une séance neuve, le brouillon restait comparé à une séance vide
> après l'enregistrement : c'est pourquoi #327 compare à ce qui est PARTI.

---

## Post-MVP — Quitter une saisie non enregistrée ([#327](https://github.com/Cimavia/cimavia/issues/327))

*Résolues, à l'[archive](archive.md) : G-1.*

> **Tranché en [#327](https://github.com/Cimavia/cimavia/issues/327)** (la sortie se compare à
> l'ENREGISTRÉ, et seul ce qui change de page la déclenche) : les constructeurs d'exercice, de
> séance et de cycle laissaient partir leur saisie sans un mot — Annuler posé à côté
> d'Enregistrer, un lien de la barre latérale, un retour arrière, un F5. `useLeaveGuard` pose un
> `useBlocker` de TanStack Router et un `beforeunload`, `CmvLeaveDialog` porte la question.
>
> - **« Modifié » = ce qui PARTIRAIT diffère de ce qui est enregistré**, pas de l'état au montage.
>   L'issue proposait l'état initial : il aurait laissé partir sans un mot l'exercice ajouté au
>   retour de #303 (il naît dans l'état initial, et n'est pas enregistré), et retenu la navigation
>   qui suit l'enregistrement d'une séance neuve (comparée à une séance vide). C'est la règle de
>   #326. Brouillon et enregistré passent par la même mise en forme (`toExerciseInput`,
>   `toSessionInput`) et se comparent sans tenir compte de l'ordre des clés (`sameJson`) : un titre
>   suivi d'une espace, une valeur remise à l'identique, ne retiennent rien.
> - **La référence suit ce qui est PARTI, pas la réponse du serveur** : celle-ci porte les ids
>   définitifs des images de la consigne, là où le brouillon garde leurs ids provisoires. Elle n'est
>   remise à jour qu'une fois TOUT envoyé — un envoi interrompu (#302) laisse l'écran modifié.
>   Fichiers et liens en attente comptent à part, ils ne sont dans aucun champ. Le **rechargement**
>   d'une ligne de séance s'écrit côté serveur : la référence le suit, sans quoi il passerait pour
>   une saisie.
> - **Le titre pré-rempli par « Créer l'exercice « gainage » »** fait partie de la référence : repris
>   de la recherche, il n'a pas été saisi ici. Annuler sans rien toucher ne demande rien.
> - **Seul un changement de page est retenu** (`pathname`) : le `?add` que la séance retire de son
>   URL une fois lu (#303) ne fait rien perdre.
> - **Les sorties qui SUIVENT une écriture réussie passent** (`release`) : enregistrer, dupliquer en
>   variante, créer l'exercice manquant, supprimer l'exercice ou le cycle. Elles partent dans la
>   même tâche que l'écriture, avant que l'écran ne se redessine — l'état de la garde se lit donc
>   par ref.
> - **Un `<dialog>` modal, pas `window.confirm`**, pour la même raison que `CmvConfirmButton` : ni
>   stylable ni traduisible. « Rester » vient en premier, focalisé ; Échap vaut « Rester ». F5 et
>   fermeture d'onglet montrent la boîte du NAVIGATEUR, dont aucun site ne choisit le texte.
> - **Se déconnecter et « Changer de compte » demandent AVANT d'agir** (`confirmLeave`) : la garde
>   du routeur ne voit que la navigation, qui vient APRÈS la coupure de session ou la purge — le
>   coach se voyait demander s'il voulait quitter un écran qu'il avait déjà perdu. « Rester » le
>   laisse connecté, sa saisie intacte. Une reconnexion aboutie sur un AUTRE compte part, elle,
>   sans demander (`ignoreBlocker`) : garder l'écran montrerait le travail du premier sous
>   l'identité du second. La question est rendue dans `body` : l'écran d'une session perdue est
>   `inert` (`CmvRoleGate`), et le dialogue n'y répondrait plus.
>
> Le **mobile** n'a pas de constructeur de bibliothèque : rien à garder.

> **Tranché en [#682](https://github.com/Cimavia/cimavia/issues/682)** (la question propose
> d'ENREGISTRER, et amende « Tranché en #327 ») : « Rester / Quitter » obligeait le coach qui
> voulait garder son travail à rester, enregistrer, puis refaire son geste. Le dialogue demande
> désormais « Enregistrer les modifications ? » : **Enregistrer** (premier, focalisé), **Ne pas
> enregistrer**, **Annuler**.
>
> - **Entrée enregistre et part, Échap vaut « Annuler »** : aucune touche ne fait perdre la saisie.
>   Pendant l'envoi, les trois boutons sont fermés, « Enregistrer » dit « Enregistrement… » et Échap
>   est ignoré — rester laisserait partir un enregistrement que plus rien n'attend.
> - **Chaque écran gardé fournit `save(): Promise<boolean>`** à `useLeaveGuard`, et ne part que
>   sur `true`. Un échec referme le dialogue et refuse la navigation : l'écran dit pourquoi, par le
>   même toast ou le même bandeau qu'à un enregistrement au bouton. Les constructeurs de
>   bibliothèque partagent le leur (`useBuilderSave`) avec « Dupliquer en variante » et « Créer
>   l'exercice manquant ».
> - **Les messages sont génériques** (« Le titre est requis pour enregistrer… ») et non liés à la
>   destination : un même enregistrement sert le bouton, le dialogue et les sorties de #303. Sous
>   un titre vide, le toast redit la légende du champ : celui-ci peut être hors de l'écran.
> - **Un enregistrement à la fois** (`useCheckedSave`, que partagent les quatre écrans) : le
>   dialogue peut s'ouvrir pendant que l'envoi du bouton attend sa réponse. Son « Enregistrer »
>   ATTEND cet envoi, puis répond « rester ». Renvoyer créait deux fois, ou se faisait refuser par
>   sa propre version ; reprendre la réponse de l'envoi en vol partait en perdant ce que le coach
>   avait saisi depuis. Seule la suite du premier geste agit.
> - **« Enregistrer » part là où allait le geste.** « Annuler » sur un exercice ouvert par « Créer
>   l'exercice manquant » ramène à la séance SANS l'y ajouter, comme le veut #303 : l'exercice est
>   enregistré en bibliothèque, à ajouter de là. Le routeur ne laisse reprendre la navigation
>   retenue que telle quelle.
> - **Le cycle enregistre tout ce qui attend, l'un APRÈS l'autre** : panneau de séance, facturation,
>   puis en-tête. Décaler le début du cycle fait avancer la version des séances (#604) : envoyé
>   avant, l'en-tête rendrait périmée la version que le panneau cite, et le coach prendrait un
>   conflit contre lui-même. Un envoi refusé n'arrête pas les suivants, mais garde le coach sur la
>   page. Les formulaires remontent leur `save` (`useReportUnsaved`), plus un simple booléen.
> - **Le panneau d'une séance se referme une fois enregistré** par le dialogue, comme par son
>   bouton : resté ouvert, il citerait la version qu'il vient lui-même de dépasser.
> - **Se déconnecter enregistre AVANT de couper la session** ; un échec laisse le coach connecté,
>   sur sa saisie.
> - **« Changer de compte » diffère l'enregistrement** à la reconnexion (cf. *Tranché en #682* de
>   `comptes-et-tenancy.md`).
>
> Deux écarts assumés : **F5 et fermeture d'onglet** montrent toujours la boîte du navigateur, qui
> ne peut rien enregistrer ; et **« Annuler » a deux sens** selon l'écran — le bouton d'un
> constructeur abandonne la saisie, celui du dialogue l'y ramène. Le dialogue le dit par son titre,
> qui pose la question.

---

## Post-MVP — Saisie refusée dans les constructeurs ([#566](https://github.com/Cimavia/cimavia/issues/566))

> **Tranché en [#566](https://github.com/Cimavia/cimavia/issues/566)** (une saisie refusée ferme
> l'enregistrement, une grille incomplète non) : une durée ou un nombre que le champ ne comprend
> pas reste à l'écran, mais pas dans le brouillon. « Enregistrer » envoyait donc l'ancienne valeur,
> et le coach croyait avoir enregistré ce qu'il voyait. Le texte refusé reste LOCAL au champ ; seul
> le FAIT du refus remonte, par un registre en contexte (`useRefusedFields`).
>
> - **Ce n'est pas le cas de `BlockIssues`**, qui laisse enregistrer une grille incomplète, et le
>   reste : refuser cet enregistrement-là ferait perdre ce que le coach a écrit. Ici, fermer le
>   bouton ne fait rien perdre — le coach corrige ou vide le champ. C'est la règle de
>   [#332](https://github.com/Cimavia/cimavia/issues/332) pour le pas de remplissage.
> - **Amende « Tranché en #327 »** : « modifié » ne veut plus seulement dire « ce qui partirait
>   diffère de l'enregistré ». Une saisie refusée ne change rien à ce qui partirait, mais la quitter
>   la perd : elle retient la sortie comme une modification.
> - **Les deux gestes qui enregistrent sans le bouton refusent aussi** : « Dupliquer en variante » et
>   « Créer l'exercice manquant » enregistrent la séance puis la quittent — la saisie serait partie
>   en silence. Ils le disent par un toast, comme pour le titre manquant.
> - **Un champ démonté se retire du registre** (ligne retirée, exercice retiré, structure changée) :
>   sans ça, l'enregistrement resterait fermé sans plus aucun champ où le rouvrir.
> - **Le message de la cellule est court** (« Durée non comprise. Ex. 1'30 ») et vit SOUS elle,
>   relié par `aria-describedby` : la colonne est étroite, et `BlockIssues` lit le brouillon, qui ne
>   contient pas la saisie refusée.

---

## Post-MVP — Images de consigne venues du client ([#315](https://github.com/Cimavia/cimavia/issues/315))

> **Tranché en [#315](https://github.com/Cimavia/cimavia/issues/315)** (une consigne ne cite que
> les images de sa ligne, et la variante est copiée par le serveur) : « Dupliquer en variante »
> recopiait la consigne côté client, avec les identifiants des documents de la SOURCE. Ni l'éditeur
> de la variante ni l'athlète n'affichaient ces images, sans un message. Ce n'était pas une fuite :
> l'affichage ne résout que parmi les documents de la ligne, et une référence étrangère restait
> morte, même vers un autre coach.
>
> - **Le 400 ET la copie serveur, pas l'un ou l'autre.** Le refus seul cassait toute variante
>   illustrée. `POST /exercises/:id/duplicate` rattache à la variante les images que la consigne
>   cite, sous la **même clé objet**, comme une séance planifiée. Pièces jointes et liens restent
>   à la source : la variante sert à changer structure, colonnes ou consigne.
> - **`DocumentCleanupService` compte aussi les autres documents de bibliothèque** qui portent la
>   clé. Supprimer la source, ou une de ses images, ne purge plus celle de la variante — et le
>   ménage des images retirées de la consigne ([#330](https://github.com/Cimavia/cimavia/issues/330))
>   en hérite.
> - **Ce qui se contrôle** (`assertInstructionImagesOwned`, piège n°3 de `architecture-choice.md`
>   §6) : une image doit désigner un fichier d'usage `INSTRUCTION` de la ligne écrite. Exercice
>   créé : aucun, ses documents viennent après. Exercice modifié : les siens. Ligne de séance
>   planifiée reprise : ses copies (#296) ; ligne qui naît : les documents de son exercice source.
> - **Ce qui ne se contrôle pas** : ce que le serveur écrit seul — séance instanciée depuis un
>   modèle, copie de semaine (#4). Les refuser bloquerait le coach sur une donnée qu'il n'a pas
>   envoyée.
> - **Aucune reprise de données** : la base preview ne contenait aucune référence étrangère au
>   2026-10-05, ni en bibliothèque ni en séances planifiées.

---

## Post-MVP — Dosage ajusté pour un athlète ([#518](https://github.com/Cimavia/cimavia/issues/518))

> **Tranché en [#518](https://github.com/Cimavia/cimavia/issues/518)** (une mécanique, paramétrée
> par le niveau) : le panneau de séance planifiée édite le dosage de chaque exercice pour UN
> athlète, une semaine. L'issue tranchait `baselineAdjustments` ; ce qui suit l'a été en route.
>
> - **Les gestes vivent dans `@cmv/shared`** (`dosage-edit.util`), paramétrés par un
>   `DosageScope` : le niveau qui édite et la référence des marqueurs (`[]` au niveau séance,
>   `baselineAdjustments` au niveau planifié). Le constructeur de séance et le panneau les
>   appellent tous deux ; `DosageEditor` est la grille qu'ils partagent.
> - **`markAdjusted` remplace un marqueur EN PLACE** au lieu de le retirer puis de l'ajouter en
>   fin de liste : toucher puis revenir rend la liste à l'identique, sans quoi l'écran se croirait
>   modifié (#327).
> - **Changement de règle : ce qui est absent de la référence ne porte aucun marqueur.** Un bloc
>   absent de la référence voyait jusqu'ici tous ses paramètres marqués au niveau séance. Il n'y a
>   rien à quoi revenir : le marqueur promettait un « Revenir au défaut » sans défaut. C'est ce qui
>   laisse nu un exercice ajouté dans le panneau — référence `[]` côté écran, son propre dosage
>   côté serveur, et ajusté pour personne.
> - **Un marqueur d'un niveau PRÉCÉDENT n'offre pas d'y revenir** : le rond vu depuis la séance
>   planifiée dit seulement « séance », la valeur EST la référence de ce niveau. Un carré donne la
>   valeur de la séance comme défaut (« séance +12 kg »), pas celle de la bibliothèque, que le
>   snapshot ne lit jamais.
> - **Le nom complet, pas le prénom** (« 1 ajusté pour Léa Bonnet ») : aucun champ prénom
>   n'existe, et le découper d'un nom libre se tromperait. Même libellé que le titre du cycle
>   (`useAthleteLabel`) ; « l'athlète » tant qu'aucun destinataire n'est choisi.
> - **Le verrou se vérifie contre la référence STOCKÉE** des lignes reprises, et `blocks` omis est
>   refusé — omis, il viderait le dosage. Le message nomme le niveau (« Structure verrouillée au
>   niveau séance planifiée »). `baselineAdjustments` envoyé par le client est refusé (400) : il
>   déplacerait la référence.
> - **Les métriques maison figées d'abord** : une ligne diffusée lit les définitions de son
>   snapshot, seule une ligne ajoutée dans le panneau lit celles de la bibliothèque.
> - **« Voir la séance-type » est un lien simple, dans un autre onglet** : la saisie du panneau
>   n'y risque rien, et il n'apparaît que si `sourceSessionId` subsiste (`SetNull`).
> - **Le mobile ne change pas** : l'athlète lit `blocks`, les marqueurs sont l'affaire du coach.
> - **Reprise de données** : `baselineAdjustments = adjustments` à la migration, aucun écran
>   n'ayant encore écrit de marqueur `SCHEDULED`.
> - **[#370](https://github.com/Cimavia/cimavia/issues/370) est livrée en préalable** :
>   `useComposition`, `CompositionEditor` et `ExercisePicker` n'avaient plus que ce panneau pour
>   client, et sont passés dans `feature/plan`, sans préfixe ni recherche.

---

## Post-MVP — La séance par blocs ([#714](https://github.com/Cimavia/cimavia/issues/714))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| BL-1 | **Les deux modèles de séance cohabitent** sur les mêmes lignes `SessionExercise` et `ScheduledSessionExercise` (*expand*, #716) : enregistrer une séance par exercices efface ses blocs — séance-type comme séance planifiée —, et l'inverse. #723 rejoue donc la reprise sur les lignes restées sans bloc avant de retirer l'ancien modèle. L'ancienne liste `exercises` montre chaque entrée ajoutée par la reprise — une étape de circuit, de libre ou d'AMRAP — comme un exercice sans dosage, et le décompte du débrief (`trackingSummary`) ne lit que l'ancien suivi : celui par bloc se lit chez le Coach avec #722. Sans effet tant que l'épic se promeut d'un bloc, #715 à #723 ensemble. | 🟡 | [#723](https://github.com/Cimavia/cimavia/issues/723) *(le retrait de l'ancien modèle)* |
| BL-2 | **L'unicité du nom d'une structure n'a pas d'index** : le service relit les noms du Coach avant d'écrire (`takenStructureName`, sans tenir compte des majuscules) et refuse un doublon d'un 409 `STRUCTURE_NAME_TAKEN`, mais deux enregistrements simultanés du même nom passent tous deux. Prisma ne déclare pas d'index sur `lower(name)`, il faudrait une migration SQL à la main. Pris en #717. | 🟢 | — *(déclencheur : un doublon constaté — il faut deux onglets du même Coach, enregistrés à la même milliseconde)* |

> **Tranché en [#715](https://github.com/Cimavia/cimavia/issues/715)** (les règles de
> `docs/maquettes/composants/structure_model.js` passent dans `@cmv/shared`, typées) : structure,
> bloc de séance et leurs règles pures, sans écran ni API. Ce qui suit a été tranché en route.
>
> - **La maquette fait foi contre le texte de l'issue.** L'ordre des exercices se demande avec un
>   bip OU un cycle (pas seulement un bip), et un bip ou un cycle grise aussi « autant que
>   possible », « une seule fois » et les deux repos — le texte de l'issue n'en citait qu'une
>   partie. Le schéma refuse toute valeur posée sur un réglage grisé (`settingsIssues`).
> - **Les durées sont des secondes entières**, rendues par `formatTrainingDuration` (*Tranché en
>   #528*) : L-1 n'est pas aggravée. Les nombres en lettres de `suiviNote` passent en chiffres.
> - **Rien de ce qui se déduit n'est stocké** : la lettre du bloc (A… Z, puis AA… jusqu'à 30
>   blocs), les codes A1, A2…, la disposition de la grille (ligne, tableau, cartes) et le chrono.
> - **La grille perd `collapsed`** : une grille dont toutes les lignes sont identiques se LIT en une
>   ligne (`gridReading`), elle ne se replie pas.
> - **Le suivi d'un « autant que possible » est une seule case, « Bloc fait »** : son nombre de
>   tours n'est pas noté. À reporter dans la reprise des données de #716.
> - **Une case cochée se désigne par sa rangée et la CLÉ de son exercice** (`{ row, key }`, `key`
>   à `null` pour « Bloc fait »), pas par sa position à plat : le suivi reste ouvert pendant que le
>   Coach ajoute, retire ou remplace un exercice, et une coche ne doit pas glisser sur un autre — la
>   garantie que l'ancien suivi tenait par exercice (#311). Une coche que le bloc n'a plus est
>   ignorée à la lecture (`tickedRows`) et refusée à l'envoi (`trackingFitsBlock`).
> - **La composition se lit sur l'ORIGINE portée par la donnée** (`RECEIVED | ADDED |
>   REPLACEMENT{replacesKey}`), pas sur une comparaison de listes : chaque exercice a une `key`
>   stable, unique dans la séance. Composition et valeurs se comptent chacune de son côté
>   (`plannedChanges`). Un ajout n'a aucune place dans la référence, même si sa clé en rappelle
>   une ; une place n'est gardée ou remplacée qu'une fois (`referencePlaceOf`). Les cellules se
>   comparent TOUR PAR TOUR, sur les tours (ou passages) de l'exercice dans le bloc planifié :
>   `rowIndex` est le rang du tour, pas d'une ligne de la grille planifiée. Des deux côtés, la
>   dernière ligne vaut pour les tours suivants, donc une ligne retouchée compte sur chaque tour où
>   elle vaut. Un tour retiré ne compte que dans les tours du bloc, et une grille planifiée sans
>   ligne compte chaque cellule de la référence comme vidée. Regrouper ces cellules par colonne
>   pour le compte « n ajustés » est l'affaire de Dosage (#720). Qu'un exercice
>   nouveau — ajout ou remplaçant — reçoive une clé ABSENTE de la séance-type ne se voit qu'avec
>   elle : l'API des blocs (#716) le vérifie, sans quoi un retrait et un remplacement
>   partageraient la même clé.
> - **Le bloc garde ses réglages copiés** (`copiedSettings`) et son origine, structure du Coach
>   (`sourceStructureId`) OU structure prête (`sourcePreset`), jamais les deux : « Personnalisé »
>   et « Revenir à … » en dépendent, même une fois la structure supprimée. Impacte #716. Le
>   schéma ne confronte pas `copiedSettings` aux exercices du bloc : ce ne sont pas les réglages
>   en vigueur. Le geste « Revenir à … » (#720) vérifie `roundsError` et `gridRowLimit` avant de
>   les restaurer.
> - **Un chrono qui tourne déjà — compte à rebours d'un « autant que possible », chrono d'une
>   limite — ne lance pas les repos**, comme dans la maquette (`timerOf`) : le repos se prend dans
>   le temps qui court, et un second décompte lui ferait concurrence. La phrase du bloc les annonce
>   quand même, c'est une consigne.
> - **Bornes** : 30 blocs par séance, 20 exercices par bloc, 50 par séance (`SESSION_MAX_EXERCISES`,
>   *Tranché en #297*), 99 tours, 12 métriques par grille ; le suivi d'un bloc tient donc en
>   `BLOCK_MAX_CHECKS` = 99 × 20 = 1 980 cases, bornées à l'entrée seulement (*Tranché en #297*).
>   Chaque durée d'un réglage va de 1 s à 3 h, comme dans la maquette, et non 24 h comme les durées
>   d'entraînement. Une grille n'a pas plus de lignes que son exercice n'a de tours ; avec « un
>   seul par… », de passages, les premiers exercices passant une fois de plus quand le compte ne
>   tombe pas juste (`gridRowLimit`).
> - **Une valeur sans colonne est refusée par le schéma de la grille, à sa cellule**
>   (`rows.<i>.values.<colonne>`), là où l'ancienne grille la tolérait pour la signaler à part
>   (`orphanValueIssues`) : le modèle par blocs n'a pas de données stockées à ménager, et l'éditeur
>   (#720) retire les valeurs avec leur colonne.
> - **La valeur d'une cellule n'est pas encore confrontée au type de sa colonne** : il faut les
>   métriques du Coach, que seul le serveur charge. Ce contrôle vient avec l'API des blocs (#716),
>   en reprenant celui de l'ancienne grille (`validateBlockValues`).
> - **Laissés aux issues des écrans** : `doseCols`, `doseLines`, `lineIn`, `weekChoices`, `fill`,
>   `fillPreview`, `addStep` et `stepError` (#720, #721, #724).
> - **La grille par blocs emprunte à l'ancien modèle** `MetricSource`, `fittingColumnCount`, les
>   formes de métrique (`catalogMetricShape`, `customMetricShape`, `metricUnitRefinement`) et ses
>   bornes de colonnes : ils déménagent avec son retrait (#723). Les aides de libellé
>   (`metricLabel`, `metricCellText`…) prennent une `GridMetric`, où une colonne de l'ancienne
>   grille se range aussi.
> - **Les réponses des réglages vivent dans un module à part** (`structure-answer.schema`) : le
>   schéma de structure lit les règles des réglages, qui lisent ces réponses — réunis, les deux
>   modules s'importaient l'un l'autre.
>
> **Tranché en [#716](https://github.com/Cimavia/cimavia/issues/716)** (tables, routes et reprise
> des données ; aucun écran). Ce qui suit a été tranché en route.
>
> - **Pas de colonne `adjustments` sur les blocs** : une valeur ajustée se lit par comparaison à la
>   référence (`plannedChanges`), comme #715 l'a posé. Les deux tables de blocs portent en plus
>   `sourcePreset` et `copiedSettings`, que l'issue ne citait pas.
> - **Le client ne choisit aucune clé primaire** : un bloc envoyé naît sous un identifiant neuf,
>   le sien ne sert qu'à distinguer les blocs dans l'envoi. Les exercices gardent leur `key`,
>   la seule identité que la séance planifiée recopie.
> - **Ce qu'une séance cite déjà ne se revérifie pas** : un exercice repris sous la même clé, une
>   structure déjà citée, une colonne maison orpheline déjà présente (EX-2). Sans quoi le
>   rédacteur d'une séance ouverte (#605) ne pourrait plus l'enregistrer : il ne lit pas les
>   structures de son propriétaire, ni l'exercice dont le droit a disparu depuis. Le neuf passe le
>   contrôle d'accès et le type de chaque cellule (`gridValueIssues`), contre les métriques du
>   propriétaire de l'exercice et de la séance.
> - **Une origine que l'acteur ne lit pas s'écrit nulle, sans 400** (`withReadableOrigins`).
>   Supprimer une structure retire l'origine des blocs (`SetNull`) sans avancer la version de
>   leurs séances : un builder ouvert avant la renvoie, et un refus ne lui laisserait aucune issue.
>   L'origine n'est qu'une trace — le bloc garde sa copie des réglages —, et l'écrire nulle rend
>   l'état que la base aurait de toute façon, sans rien dire d'une structure qu'on ne lit pas.
> - **Le compteur « Séances » d'une structure** compte les séances-types, scopées au Coach — celles
>   d'un autre Coach où il a employé sa structure comprises —, une séance une fois quels que soient
>   ses blocs. Les séances planifiées n'y comptent pas.
> - **Le suivi par bloc remonte avec le débrief** (`blockTracking`), indexé par identifiant de bloc
>   planifié : un bloc que l'envoi ne cite pas garde son suivi, `null` le remet à NON SUIVI. Une
>   case absente du bloc est refusée (`trackingFitsBlock`).
> - **Le verrou du niveau planifié est livré pur** (`plannedLockIssues`) : aucune route de #716
>   n'écrit un bloc planifié, #720 et #721 le brancheront. Verrouillés : le nombre de blocs, leur
>   nom, les réponses des réglages (`settingsShape`, pas leurs nombres), l'ordre RELATIF des
>   exercices reçus et leurs colonnes. Un ajout ou un remplaçant se glisse où il veut, avec ses
>   colonnes. Le texte de l'issue (« l'ordre des exercices ») se lit comme le réglage `order` plus
>   cet ordre relatif.
> - **Un exercice nouveau prend une clé que la séance-type n'a pas** (`takenKeys`), contre les clés
>   de la référence ET de la séance-type courante : c'est le point que #715 renvoyait à l'API des
>   blocs, branché avec le verrou.
> - **La reprise est une migration à part, d'écritures seules, rejouable** : seules les lignes
>   sans bloc sont reprises, et l'ancien modèle reste intact jusqu'à #723 (BL-1). Un e2e la rejoue
>   deux fois sur des lignes de l'ancien modèle. Ses règles :
>   - Séries et Circuit deviennent « Séries », EMOM un bip, AMRAP « autant que possible », Libre
>     « une seule fois » ;
>   - un Circuit, un Libre ou un AMRAP à plusieurs lignes donne **une entrée par étape** : le bloc
>     porte autant de fois l'exercice, une ligne chacun. La note ne va qu'à la première ; une ligne
>     planifiée ajoutée recopie tags et documents (même clé objet), et sa consigne cite les copies ;
>   - un exercice **sans ancien bloc** devient un bloc « Libre » à grille vide, plutôt que de
>     disparaître de la séance ;
>   - côté planifié, tout exercice repris est **reçu** : l'ancienne donnée ne dit pas ce qui a été
>     ajouté, et le déduire contredirait l'origine portée par la donnée ;
>   - ce qui ne tient plus est ramené dans les bornes : `collapsed` retiré, un repos de 0 s devient
>     `null`, une durée tient entre 1 s et 3 h, des tours entre 1 et 99, une grille de Séries ou
>     d'EMOM n'a pas plus de lignes que de tours, une valeur vide ou sans colonne se perd ;
>   - l'objectif de tours d'un AMRAP, sans champ dans le nouveau modèle, passe dans la consigne
>     du bloc (« Objectif : 5 tours ») ;
>   - le suivi se réindexe sur les cases du nouveau bloc : une série, un bip, un tour par exercice,
>     une étape par entrée, et « Bloc fait » pour un AMRAP qui comptait au moins un tour ;
>   - les métriques suggérées d'un exercice sont l'union ordonnée des colonnes de ses anciens
>     blocs, sans doublon, 12 au plus.
>
>   Une entrée par étape peut faire dépasser 20 exercices à un bloc, ou 50 à une séance
>   (`SESSION_MAX_EXERCISES`) : ils se lisent, mais ne s'enregistrent plus sans être réduits. La
>   requête de contrôle « après » compte les deux sur la preview.

> **Tranché en [#717](https://github.com/Cimavia/cimavia/issues/717)** (Bibliothèque › Structures,
> web seul : l'onglet, et la page d'une structure du Coach). Ce qui suit a été tranché en route.
>
> - **Le nom est unique par Coach, sans tenir compte des majuscules** (`sameStructureName` : bords
>   rognés, casse ignorée, accents gardés). La règle est écrite une fois dans `@cmv/shared` : le
>   formulaire prévient avant d'envoyer, le service refuse d'un 409 dédié — sans index (BL-2). Le
>   même nom chez un autre Coach ne gêne pas.
> - **L'ordre des exercices n'est pas dans le formulaire de la bibliothèque** : il n'a de sens qu'à
>   partir de deux exercices, dans le panneau du bloc (#719). Une structure copiée garde le sien.
> - **Les durées s'écrivent comme partout ailleurs** (*Tranché en #528*) : la maquette annonce
>   « 1 h 20 », que `parseTrainingDuration` ne lit pas — on écrit `80'`. Bornes de 1 s à 3 h et de 1
>   à 99 tours, refusées à la saisie (#566) plutôt qu'à l'enregistrement.
> - **Le menu ⋯ d'une ligne devient deux actions directes**, Dupliquer et Supprimer (avec sa
>   confirmation) : le design system n'a pas de menu, et en créer un pour deux gestes ne se justifie
>   pas. **« Dupliquer pour l'adapter » d'une structure prête reste visible**, quand la maquette ne
>   le montre qu'au survol : une tablette ne survole pas, et c'est le seul geste de la ligne.
> - **Dupliquer ouvre la création pré-remplie** (`/library/structures/new?from=`), pas une copie
>   enregistrée d'office : « Tabata (copie) », numérotée si le nom est pris, et rognée pour tenir
>   en 60 caractères. Quitter sans enregistrer ne perd rien — la source reste.
> - **L'onglet de la bibliothèque tient dans l'URL** (`?tab=`) : chaque constructeur ramène à celui
>   d'où il vient, séances comprises.
> - **La légende du Déroulé est une donnée de `@cmv/shared`** (`structureTimeline`), pas des
>   `Phrase` : chaque clé citée par `@cmv/shared` doit exister aussi au catalogue mobile, qui n'a
>   pas cet écran.
> - **Le mobile reste en l'état** : la bibliothèque y est absente, la création reste web et coach
>   (*Tranché en #20*).
