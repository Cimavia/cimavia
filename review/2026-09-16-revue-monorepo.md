# Revue du monorepo cimavia — 2026-09-15/16

Audit de l'**existant** (pas du diff en cours), au commit `43d6108`, arbre propre. Aucun fichier de
production n'a été modifié pendant la revue.

## Comment lire ce document

Chaque constat est écrit pour devenir une **issue** telle quelle : le titre donne le fichier et la
ligne, `Constat` dit ce qui est, `Pourquoi` donne le scénario concret qui mord (c'est ce qui justifie
la priorité), `Piste` la direction de correction, `Vérifié` ce qui a été réellement contrôlé — et,
quand il y en a, la ligne de `docs/dette-technique.md` que le code dément.

Sévérités : **S1** bug ou faille qui mord en production · **S2** écart à une règle dure de
`CLAUDE.md` ou risque de régression · **S3** qualité (duplication, complexité, couverture, dette non
consignée) · **S4** confort. Les S1 et S2 sont détaillés ; les S3 et S4 sont condensés en une ligne
qui porte tout de même le lieu, l'effet et la piste.

**Méthode** : passe outillée d'abord (porte qualité, API SonarCloud, couverture lcov, marqueurs du
dépôt), puis 12 lots de 4 à 6 k lignes relus un par un, dont deux lots transverses — duplication
inter-paquets web ↔ mobile ↔ `@cmv/shared`, et cohérence des contrats DTO ↔ appelants. Un constat non
vérifié n'a pas été retenu : le taux de faux positifs décide si la prochaine revue sera lue. Ce qui
n'a pas pu être confirmé est dit en fin de document, pas tu.

## Synthèse chiffrée

| Mesure | Valeur |
|---|---|
| Porte qualité | ✅ `biome ci` (877 fichiers) · ✅ `turbo typecheck test` (187 fichiers de test) · ✅ `check:i18n --strict` |
| E2E | ❌ non lancés (docker requis — à la main) |
| Sonar gate | OK (« Sonar way » ; `new_coverage`/duplication muettes : 0 ligne neuve depuis 1.2.2) |
| Sonar global | 37 392 ncloc · couverture **68,4 %** · duplication 0,8 % · 0 bug · 1 vulnérabilité (nginx root, Q-2) · 42 smells · 0 hotspot |
| Couverture locale | shared 92,8 % · mobile 60,6 % · web 55,2 % · API unitaire 11,9 % (l'e2e porte ~89 %) |
| Marqueurs | 0 `MOCKED` · 0 TODO/FIXME · 9 `biome-ignore` justifiés · 0 `#xxxxxx` hors tokens · 5 `as unknown as` en prod |
| Lots | 12, tous rendus : API-A · API-B · infra-sécurité · shared-dto · shared-logic · mobile-core · mobile-reste · web-library · web-plan · web-comms · web-shell · transverses (duplication inter-paquets + contrats) |
| Constats | **18 S1 · 41 S2 · 33 S3 · 9 S4** |

Sonar, issues ouvertes par règle (43) : S6479 index en key ×6 · S6759 props readonly ×5 · S3863 import
dupliqué ×4 · S7763 export…from ×4 · S4084 track média ×4 (biome-ignore justifiés) · S8786 regex à
backtracking ×3 · reste ≤ 2. Les trois plus parlantes : S8786 sur les deux mailers et
`ForgotPasswordScreen` ; S6478 composant défini dans `app/(app)/_layout.tsx` ; S6471 nginx root (Q-2).

## S1 — bug ou faille qui mord en prod

### API (NestJS)

[S1] apps/api/src/feedback/service/feedback-media.service.ts:123 — le rattachement accepte n'importe quelle clé objet : lecture et suppression des fichiers d'un autre tenant
  Constat : 4 rattachements enregistrent le `storagePath` du client sans le confronter au préfixe
            du tenant : `FeedbackMediaService.attach` (l.123), `MessageService.send`
            (message.service.ts:201), `ExerciseDocumentService.attach` (l.49),
            `InvoiceService.attachDocument` (l.238). Schémas : `z.string().min(1)`. `assertOwnedKey`
            ne garde que complete/abort multipart. Les suppressions suivent la ligne (`remove` l.151,
            remplacement du PDF de facture l.245), les mappers signent un GET dessus.
  Pourquoi : la clé est lisible dans toute URL signée. Athlète A1 lit la clé d'un document du coach
            dans une séance diffusée → `POST …/feedback/media {type:IMAGE, storagePath:<clé>}` → 201
            → `DELETE …/media/:id` → le fichier disparaît de la bibliothèque et de toutes les séances
            qui le copient. Symétrique côté coach. Variante lecture : un ex-partenaire ré-attache la
            clé et obtient une URL neuve à volonté. `type`/`size` non liés au ticket : contourne aussi
            le plafond de 10 vidéos. Le commentaire l.90 et l'e2e l.2436 affirment le contraire.
  Piste   : `assertKeyUnder(prefix, key)` unique dans `infra/storage`, préfixe recalculé côté serveur,
            appelé par les 4 ; e2e « clé d'un autre tenant → 403 » par route.
  Vérifié : relu par moi (attach sans garde, remove sans condition). Trouvé indépendamment par 3 lots.
            Dette : rien (grep storagePath, préfixe, clé). Non rejoué contre une API réelle.

[S1] apps/api/src/app.module.ts:69 — Pino journalise tous les en-têtes : cookie de session et secret du tick en clair dans les logs
  Constat : `pinoHttp: { level, transport, autoLogging: true }` sans `redact` ni `serializers` ; le
            sérialiseur `req` par défaut recopie `req.headers`.
  Pourquoi : chaque requête authentifiée écrit un cookie Better Auth rejouable (stdout du NAS, Axiom
            dès `AXIOM_TOKEN` posé) ; `x-cimavia-tick-secret` fuit à chaque tick ;
            `DELETE /me/push-tokens/:token` met le token dans l'URL journalisée.
  Piste   : `redact` sur `req.headers.cookie`, `authorization`, `x-cimavia-tick-secret`,
            `res.headers["set-cookie"]` (ou sérialiseur réduit à method/url/id) + test de config.
  Vérifié : relu par moi (aucun redact dans apps/api/src) ; sortie reproduite par script (lot API-B).
            Dette l.1562 ne couvre que Sentry.

[S1] apps/api/src/reminder/service/reminder.service.ts:153 — un rappel repoussé après avoir été poussé ne l'est plus jamais
  Constat : un changement de `dueAt` remet `readAt` à null mais pas `pushedAt` ; le tick ne
            sélectionne que `pushedAt: null` (reminder-tick.service.ts:159).
  Pourquoi : parcours normal (#105) : rappel dû → push → « Repousser → demain » → le lendemain, aucun
            push. La règle « nouvelle échéance = nouvelle occurrence » (dette l.577) vaut pour les deux.
  Piste   : `{ dueAt, readAt: null, pushedAt: null }` + e2e tick → PATCH → tick.
  Vérifié : relu par moi ; `pushedAt` écrit une seule fois (tick l.187) ; Snooze passe bien par `update`.

[S1] apps/api/src/plan/service/scheduled-session.service.ts:130 — enregistrer une séance planifiée casse ses images de consigne (et perd ses documents si l'exercice source a été supprimé)
  Constat : `update` reprend les documents en BIBLIOTHÈQUE (`loadSourceDocuments` via
            `sourceExerciseId`), alors que le client renvoie la consigne de l'INSTANCE, dont les
            `mediaId` sont les ids des copies C1. La transaction supprime C1 en cascade, crée C2 depuis
            la bibliothèque, et `remapImageMediaIds` (writer l.180) ne remappe que bibliothèque → C2 :
            la consigne garde C1, supprimé.
  Pourquoi : le coach retouche une note d'une séance diffusée → chez l'athlète, l'image disparaît sans
            message. Exercice de bibliothèque supprimé entre-temps (`sourceExerciseId` null) → toutes
            les pièces jointes perdues, objet S3 orphelin.
  Piste   : reprendre les documents de la ligne précédente (comme `tracking`/`baseline` dans `carried`) ;
            n'aller en bibliothèque que pour un exercice nouveau ; e2e PUT → chaque `mediaId` ∈ `documents[].id`.
  Vérifié : moi — `idByOldId` n'est construit que depuis la bibliothèque ; lot API-A — `node` sur
            `remapImageMediaIds`, client web qui envoie la consigne de la copie, seul e2e d'images
            (l.1209-1243) en création.

### @cmv/shared

[S1] packages/shared/src/dto/session.schema.ts:34 — tableaux d'exercices sans `.max()` : une requête d'1 Mio fait écrire des Go
  Constat : `exercises` de create/update session (l.34, 43) et de séance planifiée (plan.schema.ts:150,
            168, 184) sans plafond, alors que `weeks` est borné « pour borner le coût ».
            `replaceExercises` (session.service.ts:183) parse et recopie DEUX fois (`blocks`,
            `baseline`) les blocs de l'exercice pour chaque ligne, puis un seul `createMany`.
  Pourquoi : inscription libre en coach → `POST /exercises` de ~536 Ko (passe le schéma) →
            `POST /sessions` avec le même `exerciseId` répété ~24 000 fois (< 1 Mio) → event loop bloqué
            dans le `map`, ~26 Go de JSON à construire → OOM, API tombée pour tous les tenants.
  Piste   : `SESSION_MAX_EXERCISES` en `.max()` sur les 4 tableaux ; parser une fois par exercice distinct.
  Vérifié : relu par moi (map + double copie). Coût mesuré par script au niveau schéma (lot DTO) ;
            seuil d'OOM réel non mesuré (dépend de la mémoire du conteneur).

### Web

[S1] apps/web/src/feature/library/component/GridCell.tsx:55 — impossible de taper une décimale : « 12,5 » kg devient 125
  Constat : `NumberCell` est contrôlé par la valeur NUMÉRIQUE (`String(value)`). « 12, » donne
            `Number("12.") = 12`, fini → `onChange(12)` → l'input se re-rend « 12 » : le séparateur
            est effacé avant la frappe suivante, et « 5 » donne 125.
  Pourquoi : charge (2,5 kg de lest), RPE 7,5, distance 1,5 km, %RM, et toute métrique maison NUMBER.
            La grille, l'aperçu et la séance diffusée affichent 125 kg sans le moindre signal. Trois
            appelants : BlockGrid, SessionBlockGrid, CollapsedColumns.
  Piste   : le patron de `DurationCell` juste en dessous — texte local pendant la frappe, parse au
            blur/Entrée ; test userEvent « 12,5 » → 12.5.
  Vérifié : moi — composant relu ; lot web-library — sonde userEvent (`12.5`→125, `0.5`→5), aucun
            test de GridCell, rien dans la dette.

[S1] apps/web/src/feature/library/hook/useSessionDraft.ts:257 — « Recharger » UN exercice écrase les modifications non enregistrées de TOUS les autres
  Constat : `applyReloaded` parcourt TOUS les items et remplace `blocks`, `baseline` et `adjustments`
            par la version serveur dès que l'id figure dans la réponse — or la réponse est la séance
            entière, tandis que `POST …/exercises/:id/reload` ne réécrit qu'une ligne.
  Pourquoi : le coach passe Tractions de 4 à 5 séries (non enregistré), puis recharge Gainage : les
            ajustements de Tractions disparaissent, marqueurs compris, alors que la confirmation ne
            parlait que de Gainage.
  Piste   : ne remplacer que `item.id === sessionExerciseId` ; test du hook avec deux items.
  Vérifié : moi — `map` sur `current` relu ; lot web-library — seul appelant SessionBuilderScreen.tsx:239,
            hook à 0 %, rien dans la dette.

[S1] apps/web/src/feature/athlete/component/AthleteSheetPanel.tsx:31 — la fiche athlète s'écrase par une chaîne vide quand sa lecture échoue
  Constat : `value = content ?? sheet?.content ?? ""` ; seul `isPending` est regardé, pas `isError` ;
            « Enregistrer » reste actif pendant le chargement ; `PUT /athletes/:id/sheet` REMPLACE.
  Pourquoi : le GET prend une 502 du tunnel → champ vide → le coach croit la fiche vierge, écrit et
            enregistre → des mois de notes perdues, sans historique. Règle dure n°5. Le jumeau mobile
            (`AthleteSheetScreen.tsx:87-107`) refuse l'édition tant que `isPending || isError`.
  Piste   : ne rendre le formulaire et le bouton qu'après succès ; `CmvErrorState` + retry sur `isError`.
  Vérifié : moi — expression relue ; lot web-plan — montage DashboardScreen.tsx:294 et FeedbacksScreen.tsx:142, aucun test.

[S1] apps/web/src/feature/library/hook/useSaveExercise.ts:76 — un échec après la création crée un DOUBLON d'exercice à chaque « réessayer »
  Constat : la mutation crée l'exercice, PUIS envoie fichiers, liens et images. Si une étape suivante
            rejette, `saved.id` est perdu : le brouillon garde `exercise == null` et « réessayer »
            rappelle `createExercise` en renvoyant toutes les pièces jointes.
  Pourquoi : déclencheur banal — `z.url()` refuse `youtube.com/watch?v=1` collé sans schéma → 400 après
            création. Chaque tentative ajoute un exercice et duplique ses PDF (invisible 60 s :
            l'invalidation n'est qu'en `onSuccess`).
  Piste   : basculer le brouillon en édition dès le temps 1 réussi ; retirer les éléments déjà
            rattachés ; valider le lien avec le schéma partagé ; invalider en `onSettled`.
  Vérifié : lot web-library — sonde Zod, aucun test du hook, pas d'unicité en base, dette : seul P2-1 (#72), cas différent.

[S1] apps/web/src/feature/library/component/GridCell.tsx:114 — Entrée dans une cellule DURÉE de la dernière ligne efface la durée tapée
  Constat : le même `keydown` fait `commit()` puis `onCommitLine()` → `addRow()`, qui reconstruit les
            lignes depuis le `block` de la closure, AVANT la valeur commise : la seconde écriture,
            batchée, remplace la première.
  Pourquoi : c'est le geste que l'écran enseigne (« Entrée → valide et crée la ligne suivante »).
            Le repos « 2:30 » disparaît, et côté séance un marqueur d'ajustement reste posé sur une
            cellule revenue à sa valeur.
  Piste   : `addRow` dérivé de l'état courant, ou `onCommitLine(value)` qui insère avec la valeur.
  Vérifié : lot web-library — sonde userEvent (`2:30{Enter}` → repos perdu), aucun test.

[S1] apps/web/src/feature/library/component/LibraryPicker.tsx:77 — « Créer l'exercice manquant » jette la séance en cours
  Constat : `navigate({ to: "/library/exercises/new" })` dans le MÊME onglet, sans `draft.submit()`,
            alors que la doc du composant (l.27-29) promet le contraire et que « Dupliquer en variante »
            enregistre d'abord pour cette raison.
  Pourquoi : le coach compose une séance (titre, 4 exercices, charges ajustées), ne trouve pas
            « gainage », clique « Créer l'exercice » → séance entière perdue. C'est le chemin que
            l'écran met en avant sur une recherche vide.
  Piste   : enregistrer puis naviguer avec un retour vers la séance, ou ouvrir dans un nouvel onglet ;
            corriger la doc dans tous les cas.
  Vérifié : lot web-library — seul appelant SessionBuilderScreen.tsx:251, composant à 0 %.

[S1] apps/web/src/feature/feedback/screen/AthleteFeedbackScreen.tsx:138 — joindre un premier média efface le texte du débrief en cours de frappe
  Constat : `setContent(feedback?.content ?? "")` se rejoue dès que `feedback?.id` change. Sur une
            séance jamais débriefée, l'id passe de `null` à `fb-x` quand le rattachement crée le
            débrief côté API, et chaque fichier invalide `myFeedbackKeys.detail`.
  Pourquoi : ordre naturel de l'écran — l'athlète écrit son ressenti, joint une vidéo avant
            « Envoyer », et tout son texte disparaît à la fin du premier fichier, sans erreur.
  Piste   : ne réinitialiser que si le champ n'a pas été modifié ; test « écrire puis joindre ».
  Vérifié : lot web-comms — `feedback-media.service.ts:109`, invalidation `useMyFeedbackMedia.ts:42`,
            aucun test ne change l'id. Même motif sur mobile (`FeedbackTextSection.tsx:42`).

[S1] apps/web/src/feature/message/hook/useMessages.ts:61 — le polling re-signe les URLs toutes les 10 s : une note vocale en lecture est coupée, les photos re-téléchargées
  Constat : `listMessages` re-signe chaque média à chaque lecture (`message.mapper.ts:27`) ;
            `refetchInterval` à 10 s ignore le `staleTime` ; `MessageBubble` réécrit alors `src` sur
            `<audio>`/`<video>`, `ImageMessage` sur `<img>`.
  Pourquoi : changer `src` relance le chargement : une note vocale de 2 min se coupe au plus tard 10 s
            après le lancement ; un fil de 20 photos les retélécharge toutes les 10 s.
  Piste   : garder la première URL par `message.id` et ne la remplacer que quand `isSignedUrlUsable`
            (@cmv/shared, déjà utilisé par le mobile) la dit périmée.
  Vérifié : lot web-comms — aucun mémo sur la bulle, aucun test de stabilité de `src` ; V-2 et #151
            traitent l'URL périmée à l'ouverture, pas l'URL valide remplacée.

[S1] apps/web/src/feature/message/component/MessageThread.tsx:47 — un 2e message arrivé avant le poll suivant n'est jamais marqué lu, et coupe le push des suivants
  Constat : le marquage dépend d'un booléen (`hasIncomingUnread`), donc d'un passage false→true ;
            `markRead` n'invalide que la liste des fils, donc `readAt` de m1 reste `null` en cache.
  Pourquoi : deux messages à 5 s d'intervalle, fil ouvert → la pastille « 1 » reste allumée ; et
            `MessageService.send` ne notifie que si `unreadFromMe === 0` : le message suivant de
            l'athlète, une heure plus tard, ne produit ni push ni e-mail.
  Piste   : déclencher sur l'id du dernier entrant non lu ; test « second entrant après marquage ».
  Vérifié : lot web-comms — `message.service.ts:101` et `:67-83` ; même code sur mobile
            (`ConversationThread.tsx:77-84`), dont le test ne vérifie qu'« appelé une fois ».

### Mobile

[S1] apps/mobile/feature/plan/screen/SessionDetailScreen.tsx:58 — après une mise en veille, le rattrapage du déroulé ne garde que la DERNIÈRE unité cochée
  Constat : le rappel du déroulé appelle `local.checkUnit`, qui lit le `tracking` du dernier rendu ;
            la boucle de rattrapage de `useSegmentRunner` (l.79-92) appelle `markUnit` plusieurs fois
            dans le même tic ; chaque `persist` repart de la même base et écrase le précédent.
  Pourquoi : « Gainage 3 × 30 s, repos 30 s », téléphone rangé puis rouvert à la fin → séries 1 et 2
            perdues, le débrief (#168) remonte 1/3. C'est exactement le cas que le rattrapage sert.
  Piste   : `setCached(prev => …)` fonctionnel (et écriture disque depuis la valeur fonctionnelle) ;
            test qui compose déroulé + suivi réel.
  Vérifié : moi — closure sur `tracking`, boucle synchrone ; lot mobile — reproduit sur `checkUnit` de
            dist (`{"checked":[2]}`) ; `useSegmentRunner.test.ts:172` mocke `onUnitDone`.

[S1] apps/mobile/feature/plan/hook/useOfflineDocuments.ts:27 — les documents hors-ligne ne se resynchronisent ni après une retouche de séance, ni après un échec
  Constat : signature `plan.id:plan.updatedAt`, or `PUT /scheduled-sessions/:id` ne touche pas la ligne
            `Plan` (seuls plan.service.ts:135 et :277 l'écrivent) ; `synced` est posé AVANT la passe,
            qui avale ses échecs ; `loadSession` (offline-documents.ts:120) ressert la séance du cache
            dès que ses documents connus sont sur le disque, quel que soit son âge.
  Pourquoi : mercredi, le coach ajoute un PDF et change les charges de jeudi ; jeudi en salle sans
            réseau, l'athlète voit l'ANCIEN déroulé sans le PDF, sans signe de péremption. Une passe
            coupée dans le métro n'est reprise qu'au prochain démarrage à froid. La dette V-2 (l.1132)
            dit le cas couvert.
  Piste   : signature qui voit les écritures de séance ; ne retenir la signature qu'après une passe
            complète ; relancer au retour du réseau ; court-circuit de `loadSession` seulement si le
            cache est plus récent.
  Vérifié : moi — signature et `synced` relus, `plan.update` absent de scheduled-session.service ;
            lot mobile — tests qui mockent passe et réseau, `offline-documents.test.ts:199` fige le court-circuit.

[S1] apps/mobile/feature/coach/hook/useMyCoach.ts:24 — rejoindre un coach n'invalide pas les contreparties : l'onglet Messages n'apparaît pas
  Constat : `useAcceptInvitation` invalide `coachKeys.mine()`, `myPlanKeys.all` et `invitationKeys.all`,
            mais pas `counterpartKeys.mine()`, dont dépend toute la barre d'onglets
            (`requiresCounterpart` → `visibleTabs`). Le web fait un `invalidateQueries()` global et écrit
            pourquoi (« rejoindre change tout ce que l'athlète peut voir »).
  Pourquoi : athlète autonome → `/join` → code → « Aller à ma planification » : le planning se remplit,
            mais la barre lit toujours `{asCoach:false, asAthlete:false}`. `staleTime: 0` ne suffit pas
            (l'entrée est périmée, pas redemandée, et `app/(app)/_layout.tsx` reste monté) : il faut
            mettre l'app en arrière-plan et la rouvrir pour pouvoir écrire à son coach.
  Piste   : aligner sur le web (`invalidateQueries()` global), ou au minimum `counterpartKeys.mine()`.
  Vérifié : moi — les deux hooks comparés côte à côte ; lot mobile-reste — MI-1 (l.1591) ne couvre que la moitié coach.

[S1] apps/mobile/feature/message/hook/useConversation.ts:115 — `useMarkRead` n'invalide pas la liste des fils du coach
  Constat : le mobile n'invalide que `messageKeys.myConversation()` (fil unique de l'athlète) ; la liste
            du coach vit sous `messageKeys.conversations(as)`. Même trou dans `useSendMessage` et
            `useSendMessageMedia`. Le web invalide bien `conversations(as)` dans les deux mutations.
  Pourquoi : le coach ouvre « Léa · 2 », lit, revient : la pastille affiche toujours « 2 », et l'aperçu
            reste antérieur à son propre envoi. `CoachConversationsScreen` n'a pas de refetch au focus
            et le cache persisté a 5 min de `staleTime` : seul le tirer-pour-rafraîchir corrige. Le
            tableau de bord hérite du retard.
  Piste   : invalider `messageKeys.conversations(as)` dans les trois mutations.
  Vérifié : moi — hooks web et mobile comparés ; lot mobile-reste — clés dans `message.api.ts:42`.

## S2 — écart à une règle dure, ou risque de régression

### API (NestJS)

[S2] apps/api/src/plan/service/scheduled-session.service.ts:151 — le replace-all renouvelle les ids d'exercice : le suivi local de l'athlète est perdu sans signal
  Constat : `deleteMany` puis recréation sans reprendre l'`id` (writer l.83) ; `carried` ne sauve que le
            suivi déjà en base. Web et mobile gardent le suivi local indexé par ces ids
            (`useLocalTracking.ts:13` des deux apps) et le local l'emporte ; au débrief,
            `writeTracking` fait `updateMany where id = ancienId` → 0 ligne, 200. Le mobile appelle
            ensuite `local.clear`.
  Pourquoi : l'athlète coche hors réseau à 18 h, le coach corrige une note à 19 h → les coches
            disparaissent, le débrief remonte « non suivi ». Perte silencieuse et définitive. La dette
            l.1236 croit le cas réglé.
  Piste   : garder l'identité des lignes (recréer avec l'id repris, ou mise à jour en place) ; 400 au
            débrief sur un exercice inconnu.
  Vérifié : trouvé indépendamment par les lots API-A et mobile ; aucun test ne change les ids entre deux chargements.

[S2] apps/api/src/plan/service/plan.service.ts:334 — DELETE /plan-weeks/:id contourne le verrou #207 sur un cycle diffusé
  Constat : `deleteWeek` ne teste pas `status` : sur un cycle PUBLISHED, supprime la semaine (débriefs
            en cascade), renumérote et décale toutes les séances suivantes de −7 jours, sans
            notification. Bouton web sans condition (`PlanWeekCard.tsx:156`).
  Pourquoi : #207 refuse de bouger `startDate` après diffusion pour cette raison exacte ; retirer la
            semaine 2 d'un cycle en cours produit ce décalage, séances DONE comprises.
  Piste   : 409 sur PUBLISHED (modèle `assertHeaderWritable`) + e2e.
  Vérifié : lot API-A — seul e2e de la route : le 404 coachB (l.1299).

[S2] apps/api/src/plan/service/scheduled-session.service.ts:288 — supprimer une séance débriefée efface le débrief de l'athlète et laisse ses médias orphelins
  Constat : `delete` et `deleteWeek` ne regardent ni statut ni débrief ; cascade `SessionFeedback` →
            `FeedbackMedia` (schema l.599, 620) ; aucun `deleteObject`.
  Pourquoi : un « Confirmer la suppression » générique détruit texte et vidéos de l'athlète ; jusqu'à
            ~2 Go orphelins. Dette P4 (l.76) et schéma (l.855) affirment l'inverse. Piège n°4.
  Piste   : 409 si un débrief existe, ou purge des médias dans la transaction.
  Vérifié : lot API-A — aucun e2e ; `deleteObject` n'existe que dans FeedbackMediaService.

[S2] apps/api/src/account/service/invitation.service.ts:232 — une invitation reste acceptable après que son émetteur a cessé d'être coach
  Constat : `accept` ne vérifie pas `isCoach` de l'émetteur ; `assertRemovable` ne bloque que sur des
            relations ACTIVE, pas sur les invitations PENDING (7 j, non révocables, dette I-3).
  Pourquoi : un compte essaie coach, invite, repasse athlète seul ; l'invité accepte → lié à un
            non-coach, sans pouvoir rejoindre un autre coach (409), quitter (#74) ni retirer sa
            capacité (409). Règle dure n°1.
  Piste   : refuser l'acceptation si l'émetteur n'a plus `isCoach`, ou révoquer ses PENDING au retrait.
  Vérifié : lot API-A — e2e de capacités (l.5508-5590) sans invitation en attente.

[S2] apps/api/src/exercise/service/exercise.service.ts:65 — la consigne accepte des images hors des documents de l'exercice : « Dupliquer en variante » crée une variante sans ses images
  Constat : aucune vérification des `mediaId` IMAGE ; `useDuplicateExercise` (web, useExercises.ts:49)
            recopie `instructions` sans les documents.
  Pourquoi : la variante cite les documents de la source → images invisibles dans l'éditeur et chez
            l'athlète après diffusion, sans message. La dette l.1215 dit la fonction inexistante.
  Piste   : 400 sur un `mediaId` hors des documents INSTRUCTION de l'exercice, ou duplication côté serveur.
  Vérifié : lot API-A — serveur et client lus.

[S2] apps/api/src/auth/auth.config.ts:96 — `POST /api/auth/update-user` réécrit les capacités sans passer par `CapabilityService`
  Constat : `isCoach`/`isAthlete` en `input: true`, aucun `databaseHooks.user.update`. Better Auth
            1.6.23 (`update-user.mjs` l.43 → `parseInputData`) accepte tout champ additionnel dont
            `input !== false`.
  Pourquoi : un coach avec athlètes actifs envoie `{isCoach:false}` : le 409 `ACTIVE_ATHLETES` n'est
            jamais évalué, ses athlètes restent liés à un compte sans route coach ; `{false,false}`
            produit le compte sans capacité que le hook de création refuse ; `role` non recalculé.
  Piste   : `databaseHooks.user.update.before` qui rejette `isCoach`/`isAthlete`/`role` ; e2e du contournement.
  Vérifié : relu par moi dans node_modules et auth.config.ts. Dette l.1517-1540 : rien sur l'écriture.

[S2] apps/api/src/account/service/invitation.service.ts:180 — l'invitation nominative se fie à une adresse jamais vérifiée
  Constat : `listForMe` (l.180) et `accept` (l.243) comparent `invitation.email` à l'e-mail de session ;
            ni `requireEmailVerification` ni envoi de vérification ; le DTO rend le `code`.
  Pourquoi : coach invite `lea@club.fr` (sans compte) → un tiers s'inscrit le premier avec cette
            adresse → voit l'invitation, l'accepte, reçoit cycles, fiche et messagerie destinés à Léa ;
            la vraie Léa ne peut plus s'inscrire.
  Piste   : exiger `emailVerified` pour listForMe/accept par e-mail (ou vérification à l'inscription).
  Vérifié : relu par moi (aucune option de vérification).

[S2] apps/api/src/feedback/service/feedback.service.ts:84 — suivi d'exécution non borné : N clés = N UPDATE en série, doublons = « 6 sur 4 »
  Constat : `feedbackTrackingSchema` (feedback.schema.ts:88) et les records de exercise-block.schema.ts
            (l.415, 426) sans limite de clés ; `checked` sans `.max()` ni unicité ; `writeTracking`
            fait un `await updateMany` par clé.
  Pourquoi : ~90 000 clés tiennent sous 1 Mio → 90 000 allers-retours Postgres sur une connexion du
            pool. `{checked:[0,0,0,0,0,1]}` sur 4 séries → `{DONE, done:6, total:4}` (prouvé).
  Piste   : borner clés et `checked` (unique, ≤ BLOCK_MAX_ROWS) ; n'écrire que les exercices de la séance.
  Vérifié : trouvé par 2 lots ; preuve node (lot DTO) ; dette : décisions produit seulement.

[S2] apps/api/src/message/service/feedback-announcer.service.ts:74 — en auto-coaching, l'avis de débrief crée un fil avec soi-même et marque le débrief « Répondu »
  Constat : `ensure(coachId, athleteId)` sans test d'égalité ; `firstCoachReplyByFeedback`
            (coach-feedback.service.ts:299) compte l'avis (`senderId === coachId`) comme réponse.
  Pourquoi : coach solo débriefe → badge « Répondu » sans réponse ; fil (soi, soi) que la dette dit
            impossible (l.1473, 1684).
  Piste   : sortir d'`announce` si `coachId === athleteId` ; filtrer les types d'avis dans le calcul.
  Vérifié : lot API-B — e2e solo l.5700 ne vérifie ni `repliedAt` ni les fils.

[S2] apps/api/src/exercise/service/exercise-document.service.ts:36 — la taille d'un document d'exercice n'est pas signée
  Constat : `createUploadUrl(storagePath, mimeType)` sans `contentLength`, contrairement à la facture
            et aux médias ; la branche FILE d'`attachDocumentSchema` n'a pas de `size`.
  Pourquoi : coach déclare 1 Ko, envoie plusieurs Go → diffusion → le mobile athlète télécharge d'office
            les documents des cycles visibles (#95). La dette l.2580 affirme que le plafond borne ce volume.
  Piste   : signer `input.size` ; `size` sur la branche FILE ; e2e « taille signée » pour les documents.
  Vérifié : lot DTO — seul appel sans taille ; e2e de taille signée limité débrief/messagerie.

[S2] apps/api/test/isolation.e2e-spec.ts — huit écritures coach sans e2e d'isolation
  Constat : PUT/DELETE /scheduled-sessions/:id, PATCH/DELETE /plans/:id, PATCH /plan-weeks/:id,
            PUT/DELETE /plans/:id/billing/document, DELETE /exercises/:id/documents/:docId ; plus
            GET /plans et GET /invitations sans test « l'autre coach ne voit rien ».
  Pourquoi : règle dure n°1. Risque actuel faible (`getOwnedOrThrow` scopé, testé en lecture) ;
            régression non gardée, 3 de ces routes purgent le storage.
  Piste   : un `expect(coachB…).toBe(404)` par route dans les blocs existants + donnée de A intacte.
  Vérifié : lot infra — 92 routes extraites et croisées avec tous les appels supertest.

### @cmv/shared

[S2] packages/shared/src/api/client.ts:37 — les refus Zod s'affichent en anglais brut dans l'UI
  Constat : `toApiError` rend `message[0].message`, texte par défaut de Zod ; aucun schéma ne porte de
            message ; aucune app ne lit `fieldErrors` ; 33 appelants affichent `apiErrorMessage`.
  Pourquoi : règle dure n°6. Titre de cycle > 200 car. (`PlanHeaderForm`, sans `maxLength`) → toast
            « Too big: expected string to have <=200 characters ». Idem message > 5 000 car. Le contrôle
            [F] de `check:i18n` ne voit que les littéraux d'apps/api/src (dette l.2002).
  Piste   : traduire un 400 de validation par clé i18n côté client ; poser les `maxLength` depuis les
            `*_MAX_LENGTH` (13 sur 21 ne sont branchées sur aucun champ).
  Vérifié : moi — `safeParse` sur zod 4.4.3, pas de locale Zod, `fieldErrors` jamais lu.

[S2] packages/shared/src/dto/exercise-block.schema.ts:183 — `validateBlockValues` ne tourne que dans le navigateur
  Constat : `values` = `z.record(string, number|string|null)` sans borne ; le croisement cellule ↔
            colonne n'est appelé que par web/BlockIssues.tsx:26, par aucun service API. La dette l.1195
            dit le contrat « tenu par `exerciseBlocksSchema` à l'entrée ».
  Pourquoi : `POST /exercises` accepte durée −5, GRADE de 900 000 car., colonne fantôme `1e308`
            (prouvé) → diffusé et affiché chez l'athlète.
  Piste   : 400 dans les 3 services d'écriture si `validateBlockValues` non vide ; corriger la dette l.1195.
  Vérifié : lot DTO — grep apps/api/src : aucun appel.

[S2] packages/shared/src/dto/exercise.schema.ts:163 — document LINK : `z.url()` accepte `javascript:`, `intent:`, `cimavia://`
  Constat : `linkHrefSchema` (rich-document.schema.ts:34) filtre http/https ; le lien joint d'exercice
            non. Rendu en `<a href>` web, `Linking.openURL` mobile (open-document.ts:83).
  Pourquoi : coach pose `cimavia://…` ou `intent://…` → l'athlète ne voit que « Lien » et déclenche un
            deep link ou une app tierce. Sur le web, seul React 19 neutralise `javascript:`.
  Piste   : `url: linkHrefSchema` + test de refus.
  Vérifié : lot DTO — preuve node sur dist.

[S2] packages/shared/src/util/date.util.ts:51 — `todayIsoDate()` rend le jour UTC : entre minuit et 2 h à Paris, « aujourd'hui » est hier
  Constat : `toIsoDate(new Date())` en UTC, pour ~20 appels côté client (plannings, séances, factures,
            tableaux de bord) ; même troncature UTC de `paidAt` (invoice-row.util.ts:221).
  Pourquoi : lundi 14/09 à 00:30 Paris → "2026-09-13" (prouvé) : le planning mobile ouvre la semaine
            précédente, la séance de dimanche reste « à venir », une facture échue le 13 reste
            PENDING. Fenêtre de 1 à 2 h chaque nuit en métropole.
  Piste   : un `todayIsoDate` local pour les clients, un `todayUtcIsoDate` explicite pour l'API ; test sous TZ=Europe/Paris.
  Vérifié : moi — `TZ=Europe/Paris node` avec horloge figée ; aucun choix « UTC » tranché dans les
            docs (CONTEXT.cimavia.md:154 prescrit la fonction sans parler du fuseau).

[S2] packages/shared/src/util/date-format.util.ts:47 — `formatIsoDateRange` ment sur toute semaine à cheval sur deux mois
  Constat : début formaté `{day}` seul, fin `{day, month}` : le mois affiché est toujours celui de la fin.
  Pourquoi : `("2026-09-28","2026-10-04")` → « 28 – 4 oct. » (prouvé) ; une semaine sur 4 ou 5, sur
            l'en-tête du planning athlète (web + mobile) et les cartes semaine du constructeur.
  Piste   : n'omettre le mois du début que si mois et année sont communs ; tests bord de mois/année.
  Vérifié : moi — `node` sur dist ; appelants WeekNavHeader.tsx:57, AthletePlanningScreen.tsx:102/201, PlanWeekCard.tsx:123.

[S2] packages/shared/src/api/client.ts:107 — un corps non-JSON lève une `SyntaxError` au lieu d'une `ApiError`
  Constat : `JSON.parse(text)` avant le test `response.ok`, sans garde.
  Pourquoi : page HTML 502 de cloudflared pendant un redémarrage de l'API → `SyntaxError` →
            `apiErrorMessage` null → paragraphes d'erreur vides (ExerciseBuilderScreen.tsx:217,
            CustomMetricForm.tsx:155) ; Sentry ne distingue plus le 502 d'un bug.
  Piste   : parser dans un try ; `ApiError(status)` si `!ok` ; tests 502 HTML et 200 HTML.
  Vérifié : lot shared-logic — fetch simulé sur dist. Page 502 réelle du NAS non rejouée.

### Web

[S2] apps/web/src/feature/plan/component/PlanBuilderActions.tsx:89 — « Diffuser » part avec l'en-tête ENREGISTRÉ et ignore la saisie en cours, destinataire compris
  Constat : le bouton ne connaît ni les changements non enregistrés de `PlanHeaderForm` ni
            `saveHeader.isPending` ; après diffusion, le formulaire grisé continue d'afficher la
            valeur non enregistrée.
  Pourquoi : depuis #207 le destinataire se choisit dans ce formulaire. Le coach corrige « Léa → Tom »
            puis clique « Diffuser » en haut : le cycle part chez Léa — notification, push et facture
            PENDING à Léa — et l'API refuse ensuite de changer le destinataire. Irréversible.
  Piste   : fermer « Diffuser » tant que `hasChanges || saveHeader.isPending`, en disant pourquoi ;
            réaligner le formulaire au passage en PUBLISHED.
  Vérifié : lot web-plan — aucun test ne combine saisie non enregistrée et diffusion ; aucun
            `useBlocker` dans apps/web/src ; dette #207 (l.1693-1744) muette sur ce point.

[S2] apps/web/src/feature/library/screen/ExerciseBuilderScreen.tsx:89 — aucun garde « modifications non enregistrées » sur les deux constructeurs
  Constat : « Annuler » navigue sans condition, la nav de `CmvAppShell` reste active, aucun
            `useBlocker` ni `beforeunload` dans apps/web/src ; tout l'état ne vit qu'en `useState`.
  Pourquoi : c'est l'écran où le coach passe le plus de temps ; un clic à côté d'« Enregistrer », un
            Ctrl+W ou un F5 efface grille, consigne et images en attente. Le code sait que le geste
            coûte (SessionBuilderScreen.tsx:111 enregistre d'office avant la variante).
  Piste   : `isDirty` dérivé dans chaque `use*Draft` + `useBlocker` TanStack (`enableBeforeUnload`).
  Vérifié : lot web-library — grep useBlocker/beforeunload → rien ; dette → rien.

[S2] apps/web/src/feature/library/util/tiptap-document.util.ts:50 — sous-liste (Tab) et retour à la ligne (Maj+Entrée) jetés en silence
  Constat : l'éditeur coupe strike/code/blockquote « parce que le modèle ne les porte pas », mais
            laisse actifs `Tab` → `sinkListItem` et `Maj+Entrée` → `hardBreak`, que la conversion ne
            sait pas lire : la sous-liste disparaît, les deux lignes se collent.
  Pourquoi : « Échauffement » / Tab / « 10 min vélo » s'affiche indenté dans l'éditeur et disparaît à
            l'enregistrement — la perte silencieuse que le commentaire dit éviter.
  Piste   : `hardBreak: false` et Tab neutralisé, ou porter ces formes dans `richDocumentSchema`.
  Vérifié : lot web-library — sonde sur Editor réel ; 15 cas de test sans imbrication ni hardBreak.

[S2] apps/web/src/feature/library/component/InstructionsEditor.tsx:55 — une adresse e-mail dans la consigne rend l'exercice inenregistrable
  Constat : `link: { protocols: ["http","https"] }` AJOUTE aux protocoles déjà permis (mailto…) et
            `autolink` reste actif ; `linkHrefSchema` refuse ensuite le `mailto:` → 400 à chaque
            enregistrement, sans rien de visible dans l'éditeur.
  Pourquoi : « Questions : coach@club.fr » suffit. Tant que le coach ne retrouve pas l'adresse, il ne
            peut plus enregistrer.
  Piste   : `autolink: false` ou `isAllowedUri` aligné sur `linkHrefSchema` ; `toInlineNode` qui ne
            garde un `href` que s'il passe le schéma.
  Vérifié : lot web-library — sonde sur Editor réel (frappe caractère par caractère).

[S2] apps/web/src/feature/library/hook/useSaveExercise.ts:106 — images de consigne retirées quand même envoyées, ou jamais supprimées
  Constat : `useInstructionMedia` n'a que `register` — `pending` ne rétrécit jamais, donc toutes les
            images posées depuis l'ouverture sont envoyées ; et rien ne supprime le document d'une
            image enregistrée puis retirée (ni client, ni `exercise.service.ts:update`).
  Pourquoi : remplacer la photo d'une consigne laisse l'ancienne en base et en bucket, invisible
            (`AttachmentsSection` filtre l'usage INSTRUCTION) et recopiée dans chaque séance planifiée,
            ce qui la rend ensuite insupprimable.
  Piste   : n'envoyer que les images dont le `mediaId` figure dans `instructions` ; côté API, purger
            les documents INSTRUCTION non référencés à l'update.
  Vérifié : lot web-library — `register` seul écrit `pending` ; P2-1/#72 couvre un autre cas.

[S2] apps/web/src/feature/library/component/BlockBandeau.tsx:148 — objectif AMRAP : `null` affiché « 1 », et impossible à retirer
  Constat : `value={structure.targetRounds ?? 1}` (repli silencieux d'un champ nullable) ; `CountField`
            ignore un champ vidé, donc un objectif posé ne redevient jamais `null`.
  Pourquoi : règle dure n°5. Le bandeau affiche « Objectif 1 » là où l'aperçu et le minuteur mobile
            n'affichent aucun objectif ; inversement un 5 saisi puis effacé reste 5 chez l'athlète.
  Piste   : champ nullable dédié (vide = `null`, rendu « — »), comme `CmvDurationField` pour les repos.
  Vérifié : lot web-library — lecteurs de `targetRounds` grepés ; composant à 0 % ; dette → rien.

[S2] apps/web/src/feature/library/component/ColumnMenu.tsx:199 — « Progression régulière » tronque le pas : +2,5 kg devient +2
  Constat : `Number.parseInt(step, 10)` alors que `fillStep` (@cmv/shared) accepte un pas réel ;
            aucun message, bouton actif.
  Pourquoi : Charge 10 avec pas « 2,5 » → 10/12/14/16 au lieu de 10/12,5/15/17,5. Même famille que la
            saisie décimale de GridCell, à corriger ensemble.
  Piste   : parse décimal tolérant à la virgule ; bouton fermé si le texte n'est pas entièrement un nombre.
  Vérifié : lot web-library — composant à 0 %.

[S2] apps/web/src/feature/library/screen/SessionBuilderScreen.tsx:115 — « Dupliquer en variante » : ni garde de double clic, ni erreur affichée
  Constat : l'entrée de menu n'est jamais désactivée, `onDuplicate` enchaîne `submit()` puis
            `duplicate.mutate` sans `onError` ; ni `isPending` ni `error` ne sont lus.
  Pourquoi : deux clics → deux `POST /sessions` (deux séances identiques) ; si la duplication échoue,
            le coach clique « Créer la séance » → seconde séance en base.
  Piste   : désactiver pendant `isSaving || duplicate.isPending`, afficher l'erreur, basculer sur
            `/library/sessions/$id` après la première création.
  Vérifié : lot web-library — dette : seule la note périmée « pas implémenté » (l.1215).

[S2] apps/web/src/feature/invoice/component/PlanBillingSection.tsx:50 — le formulaire de facturation écrase la saisie à chaque nouvel objet `billing`
  Constat : `useEffect(..., [billing])` resynchronise sur l'identité de l'objet, et `documentUrl` est
            re-signé à chaque lecture : tout refetch (60 s, ou joindre le PDF) rend un nouvel objet.
  Pourquoi : le coach passe 120 → 150 €, joint le nouveau PDF, et le champ revient à 120 € sans signal :
            la facture émise porte 120 € avec un justificatif à 150 €.
  Piste   : synchroniser sur `billing.id` + `updatedAt`, ou ne réécrire que les champs non modifiés.
  Vérifié : lot web-comms — le test ne rend jamais une seconde valeur de `billing`.

[S2] apps/web/src/feature/message/component/Composer.tsx:62 — le texte est effacé avant la réponse du serveur, et un fil non résolu accepte la saisie
  Constat : `onSendText(trimmed)` puis `setText("")` immédiatement ; un échec n'affiche qu'un toast.
            `MessageThread` passe `conversationId ?? ""` et laisse la barre active, donc l'envoi part
            vers `/conversations//messages`. `FeedbackReplyThread` ferme déjà ce cas.
  Pourquoi : cinq lignes de consignes, Entrée, 502 du tunnel → toast et texte perdu.
  Piste   : ne vider qu'au succès ; fermer la barre tant que `conversationId == null`.
  Vérifié : lot web-comms — pas de test d'échec d'envoi ; même code sur mobile (`Composer.tsx:43`).

[S2] apps/web/src/shared/hook/useWebAudioRecorder.ts:64 — quitter pendant un enregistrement ENVOIE la capture tronquée ; rien ne l'arrête à 5 min
  Constat : au démontage, le hook coupe les pistes mais laisse `recorder.onstop` actif → `stop` émis →
            `onRecorded` → `sendAudio`, après démontage. Et aucune borne : `prepareAudioBlob` refuse
            au-delà de 300 s seulement au moment de l'envoi.
  Pourquoi : le coach enregistre pour Léa, clique sur Tom : la moitié de phrase part chez Léa sans
            qu'il ait cliqué « envoyer ». Un retour vocal de 6 min est perdu en entier.
  Piste   : neutraliser `onstop`/`ondataavailable` avant de couper les pistes ; arrêter (en gardant)
            au plafond du profil.
  Vérifié : lot web-comms — hook monté par Composer.tsx:46 et AthleteFeedbackScreen.tsx:334, aucun test.
            Point 1 déduit de la spec MediaStream Recording, non rejoué en navigateur.

[S2] apps/web/src/feature/plan/hook/usePlanClipboard.ts:25 — le presse-papier de semaine survit à la déconnexion et à la suppression de sa source
  Constat : `sessionStorage["cmv.planClipboard"]` n'est vidé que par « Annuler la copie » : ni au
            logout (qui fait pourtant `queryClient.clear()`), ni quand la semaine ou le cycle disparaît.
  Pourquoi : poste partagé du club — le coach B voit « Semaine 2 de "Bloc force — Léa" copiée », titre
            d'un cycle d'un autre tenant, avec « Coller ici » armé (400 ensuite). Le « mourir avec
            l'onglet » tranché en #4 ne couvre pas le changement de compte.
  Piste   : vider au logout/login et dans `onSuccess` de `removeWeek`/`useDeletePlan`, ou scoper par `userId`.
  Vérifié : lot web-plan — seul ce hook touche au stockage ; dette #4 (l.781-790) muette sur le logout.

[S2] apps/web/src/instrument.ts:18 — le jeton de réinitialisation de mot de passe part dans Sentry avec l'URL
  Constat : aucun `beforeSend`. `httpContextIntegration` est une intégration PAR DÉFAUT de
            @sentry/browser 10.73.0 : elle écrit `event.request.url` (et Referer/User-Agent) sur TOUT
            événement, sans dépendre de `sendDefaultPii`, qui ne joue que sur l'IP —
            contrairement à ce qu'annonce le commentaire du fichier. `ResetPasswordScreen.tsx:12` lit
            le jeton dans `window.location.search` et ne le retire jamais de la barre d'adresse.
  Pourquoi : toute erreur survenue pendant que l'athlète est sur `/reset-password?token=…` envoie
            l'URL complète à Sentry — de quoi prendre le contrôle du compte, conservé le temps de la
            rétention. `instrument.test.ts:61` s'intitule « n'envoie ni IP ni en-têtes » et
            n'assertionne que la valeur de l'option.
  Piste   : `beforeSend` qui blanchit l'URL et les breadcrumbs (`token`, `code`, `X-Amz-Signature`) ;
            `history.replaceState` après lecture ; corriger l'intitulé du test.
  Vérifié : moi — pas de `beforeSend`, jeton laissé dans l'URL ; lot web-shell — sources Sentry lues
            dans node_modules ; dette #183/#182 muette sur l'URL.

[S2] apps/web/src/shared/component/CmvRoleGate.tsx:65 — la garde perd la cible et piège le bouton Retour
  Constat : les deux `<Navigate>` sont sans `replace` et sans porter la cible ; `LoginScreen.tsx:38`
            renvoie inconditionnellement vers `/`.
  Pourquoi : un coach ouvre `/feedbacks?feedback=<id>` depuis une notification, session expirée : après
            connexion il atterrit sur `/`, le débrief est perdu. Et sans `replace`, Retour ramène sur la
            route refusée, qui repousse aussitôt vers `/login` : l'utilisateur boucle.
  Piste   : `replace` sur les deux `Navigate` + `search: { redirect: href }` consommé par `LoginScreen`.
  Vérifié : lot web-shell — garde montée par 14 fichiers de `routes/` ; #20 ne traite que l'emplacement.

[S2] apps/web/src/shared/component/CmvRoleGate.tsx:1 — la seule garde d'autorisation du front n'a aucun test
  Constat : 0 %, aucun `CmvRoleGate.test.tsx` ; trois branches (`isPending`, `!isAuthenticated`,
            `accepted.some(hasCapability)`) dont dépend toute l'autorisation web.
  Pourquoi : inverser la première ouvrirait les écrans coach à un athlète le temps de la résolution de
            session ; la supprimer ferait clignoter un refus à chaque F5. Ni tsc, ni Biome, ni les tests
            de routes ne le voient.
  Piste   : un test de rendu par branche, `authClient.useSession` mocké (déjà pratiqué par 15 fichiers).
  Vérifié : lot web-shell — absence de test par grep.

[S2] apps/web/src/main.tsx:17 — un 401 n'est traité nulle part : la session perdue ne se voit que par des erreurs
  Constat : pas de `QueryCache`/`MutationCache` `onError` ; aucun traitement de 401 dans apps/web/src.
  Pourquoi : tant que l'onglet garde le focus, Better Auth ne rafraîchit rien : la garde laisse passer,
            chaque lecture affiche une erreur et chaque mutation crache un toast « Unauthorized » brut.
            Le coach qui vient de remplir un constructeur voit son enregistrement refusé sans explication,
            et le rattrapage au retour sur l'onglet jette le travail en cours.
  Piste   : `onError` global sur `ApiError.status === 401` rejouant le triptyque de `onLogout`, avec un
            toast qui nomme la cause.
  Vérifié : lot web-shell — `vitest.setup.ts:28` neutralise ces managers, donc aucun test ne peut
            exercer l'expiration.

[S2] apps/web/src/shared/component/CmvPanel.tsx:78 — string d'interface en dur dans le design system
  Constat : `aria-label="Fermer"`, seule string d'UI en dur du socle. Règle dure n°6 ; `check:i18n` ne
            lit que les catalogues et apps/api/src.
  Piste   : prop `closeLabel`, comme `CmvTagInput` le fait déjà avec `removeLabel`.
  Vérifié : lot web-shell — greps aria-label/placeholder/title/alt sur tout le périmètre.

### Mobile

[S2] apps/mobile/feature/dashboard/screen/CoachDashboardScreen.tsx:49 — le tableau de bord du coach lit ses factures et ses fils au titre EXERCÉ, qui peut être « athlète »
  Constat : `useInvoices()` et `useConversations()` construisent requête et clé depuis
            `useExercisedCapability()`, un ÉTAT jamais réinitialisé ; `redirectForPath` garde sur la
            capacité POSSÉDÉE, donc l'onglet reste atteignable avec `as = "athlete"`. Le web DÉDUIT le
            titre du chemin, et dit pourquoi : « un état séparé aurait pu diverger de la page affichée ».
  Pourquoi : compte à double capacité (#7) qui bascule sur « athlète » pour voir ce qu'il doit, puis
            revient au tableau de bord : les tuiles comptent SES factures reçues et l'invitent à
            « relancer » ce qu'il doit lui-même ; les colonnes de ses athlètes retombent à « — ».
  Piste   : demander explicitement le titre coach sur un écran mono-titre, ou faire porter
            `redirectForPath` sur le titre exercé.
  Vérifié : lot mobile-reste — provider monté à la racine, `override` jamais remis à `null` ; écran à 0 %.

[S2] apps/mobile/feature/notification/screen/NotificationsScreen.tsx:37 (et usePushToken.ts:33) — la destination d'une notification est décidée sur la capacité POSSÉDÉE, pas sur le titre exercé
  Constat : les deux portes d'entrée passent `useCapabilities()` à `routeForNotification` /
            `routeForPushPayload` ; `targetFor` branche sur `isCoach` et retourne avant la table
            athlète, donc la capacité coach gagne toujours sur un compte cumulant.
  Pourquoi : un coach lui-même coaché, basculé en espace athlète : un cycle publié ne mène nulle part
            (`PLAN` coach = `null`), une séance annoncée ouvre la boîte de débriefs du COACH au lieu de
            la séance, une invitation mène à `/dashboard` au lieu de `/join`.
  Piste   : dériver l'argument du titre exercé dans les deux appelants ; figer le cas par un test.
  Vérifié : lot mobile-reste — `route.util.test.ts` n'a aucun cas à double capacité ; côté web la
            limite est assumée par écrit (renvoyée à #7).

[S2] apps/mobile/feature/profile/screen/ProfileScreen.tsx:59 — la séquence de déconnexion, seul rempart contre la fuite entre comptes, n'est couverte par aucun test
  Constat : `onLogout` enchaîne `revokeCurrentPushToken()` AVANT `signOut()` (la route de révocation est
            scopée à l'utilisateur connecté), puis `resetAccountData()`, puis `replace("/login")`. Le
            test mocke les deux premiers mais n'appuie jamais sur le bouton.
  Pourquoi : inverser les deux premières lignes fait échouer la révocation en 401, que le `catch` avale
            par conception : le prochain utilisateur du téléphone reçoit les notifications du compte
            quitté, sans erreur ni log, et rien en CI ne l'attrape.
  Piste   : un test qui appuie sur `common.logout` et assertionne l'ordre des appels.
  Vérifié : lot mobile-reste — grep des tests : aucune pression du bouton.

[S2] apps/mobile/feature/plan/hook/useLocalTracking.ts:36 — deux instances du suivi local sur la même séance, dont une garde une copie périmée
  Constat : `SessionDetailScreen` reste monté sous `SessionFeedbackScreen` (même Stack), chacun avec son
            `useLocalTracking(id)` lu au montage seulement ; `clear()` du débrief ne vide pas l'autre copie.
  Pourquoi : coche 3/4, corrige à 4/4 dans le débrief, enregistre ; retour à la séance → 3/4 ; une case
            touchée réécrit « 3/4 + x » sur le disque, qui l'emporte sur le serveur → la 4e série est perdue.
  Piste   : une source par clé (`useSyncExternalStore`), ou relecture au focus.
  Vérifié : lot mobile — SessionFeedbackScreen.tsx:20/140/155, push SessionDetailScreen.tsx:123.

[S2] apps/mobile/feature/plan/screen/SessionDetailScreen.tsx:248 — « Passer » dans le bandeau réduit ARRÊTE tout le déroulé
  Constat : `RestBanner onSkip={runner.stop}` sous le libellé « Passer » ; le calque agrandi branche,
            lui, `onSkip: runner.skip` (l.222).
  Pourquoi : « Tractions 4 × 6, repos 3' » réduit, « Passer » après la série 2 → fin de l'exercice, pas
            de reprise à la série 3.
  Piste   : `onSkip={runner.skip}`.
  Vérifié : moi — l.222 vs l.248.

[S2] apps/mobile/feature/plan/lib/timer-alert.ts:99 — nom du canal Android « Minuteurs » en dur
  Constat : `setNotificationChannelAsync(…, { name: "Minuteurs" })` hors i18next, visible dans les
            réglages Android ; `check:i18n` ne lit pas les littéraux du mobile. Règle dure n°6.
  Piste   : `i18n.t("plan.timer.channelName")`.

### Infra, CI et outillage

[S2] .github/workflows/deploy-dev.yml:196 — runner auto-hébergé avec le socket Docker du NAS, sur un dépôt public
  Constat : job `deploy` sur `[self-hosted, cimavia-dev]`, runner au niveau du dépôt, docker.sock et
            `.env` du NAS (deploy/dev/README.md:91-94).
  Pourquoi : une PR de fork ajoutant un workflow `on: pull_request` ciblant ce label exécute en root
            sur le NAS avec tous les secrets du tier ; seule barrière : l'approbation des workflows de
            fork (par défaut, premier contributeur seulement).
  Piste   : #266 ; d'ici là, approbation pour tous les contributeurs extérieurs, runner restreint à ce
            workflow, ligne en dette-technique.
  Vérifié : lot infra — aucune ligne de dette ; réglages GitHub non vérifiables sans interface.

## S3 — qualité

### API (NestJS)

[S3] apps/api/src/invoice/service/invoice.service.ts:276 — payer ou annuler une facture laisse le rappel « en retard » à traiter
  Piste : passer en DONE le rappel `(INVOICE, id, INVOICE_OVERDUE)` PENDING dans la même transaction.

[S3] apps/api/src/notification/notification.service.ts:504 — e-mail et push attendus dans la requête métier, sans timeout
  Pourquoi : SMTP muet → `POST …/messages` pend jusqu'à 2 min, message déjà écrit → renvoi → doublon.

[S3] apps/api/src/notification/notification.service.ts:178 — 434 lignes de code, 11 `notifyX` copiés, aucun test (`handleTickets`, purge DeviceNotRegistered)

[S3] apps/api/src/exercise/controller/exercise.controller.ts:22 (+ plan.controller.ts:21) — `@Query()` brut hors Zod : `?search=a&search=b` → 500 (prouvé sur fastify 5.8.5)

[S3] apps/api/src/plan/service/scheduled-session.service.ts:420 — contrôle d'appartenance des exercices écrit 3 fois hors du module `exercise` (`loadExercises`, `SessionService.assertExercisesOwned` l.98, `replaceExercises` l.185) ; `plan`/`session` lisent `Exercise`, `ExerciseDocument`, `CustomMetric` en direct (§2)

### @cmv/shared

[S3] packages/shared/src/dto/athlete-sheet.schema.ts:6 (+ 16 `fileName`, `adjustment.path`) — chaînes persistées sans `.max()` ; 50 `fileName` de 900 Ko → ~45 Mo re-téléchargés à chaque polling de fil

[S3] packages/shared/src/dto/exercise-block.schema.ts:1 — 1 083 lignes, ~830 de logique pure (40 fonctions) dans un fichier de schéma

[S3] packages/shared/src/util/plan.util.ts:246 (et :202) — « le dernier cycle terminé » élu par date de début, pas de fin : deux cycles terminés imbriqués (#172) → l'API sert celui fini il y a 8 semaines, `planAudience` rend `ENDED_SUPERSEDED` à tort (prouvé)

[S3] packages/shared/src/env.schema.ts:28 — en production, `BETTER_AUTH_SECRET` `min(1)`, `REMINDER_TICK_SECRET` sans longueur, `BETTER_AUTH_URL` en http accepté → cookies sans `Secure` (Better Auth ne fait qu'un `warn`)

[S3] packages/shared/src/util/search.util.ts:17 — `comparableText` ne replie pas œ/æ : « noeud » ne trouve pas « Nœud de huit » (le correcteur iOS insère œ)

[S3] packages/shared/src/util/notification.util.ts:84 — `capabilityOfNotification` a un `default` : un nouveau `NotificationType` oublié passe typecheck et tests et disparaît des pastilles par espace (#176) ; table `satisfies Record<…>` (risque de régression, pas de bug actuel)

### Web

[S3] apps/web/src/feature/library — 7 copies du même déplacement par `splice` (`BlockGrid.moveRow` l.77, `SessionBlockGrid.moveRow` l.54, `MetricPicker.move` l.115, `ScaleEditor.move` l.47, `StructureSection.move` l.56, `useComposition.moveTo` l.52, `useSessionDraft.moveItem` l.91), gardes déjà divergentes ; `moveItem(list, from, to)` pur dans `shared/util/`

[S3] apps/web/src/feature/plan/component/PlanWeekCard.tsx:97 — le glisser-déposer calcule sur une grille périmée pendant qu'un dépôt est en vol : second geste → 400 « l'ordre doit citer TOUTES les séances », geste perdu ; `isBusy` n'est câblé qu'au bouton « + Séance » et n'est qu'un état par instance de `usePlanMutations`

[S3] apps/web/src/feature/plan/component/PlanWeekCard.tsx:48 — la seule garde contre un collage destructeur (confirmation « Remplacer N séances », décision #4) est dans un fichier à 0 % : LH 0/30, BRH 0/22, aucune carte de semaine n'est jamais rendue par les tests

[S3] apps/web/src/feature/plan/screen/PlanBuilderScreen.tsx:150 — ouvrir une séance ne montre ni chargement ni échec : sur 502, le clic ne fait rien et recliquer ne retente pas (même clé, requête déjà en erreur)

[S3] apps/web/src/feature/plan/screen/AthletePlanningScreen.tsx:86 — « Aucun coach pour l'instant » affiché à un athlète lié dont `GET /me/coach` n'a pas encore répondu ou a échoué (`undefined` traité comme `null`) ; même défaut sur mobile (`PlanningScreen.tsx:82`) — décision à promouvoir dans @cmv/shared avec `hasCoach: boolean | null`

[S3] apps/web/src/feature/coach/component/PendingInvitationCard.tsx:62 — « Rejoindre » échoue en silence (pas d'`onError` dans `useAcceptInvitation`, `accept.error` jamais lu) : invitation expirée ou déjà acceptée → le bouton se rallume et rien ne s'affiche ; même trou côté mobile

[S3] apps/web/src/feature/feedback/hook/useMyFeedbackMedia.ts:132 — retirer un média du débrief échoue en silence (aucun `onError`, aucun `MutationCache.onError` global) ; même code sur mobile

[S3] apps/web/src/feature/message/component/MessageThread.tsx:59 — `scrollIntoView()` au rendu, avant le chargement des `<img>` sans dimensions : un fil qui finit par une photo n'est pas collé en bas, et relire l'historique saute en bas à chaque message reçu

[S3] apps/web/src/shared/locale/fr.json:1069 — « 10 Mo » et `"application/pdf"` écrits en dur pour le justificatif (4 réécritures) alors que `INVOICE_DOCUMENT_MIME_TYPES` et la constante existent (§7 : les plafonds s'interpolent)

[S3] apps/web/src/feature/library/component/SessionBlockGrid.tsx:190 — l'indice « défaut … » affiche une durée en secondes brutes (« défaut 150 » sous « 3' ») : recopie partielle de `formatMetricValue`

[S3] apps/web/src/feature/library/hook/useComposition.ts:19 — `useComposition`, `CompositionEditor` et `ExercisePicker` vivent dans `library` mais n'ont plus que `plan` pour appelant (import croisé, options mortes, docs fausses, préfixe i18n inexistant)

[S3] apps/web/src/shared/component/CmvAppShell.tsx:108 — la barre latérale se construit sur `useActiveSpace()`, qui lit `?as=` sans le borner aux capacités possédées : un athlète seul sur `/invoices?as=coach` voit une barre « Coach » de six entrées qui renvoient toutes sur `/` ; le hook qui borne (`useActingCapability`) existe juste en dessous

[S3] apps/web/src/shared/component/CmvAppShell.tsx:8 — un composant du design system importe une feature (`@/feature/notification`) : le barrel `@/shared/component` tire la feature dans le graphe de quiconque importe un `CmvButton`, et trois tests doivent la mocker (§3, §4)

[S3] apps/web/src/shared/component/CmvAppShell.tsx:114 — « Pas de persistance disque ici » est faux : `onLogout` vide le cache TanStack mais laisse `cmv.planClipboard` (sessionStorage) et le suivi local (localStorage) — c'est la cause du S2 presse-papier

[S3] apps/web/src/feature/auth/screen/LoginScreen.tsx:37 — le `queryClient.clear()` décrit par son propre commentaire comme « le seul point de passage OBLIGÉ d'un changement de compte » est à 0 % (son jumeau `RegisterScreen` a 153 lignes de test et ne l'assertionne pas non plus)

[S3] apps/web/src/shared/lib/nav.ts:23 — « la même capacité que celle exigée par la route » n'est vérifié par rien : `NAV_ITEMS` d'un côté, un `<CmvRoleGate capability=…>` recopié dans 14 fichiers de `routes/` de l'autre, sans test de correspondance (c'est l'oubli déjà consigné côté mobile en #20)

### Mobile

[S3] apps/mobile/feature/plan/hook/useTimerNotification.ts:41 — « autorise les notifications » affiché à chaque série manuelle et en pause : liste d'alertes vide confondue avec un refus de permission

[S3] apps/mobile/shared/component/CmvRichDocument.tsx:181 — le design system lit le stockage hors-ligne des cycles (`documents`, `planId`, `localDocumentUri`) ; la jumelle web reçoit un `resolveImage` générique (§3)

[S3] apps/mobile/feature/plan/screen/SessionsScreen.tsx:29 — découpage « à venir / passées » recopié du web (`AthleteSessionsScreen.tsx:57-69`) ; `RunnerBody.tsx:246` réécrit `emomTopCount` de @cmv/shared (§7)

[S3] apps/mobile/feature/message/component/Composer.tsx:156 — les deux boutons icône de la barre d'envoi (joindre, envoyer) n'ont ni `accessibilityLabel` ni `accessibilityRole`, alors que la convention est tenue partout ailleurs ; le test doit les retrouver par `[data-icon="send"]`. Quatre surfaces concernées

[S3] apps/mobile/feature/feedback/screen/SessionFeedbackScreen.test.tsx:13 — le test annonce éprouver « quand le décompte accompagne le texte » et fige `useScheduledSession: () => ({ data: null })` : seule la branche sans séance est rendue, `TrackedSections` n'est monté par aucun test du dépôt et `FeedbackTrackingSection` est remplacé par `() => null`

### Infra, CI et outillage

[S3] apps/web/Dockerfile:102 — `nginx:1.27-alpine` branche close ; dependabot sans `docker`/`npm` ; `cloudflared`/`mailpit` en `latest` (un cloudflared cassé passe le smoke check)

## S4 — confort

### API (NestJS)

[S4] apps/api/src/plan/service/scheduled-session.service.ts:1 — 565 lignes (plan.service.ts : 496) ; le S1 images et le S2 ids renouvelés vivent dans ce chemin mêlé

### @cmv/shared

[S4] packages/shared/vitest.config.ts:15 — `all: true` morte en Vitest 4 ; `src/index.ts` et `src/type/**` exclus sans jumelle Sonar (§11)

[S4] packages/shared/src/dto/feedback.schema.ts:120 — commentaire « 60 s » alors que la borne vaut 180 s ; le CDC (l.167, 334, 374) dit aussi 60 s

[S4] packages/shared/src/util/date-format.util.ts:111 — `relativeTimeFrom` : 1 ms d'avance du `createdAt` sur l'horloge de l'appareil → date absolue au lieu de « à l'instant »

[S4] packages/shared/src/util/reminder.util.test.ts:163 — test DST vert quelle que soit l'implémentation : aucun `TZ` fixé, runners CI en UTC ; `setupFiles` avec `TZ=Europe/Paris`

### Web

[S4] apps/web/src/feature/notification/util/route.util.ts:103 — « débrief reçu » ouvre la boîte de réception vide au lieu du débrief (`session: undefined`) alors que `?session=<id>` existe et que le mobile ouvre le bon écran : écart de parité #20 ; le commentaire « pas d'écran par débrief » est périmé

[S4] apps/web/src/feature/feedback/screen/AthleteFeedbackScreen.tsx — 536 lignes

[S4] apps/web/src/feature/message/component/Composer.tsx:23 — `formatSeconds` recopie `formatMmSs` (que le mobile importe) ; `InstructionsEditor.tsx:354` recopie `megabytesOf` hors `Intl`

### Infra, CI et outillage

[S4] .github/workflows/reminder-tick.yml:35 — seul workflow sans `permissions` ; `${{ secrets.REMINDER_TICK_SECRET }}` interpolé dans `run:` (l.47)

## Suites proposées (rien n'est corrigé sans accord)

1. **Un commit chacun, tout de suite** (petits, sans discussion) : `redact` Pino · `pushedAt: null` au
   report d'un rappel · `onSkip={runner.skip}` du bandeau · canal Android i18n · `permissions: {}` du
   workflow de tick · commentaire « 60 s » → 180 s · `closeLabel` de `CmvPanel`.
2. **Une issue, puis un commit** (correction claire, test à écrire) : `assertKeyUnder` sur les 4
   rattachements + e2e · `.max()` sur les tableaux d'exercices et les records de suivi · hook
   `update` de Better Auth · `todayIsoDate` local vs UTC · `formatIsoDateRange` · `GridCell`
   décimales et Entrée · `applyReloaded` · `AthleteSheetPanel` · invalidations mobiles
   (`counterpartKeys`, `conversations(as)`) · 401 global côté web · `beforeSend` Sentry.
3. **Une issue à instruire** (le geste juste demande un arbitrage produit) : identité des lignes de
   séance planifiée (S2 « ids renouvelés », qui porte aussi le S1 des images de consigne) ·
   suppression d'une semaine ou d'une séance débriefée sur cycle diffusé · garde « modifications non
   enregistrées » sur les constructeurs · « Diffuser » vs en-tête non enregistré · titre exercé du
   tableau de bord et des notifications mobiles · resynchronisation hors-ligne.
4. **Épic de tests** : 8 routes d'écriture sans e2e d'isolation · `CmvRoleGate` · séquence de
   déconnexion mobile · table nav ↔ gardes de routes.
5. **À trancher, pas à corriger** : le runner auto-hébergé sur dépôt public (#266 le prévoit déjà) ;
   la ligne de dette V-2 qui dit couvert ce que le S1 hors-ligne contredit ; la dette l.1195
   (`validateBlockValues` « tenu à l'entrée ») et la dette l.1236 (suivi reporté par id), toutes deux
   démenties par le code.

## Écartés après vérification
- Hooks jumeaux web↔mobile : « Tranché en #137 ». `media.util.ts` web↔mobile : refus explicite #96.
- `FeedbackTrackingSection`, `TrackingList` : logique déjà dans @cmv/shared, seul le rendu diffère.
- Chemins HTTP : aucun appelé en dur par les deux apps ; tous correspondent à une route API.
- Types métier redéfinis côté apps : aucun. 266 exports shared sans consommateur de prod : types/schémas de réponse.
- Rate limit d'auth (actif, 3/10 s), CORS (liste explicite), secrets (`.env` ignorés), TRUNCATE e2e (28 modèles).
- `include` imbriqués des médias de débrief (sûrs par FK) ; course entre ticks (`concurrency` du workflow).
- Déjà consignés : Q-2 nginx root · P7-4 MinIO · U-6 multipart abandonnés · #267 clé S3 root.
- Swagger servi sans authentification hors `configureApp` (main.ts:40, route interne de tick incluse) : suivi en #263 d'après la mémoire projet — à confirmer, l'issue n'a pas été relue.
- Doublon : `todayIsoDate` remonté aussi par le lot mobile → fusionné dans le S2 shared.
- Courses écartées (boutons désactivés pendant l'envoi) : `addWeek`/`nextPosition` concurrents et double acceptation → P2002 en 500 ; double `publish` → 400 trompeur.
- Mobile, impact trop faible : choix de capacité qui survit à la déconnexion ; clés `cimavia-tracking:*` non purgées au changement de compte.

## Non vérifié
- **Couverture inégale de deux lots** : `web-library` et `web-plan` ont été interrompus avant la fin. Leurs constats sont vérifiés et complets, mais ni l'un ni l'autre n'a pu dire ce qu'il n'avait PAS regardé, et `apps/web/src/feature/dashboard/` n'a probablement pas été lu jusqu'au bout. À reprendre lors d'une prochaine revue.
- Web : `paidAt.slice(0,10)` (InvoiceDetailPanel.tsx:100, InvoiceHistoryTable.tsx:131) tronque un instant UTC — même famille que `todayIsoDate`, mobile non vérifié ; montant « 12,50 » dans un `type="number"` sous Firefox ; les deux instances d'envoi de médias de la page de débrief non croisées ; `ScheduleReminderButton` accepte une échéance passée, réaction de l'API non lue.
- API-A : schema.prisma l.640-995 et CHECK des migrations survolés seulement ; `findUniqueScoped` lit via le client de base (hors transaction) — aucun appelant aujourd'hui ; `AthleteSheet.athleteId @unique` → 500 pour un nouveau coach après rupture (latent, #74).
- Mobile : rien rejoué sur appareil ; `File.upload` (SDK 56) respecte-t-il `signal` ? ; 12 `requestPermissionsAsync` en parallèle sur Android 13+ ; téléchargement qui écrit après la purge de déconnexion ; breadcrumbs Sentry par défaut.
- Shared : support Hermes de `formatRange` ; tick PLAN_ENDING / INVOICE_OVERDUE de l'API lui aussi en date UTC.
- E2E non lancés ; aucun S1 rejoué contre une API réelle.
- Réglages GitHub (approbation des forks, token par défaut, groupe du runner), contenu des issues #260/#263/#266/#267.
- `conversation.service.ts:153` : `distinct` Prisma 7 peut-être appliqué en mémoire (charge de tous les messages à chaque polling).
- `notification.service.ts:644` journalise `ticket.message`, qui contiendrait le token Expo en clair selon la doc.
- Seuil d'OOM réel du S1 « exercices » ; clé objet > 1 024 octets sur MinIO/Scaleway.
