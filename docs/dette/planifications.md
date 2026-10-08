# Dette technique — Planifications

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P3 — Planifications

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P3-1~~ | ~~**Push non envoyé à la diffusion**~~ : `notifyPlanPublished` journalisait au lieu d'émettre. | ✅ | résolu en **p4-4** — `expo-server-sdk` branché dans `NotificationService`, table `PushToken` |
| P3-2 | **Objets S3 orphelins après suppression d'une planif** : une copie de document partage la clé objet de la bibliothèque. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |
| ~~P3-3~~ | ~~**Documents non lisibles hors-ligne**~~ : servis par des URLs signées à TTL court (5 min). | ✅ | résolue en [#95](https://github.com/Cimavia/cimavia/issues/95) — documents ET déroulé descendus sur l'appareil à la première ouverture en ligne. Le TTL, lui, n'a pas bougé : c'est le CLIENT qui a changé |
| ~~P3-4~~ | ~~**Écrans coach de P1 jamais construits**~~ (nav, liste d'athlètes, invitation, fiche). | ✅ | résolu en **p3-8** — `CmvAppShell`, `/athletes`, invitation, fiche athlète |
| P3-5 | **Écart aux maquettes assumé** : pas de durée de séance (« 75 min » en pd-7/pd-9). Le glisser-déposer, lui, n'en est plus un — cf. ~~P2-3~~. | 🟢 | [#94](https://github.com/Cimavia/cimavia/issues/94) |
| ~~P3-6~~ | ~~**Tuile « Factures en attente » non branchée**~~ : affichait `—`, marquée `// MOCKED`. | ✅ | résolue en **P6** — branchée sur `pendingCount(invoices)` |

---

> **Tranché en P3** (la question ouverte du modèle) : `ScheduledSessionExercise` est une **copie autonome** — snapshot `title`/`description`/`prescription` + `sourceExerciseId` **nullable en `SetNull`** (traçabilité seule), et les documents sont **copiés en lignes** partageant la clé objet. Conséquence : le coach peut supprimer un exercice de sa bibliothèque **sans jamais casser ni bloquer** une planification diffusée (pas de `Restrict`, pas de 409 à vie). La bibliothèque (`SessionExercise`) garde, elle, son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## Post-MVP — Copie d'une semaine ([#4](https://github.com/Cimavia/cimavia/issues/4))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P2-1~~ / ~~P3-2~~ | **Nouveau déclencheur** : vider la semaine cible cascade ses `ScheduledSessionExerciseDocument` **sans** passer par `deleteObjectIfUnreferenced`. Si la cible portait la dernière copie d'une clé dont l'exercice de bibliothèque est déjà supprimé, l'objet reste orphelin. Le *collage*, lui, va dans le sens sûr (plus de copies = plus de références = objet retenu, jamais purgé pendant qu'il sert). | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |

> **Tranché en #4** (ce que la copie emporte, et ce qu'elle laisse) : elle reproduit ce que le
> **coach a composé** — type et note de semaine, séances, consignes, exercices, documents — et laisse
> tout ce qui appartient à l'athlète ou à l'exécution. Quatre exclusions, chacune pour sa raison :
> **`ScheduledSessionStatus`** (la copie naît `PLANNED` ; `DONE` est posé par le débrief et la
> transition est sans retour — une séance collée « déjà faite » serait indébriefable et fausserait
> les tuiles du dashboard) ; **`SessionFeedback`** (`@unique` sur la séance, et écrit par l'athlète :
> le copier lui attribuerait un texte qu'il n'a pas écrit, et `coachReadAt: null` ressusciterait une
> ligne « à relire ») ; **`FeedbackMedia`** (seul média jamais partagé du projet — sa clé objet
> n'appartient qu'à lui, donc le copier voudrait dire **dupliquer le binaire**) ; **les messages
> rattachés** (un message est un événement daté et signé ; le repointer ferait mentir l'historique,
> le dupliquer créerait un message que personne n'a envoyé). Le contenu copié est **le même que le
> cycle source soit brouillon ou diffusé**.

> **Tranché en #4** (les dates) : elles ne sont **pas recopiées** mais **recalculées** depuis le
> lundi de la semaine cible (`planWeekCopyShiftDays`, `@cmv/shared`). Le décalage se prend entre les
> deux **lundis**, jamais entre les numéros de semaine : `(M−N)×7` ne vaut qu'à l'intérieur d'un même
> cycle, alors que la copie traverse aussi deux cycles aux `startDate` différents. Les deux étant des
> lundis, le décalage est **toujours un multiple de 7** — le jour de la semaine tient, et
> `@@unique([planWeekId, scheduledDate, position])` reste satisfaite après translation (l'application
> est injective). Corollaire : **le collage ne crée jamais la semaine cible**. `weekNumber` est
> contigu et `addWeek` n'ajoute qu'en `count + 1` ; coller sur « la semaine 9 » d'un cycle de 3
> fabriquerait 4 à 8 vides en silence. Le coach ajoute sa semaine, puis colle.

> **Tranché en #4** (la semaine cible non vide) : **remplacement**, jamais fusion. Ce n'est pas un
> choix de confort — deux semaines portant chacune une séance le mardi en position 0 collisionnent
> sur l'unicité, et renuméroter pour absorber réordonnerait la journée du coach sans qu'aucune règle
> ne dise qui passe devant. L'API remplace sans état d'âme (elle est idempotente) ; c'est **l'UI** qui
> porte la confirmation, armée à la manière d'une suppression et seulement quand il y a quelque chose
> à écraser. Le toast annonce ensuite le nombre de séances qui ont atterri — sans quoi un collage
> remplaçant 4 séances par 2 passerait inaperçu.

> **Tranché en #4** (le cycle diffusé) : coller dans un `PUBLISHED` est **refusé** (409). Chaque
> séance écrite notifierait l'athlète séparément et rien ne groupe ces notifications (dette **N-6**,
> [#98](https://github.com/Cimavia/cimavia/issues/98)) : une semaine de cinq séances lui enverrait
> cinq notifications et cinq push. Le geste n'existe donc pas sur un cycle diffusé plutôt que
> d'exister en harcelant. **Ce n'est PAS de la dette** : c'est un choix de périmètre, et non une
> feature reportée — aucune issue ne la porte. Le jour où on voudrait l'ouvrir, #98 devrait atterrir
> d'abord. En revanche, **copier DEPUIS un cycle diffusé est autorisé** : lire ne mute rien, et
> « reprendre le bloc du mois dernier » est le cas d'usage même de la feature.

> **Tranché en #4** (la brique partagée avec [#5](https://github.com/Cimavia/cimavia/issues/5)) : on
> n'écrit **pas** de service de copie profonde générique, mais on isole l'**atome** que #5 appellera N
> fois. #5 a quatre exigences que #4 n'a pas — réassigner à un autre athlète, créer le plan cible qui
> n'existe pas encore, décaler vers un lundi arbitraire, ne pas copier la facture (1:1 avec le cycle,
> P6) — et son corps dit encore « à préciser plus tard » sur trois d'entre elles : généraliser
> maintenant, ce serait concevoir contre une spec inventée. L'atome extrait est
> `insertScheduledSessionExercises` (`plan/scheduled-session.writer.ts`), qui reçoit les documents
> **déjà résolus par l'appelant** — c'est là tout le seam : une **création** les lit dans la
> bibliothèque, une **copie** les lit sur l'instance source, parce que `sourceExerciseId` passe à
> `null` (`SetNull`) si le coach a supprimé l'exercice entre-temps et que repasser par la bibliothèque
> perdrait alors des documents que l'instance porte pourtant encore. Reste à #5 : la création du plan,
> la réassignation d'athlète, le choix du lundi, la facturation.

> **Tranché en #4** (le presse-papier, côté web) : il vit dans `sessionStorage` derrière
> `useSyncExternalStore`, et non dans un `useState` ni un provider. Il doit survivre au **changement
> de route** (copier dans un cycle pour coller dans un autre est la moitié de la feature, et un état
> local mourrait au démontage du builder), **mourir avec l'onglet**, et être lu par des composants
> **frères** (chaque carte de semaine, plus le bandeau) — le stockage *est* déjà l'état partagé, un
> contexte ne ferait que le recopier. Deux conséquences assumées : aucun partage **entre onglets**
> (déclencheur : aucun — un coach ne construit pas un cycle dans deux onglets), et **coller ne vide
> pas** le presse-papier, parce que reproduire une même semaine sur plusieurs semaines d'affilée est
> le geste courant.
>
> Complété en [#341](https://github.com/Cimavia/cimavia/issues/341) : « mourir avec l'onglet » ne
> couvrait pas le **changement de compte** dans le même onglet — il est désormais vidé par la purge
> commune, et quand sa semaine ou son cycle disparaît.

> **Écart de maquette assumé** : `coach_builder_planification.dc.html` ne prévoit **aucun** geste de
> copie — l'en-tête de semaine n'y porte que le type, le compteur de séances et « Déplier ». Les deux
> boutons (« Copier », « Coller ici ») y ont été ajoutés, plus un **bandeau** en tête du builder
> nommant la semaine armée. Le bandeau n'est pas décoratif : le presse-papier survivant à la
> navigation, des boutons « Coller ici » apparaîtraient sinon sur un autre cycle sans que rien ne dise
> ce qui est armé ni d'où il vient.

---

## Post-MVP — Athlète facultatif sur un cycle ([#143](https://github.com/Cimavia/cimavia/issues/143))

> **Tranché en #144** (le verrou se DÉPLACE, il ne disparaît pas) : `athleteId` devient facultatif à
> la **création** et reste obligatoire à la **diffusion** — même dispositif que la facturation (P6).
> Un cycle se construit avant qu'on sache pour qui ; il ne se diffuse pas sans savoir à qui.
>
> Le contrôle de `publish` passe **avant** celui des semaines et avant la branche auto-coaching.
> L'ordre n'est pas cosmétique : un cycle sans athlète NI facturation échouerait sinon sur le
> message de facturation, qui ne dit pas ce qui manque vraiment — et le coach chercherait un
> montant là où il lui manque quelqu'un à qui parler. Les deux surfaces client suivent le même
> ordre (`publishBlockedKey`, `hintKeyFor`).

> **Tranché en #144** (six tables, pas cinq) : `athleteId` est dénormalisé sur toute la chaîne de
> planification, parce que l'extension tenant filtre par un champ du modèle **interrogé** et ne sait
> pas remonter la relation. L'issue en énumérait cinq ; il y en a **six** —
> `scheduled_session_exercise_tag` porte la colonne elle aussi, et l'oublier laissait composer un
> exercice sans tag dans un brouillon non affecté, puis casser en 500 dès qu'on lui en ajoutait un.
>
> L'invisibilité qui en découle est **structurelle et non applicative** : un `NULL` ne satisfait
> jamais `where: { athleteId }`. Aucune règle ne pense à exclure ces cycles — ils ne peuvent pas
> être trouvés. Un e2e le fige sur **deux** athlètes du même coach, sans quoi la propriété resterait
> un accident heureux.

> **Tranché en #144** (la propagation descend par IDENTIFIANTS, pas par filtre relationnel) :
> `plan_week` et `scheduled_session` se joignent par `planId` ; les trois tables suivantes n'en ont
> pas. Un `where: { scheduledSession: { plan: { … } } }` aurait tenu en une requête, mais son SQL
> n'est vérifiable qu'à l'exécution — sur un invariant de tenant, on prend le chemin qui se lit.
> Le tout dans **une** transaction : un cycle à moitié affecté est un cycle dont la moitié des
> séances reste invisible de son athlète, et c'est la pire panne possible ici, parce qu'elle est
> muette.

> **Tranché en #144** (la facture brouillon SUIT le destinataire) : `issueForPlan` ne réécrit que le
> statut de la facture, jamais son athlète. Sans propagation, « j'affecte à A, je chiffre, je
> réaffecte à B, je diffuse » émettait à **A** une facture pour un cycle que **B** s'entraîne. Ni
> #144 ni #145 ne voyaient ce bug — il naît de la nullabilité elle-même.
>
> **Détacher** un cycle déjà chiffré est en revanche refusé (409) : `Invoice.athleteId` est NOT
> NULL, et un montant qu'on n'adresse à personne n'a pas de sens. Le refus ne bloque rien — affecter
> quelqu'un d'autre reste ouvert, la facture suit. On n'a **pas** choisi de supprimer le brouillon,
> qui aurait fait perdre une saisie en silence ; et un « videz d'abord la facturation » aurait été
> une impasse, aucune route ne permettant d'effacer un brouillon de facture (`PUT` seulement).
>
> **Angle mort assumé** : réaffecter un brouillon chiffré **à soi-même** (compte à double capacité)
> laisse une facture brouillon inerte — `publish` n'émet pas en auto-coaching (#14), et la section
> est masquée. Elle ne part chez personne, elle dort. Déclencheur pour la traiter : la route de
> suppression d'un brouillon de facture, qui manque par ailleurs.

> **Tranché en [#472](https://github.com/Cimavia/cimavia/issues/472)** (les termes suivent, le
> justificatif non) : `followPlanAthlete` ne réécrivait que `athleteId`, et le PDF joint suivait tel
> quel — diffusé, le cycle émettait au second athlète un document rédigé pour le premier : son nom,
> son adresse, son montant. Constaté sur la base de dev en testant #293. Le montant, la note et
> l'échéance se relisent dans le formulaire ; un PDF est un document fermé qui nomme quelqu'un.
>
> - **Changer de destinataire est refusé (409) tant qu'un justificatif est joint**
>   (`assertDocumentDetached`, appelée par `assertReassignable`), et le sélecteur du builder se
>   ferme en disant quoi faire. Renvoyer le même athlète passe. On n'a **pas** choisi de retirer le
>   PDF à sa place : la réaffectation détruirait un fichier fourni par le coach sans qu'il l'ait
>   demandé — même raisonnement que le brouillon qu'on ne supprime pas, plus haut.
> - **La diffusion refuse (409) un justificatif segmenté sous un autre athlète que la facture**
>   (`issueForPlan`). C'est la garde des brouillons réaffectés AVANT ce correctif, que la première
>   ne rattrape pas ; un e2e rejoue cet état en base. Pas de reprise de données : la garde bloque
>   leur émission, et le coach retire ou remplace le PDF.
> - La clé signée pour l'ancien destinataire, puis rattachée après la réaffectation, ne passait
>   déjà plus : le rattachement recalcule le préfixe sur le destinataire courant (#293). Figé par
>   un e2e, sans code.
>
> **Conséquence pour [#285](https://github.com/Cimavia/cimavia/issues/285)** : « la clé du
> justificatif est segmentée sous l'athlète de SA facture » tient désormais par construction pour
> tout nouveau document — mais **pas pour les factures déjà émises** avant ce correctif (la base de
> dev en porte une). Une purge qui travaillerait par préfixe d'athlète supprimerait leur PDF chez
> le mauvais titulaire : les clés se collectent depuis les lignes en base, jamais par préfixe.

> **Précision sur l'invariant P6** : « un DRAFT existe ⇒ la facturation est remplie » gagne une
> seconde implication — « un DRAFT existe ⇒ le cycle a un destinataire », puisque la saisie est
> fermée sans athlète. Le verrou de `publish` sur `athleteId` n'en devient pas redondant pour
> autant : un cycle sans athlète **ni** facturation échouerait sinon sur le mauvais message. Et
> l'implication inverse reste fausse depuis #14 — un cycle **auto-coaché** se diffuse sans aucune
> facture.

> **Écart de maquette assumé** : `coach_builder_planification.dc.html` ne prévoit **aucun** sélecteur
> d'athlète — son en-tête ne porte que le titre du cycle et « Diffuser le plan », le destinataire
> n'y étant qu'un texte. Le sélecteur y a été ajouté. Sur un cycle diffusé il est **désactivé et
> expliqué**, jamais masqué — #145 disait les deux (« absent une fois diffusé » d'un côté, « trois
> désactivations, une seule grammaire » de l'autre) ; c'est la seconde qui l'emporte, parce qu'elle
> porte son raisonnement et qu'elle aligne le sélecteur sur « Coller ici » et sur « Supprimer ».
>
> **Révisé en [#207](https://github.com/Cimavia/cimavia/issues/207)** (l'emplacement, et lui seul) :
> le sélecteur était posé dans l'en-tête **fixe**, au motif qu'un cycle de douze semaines se
> parcourt longtemps et que l'affectation ne doit pas obliger à remonter. Il descend dans le
> formulaire d'en-tête, avec le titre, la description et le début. Un seul endroit pour tout ce qui
> définit le cycle l'emporte sur l'accès sans défilement : l'affectation se fait une fois par
> cycle, pas en cours de construction. La fermeture après diffusion, elle, ne bouge pas — elle
> s'étend même aux trois autres champs.

---

## Post-MVP — Édition de l'en-tête d'un cycle ([#207](https://github.com/Cimavia/cimavia/issues/207))

> **Tranché en #207** (le verrou de diffusion s'étend, il ne se dédouble pas) : `title`,
> `description` et `startDate` rejoignent `athleteId` dans ce qu'un cycle **diffusé** ne laisse plus
> réécrire — même 409, message distinct. La grammaire est celle du destinataire, la raison ne l'est
> pas : là où l'athlète « en a déjà été prévenu », ici il s'entraîne dessus, et un cycle qui bouge
> sous ses pieds est pire qu'un cycle qu'on ne peut plus corriger.
>
> Le 409 n'a cassé aucun usage : **aucun client n'envoyait ces trois champs**. Le web n'appelait
> `PATCH /plans/:id` que pour `{ athleteId }`, et `/plans` n'est pas une surface mobile (#20). On a
> fermé une porte que personne n'ouvrait — juste avant d'ouvrir l'interface qui, elle, s'en sert.
>
> La CAPACITÉ de décalage (`shiftSessions`) reste entière : elle sert au brouillon. Décaler un cycle
> **diffusé** (athlète blessé, report d'une semaine) est un besoin réel, mais demande de prévenir
> l'athlète — hors périmètre ici. Le renvoi vers #172 était une **erreur d'aiguillage** : #172 traite
> l'invisibilité d'un cycle diffusé, pas son report. Le sujet vit désormais dans
> [#231](https://github.com/Cimavia/cimavia/issues/231), dont le déclencheur est un coach qui le
> demande — aucun ne l'a fait à ce jour.

> **Ce que l'avertissement de décalage promet, et ce qu'il ne promet pas** : déplacer le début
> rejoue les dates de **toutes les séances**, et l'interface le dit avant l'enregistrement — sinon
> un report d'un mois se lirait comme un simple champ de formulaire. Il ne parle que d'elles :
> l'échéance de la facture brouillon (`Invoice.dueDate`) est une saisie du coach et **ne suit pas**,
> décaler un cycle n'impliquant pas de décaler le paiement. La `period`, elle, reste juste sans
> qu'on s'en occupe : `periodOf(plan)` la recalcule à l'émission, dans la transaction de `publish`.

> **Écarts assumés** (le prix du constructeur direct) : « Nouvelle planification » crée la ligne en
> base et ouvre le constructeur, donc **des brouillons vides vont s'accumuler** — un clic vaut un
> cycle. Le recours existe déjà et reste ouvert tant qu'il est brouillon (« Supprimer le cycle »).
>
> Le **titre par défaut** écrit en base n'est pas le repli silencieux qu'interdit la règle dure n°5 :
> le champ est à l'écran, vide de sens et immédiatement modifiable — la valeur ne prétend pas être
> une donnée.
>
> Le raccourci **« créer N semaines d'un coup »** (`weekCount`) disparaît avec le panneau, et le
> formulaire d'en-tête ne le reprend pas : retirer une semaine détruit ses séances, ce n'est pas un
> champ qu'on décrémente. Un cycle de douze semaines se construit avec « Ajouter une semaine ». À
> rouvrir si le geste se révèle pénible à l'usage.

> **Écart de maquette rattrapé** : `coach_builder_planification.dc.html` réservait déjà une bande
> « plan meta » en tête de la colonne builder — semaines, séances, **début du cycle**, description.
> Le code les avait posées ailleurs : compteurs et date dans le sous-titre de l'`AppShell`,
> description en paragraphe. Le formulaire reprend l'emplacement de la maquette, et la date **quitte
> le sous-titre** plutôt que de s'y lire une seconde fois dans un autre format. `plan.card.meta` la
> garde pour la LISTE des cycles, qui n'offre aucun formulaire où la corriger.
>
> Reste non implémenté de cette bande : l'indicateur « Enregistré il y a 2 min » de la maquette, qui
> suppose un **auto-save**. Aucune surface du produit ne fonctionne ainsi (séances, facturation,
> exercices : bouton explicite) ; l'en-tête suit la règle commune. Écart antérieur à #207, inchangé.

> **Tranché en [#326](https://github.com/Cimavia/cimavia/issues/326)** (la diffusion part avec
> l'ENREGISTRÉ, donc rien ne part tant que l'écran montre autre chose) : le bouton explicite de
> l'en-tête a un prix que #207 n'avait pas vu — « Diffuser », dans le bandeau fixe, ignorait la
> saisie en cours. Un destinataire corrigé Léa → Tom sans enregistrer envoyait le cycle, sa
> notification et sa facture à Léa, sans retour possible. La **facturation** avait le même trou
> (un montant changé partait à l'ancien), traité dans la même PR.
>
> - **« Diffuser » se ferme, il n'enregistre pas d'office.** Enregistrer en passant ferait partir
>   en un clic deux écritures dont la première peut échouer (titre vide, 409 du justificatif #472),
>   et diffuserait une saisie que le coach n'a pas relue comme définitive.
> - **L'ordre des raisons** : en-tête non enregistré → destinataire manquant → facturation non
>   enregistrée → facturation manquante. Une saisie en attente passe AVANT le manque qu'elle
>   comble : le coach qui vient de choisir Tom lirait sinon « choisis le destinataire ».
> - **« Non enregistré » couvre « en cours d'enregistrement »** : la saisie se compare aux valeurs
>   du serveur, elle reste un écart jusqu'à la relecture. `isBusy` ferme en plus la diffusion
>   pendant toute écriture du builder.
> - **Une date de début effacée ou illisible compte comme un écart**, bien qu'elle ne parte pas à
>   l'enregistrement : l'écran ne montre plus la date que la diffusion emporterait.
> - **Les formulaires gardent leur état** et ne remontent qu'un booléen (`useReportDirty`), remis à
>   faux à leur démontage — sinon une facturation masquée (passage en auto-coaching) fermerait la
>   diffusion sans plus aucun champ où la lever.
> - Après diffusion, l'en-tête est **remonté** (`key={plan.status}`) : ses champs grisés repartent
>   de l'enregistré au lieu de garder une saisie qui n'est pas partie.
>
> La **navigation** hors du builder avec une saisie en cours est gardée depuis
> [#327](https://github.com/Cimavia/cimavia/issues/327), sur ces deux mêmes booléens — le panneau
> d'une séance planifiée, gardé à son tour depuis [#518](https://github.com/Cimavia/cimavia/issues/518)
> (**G-1**).

---

## Post-MVP — Ordonner et déplacer les séances d'un cycle ([#93](https://github.com/Cimavia/cimavia/issues/93) · [#148](https://github.com/Cimavia/cimavia/issues/148))

> **Tranché en #93** (la dette était périmée, l'issue a changé d'objet) : le `SessionBuilder` a le
> glisser-déposer **depuis son commit de création** — #165 disait « absorbe #93, fermer en la
> référençant », et ne l'a pas fait. #93 a donc été **recyclée** plutôt que fermée : son numéro
> porte désormais les deux surfaces qui n'avaient réellement que des flèches, la **séance
> planifiée** (`CompositionEditor`) et les **séances d'une journée** (`PlanDayCell`), plus le
> déplacement d'un jour à l'autre. Fermer et rouvrir aurait perdu la trace de ce qui avait été
> livré — c'est précisément ce qui a manqué ici.

> **Tranché en #93** (pas de dnd-kit, et l'issue demandait le contraire) : le glisser tourne sur
> `useReorderDrag` + `CmvDragHandle`, faits maison et déjà éprouvés sur cinq surfaces. La
> dépendance que l'issue prescrivait n'a jamais été nécessaire, et le travail d'accessibilité
> qu'elle redoutait est déjà payé : la poignée **est** un bouton focusable qui répond aux flèches.

> **Tranché en #148** (la poignée SANS flèches dans la grille de semaine) : le constructeur de
> séance double le glisser de boutons ↑/↓ ; la case d'un jour, qui fait un septième de la largeur,
> ne le peut pas. L'issue les prescrivait pourtant. Deux boutons de plus par séance y seraient
> illisibles, et la poignée porte déjà le chemin clavier — l'esprit de la règle tient, sa lettre
> non. Le glisser reste **borné à la semaine** : l'état vit dans `PlanWeekCard`, et la route
> serveur est scopée à une semaine. Deux cycles, ou deux semaines, ne communiquent pas.

> **Tranché en #148** (le sujet d'une notification peut être une DATE, et reste une donnée) :
> `PLAN_SESSIONS_REORDERED` ne nomme aucune séance — un ORDRE n'appartient à aucune d'elles. Son
> `subjectLabel` porte le **jour en ISO**, jamais mis en forme par l'API : la règle de #48 vaut ici
> comme ailleurs, une ligne écrite aujourd'hui resterait française le jour où `en.json` arrive.
> `notificationSubject` reçoit donc le `formatFullDay` de l'app appelante — et non une `locale`,
> qui rouvrirait le point d'injection que `createFormatters` (#137) a fermé.

> **Tranché en #148** (un trou de position était un bug, pas une dette) : `nextPosition` COMPTE les
> séances du jour, ce qui ne donne un rang libre que si les rangs sont contigus. Rien ne les
> recollait après une suppression ni après un changement de jour : deux séances le lundi, on
> supprime la première, on en ajoute une — **500** sur `@@unique([planWeekId, scheduledDate,
> position])`, pour un geste que rien ne reliait au précédent. Corrigé dans la même PR
> (`compactDay`), avec les deux e2e qui le prouvent. L'issue #148 ne l'avait pas vu : elle
> n'annonçait la contrainte que pour la permutation.

> **Tranché en #93** (la journée d'arrivée se DÉCLARE, elle ne se déplace pas) : déplacer une
> séance d'un jour à l'autre aurait pu être une route à part (`PATCH …/day`). C'est la route
> d'ordre qui s'élargit : son tableau ne décrit plus une permutation, il **définit le contenu** du
> jour visé — l'idiome replace-all de tout le produit. Le client n'écrit donc qu'**une** journée,
> celle d'arrivée ; le serveur retire la séance de son jour d'origine et l'y recolle. Envoyer les
> deux journées serait deux écritures, donc deux notifications pour un seul geste. Ce qui reste
> interdit : **omettre** une séance déjà posée ce jour-là, qui ne dirait pas où elle va.

> **Tranché en #93** (un déplacement s'annonce comme une SÉANCE MODIFIÉE, pas comme un
> réordonnancement) : changer le jour d'une séance émet déjà `PLAN_UPDATED` depuis le sélecteur
> « Jour » du panneau. Le glisser est le même geste par un autre chemin — deux gestes identiques
> ne doivent pas produire deux messages différents. Quand un appel déplace ET réordonne, seul le
> déplacement s'annonce : dire « séances réordonnées » à un athlète dont la séance est passée au
> mardi l'enverrait chercher au mauvais endroit.

> **Tranché en #93** (la poignée s'affiche même sur une séance SEULE dans sa journée) : #148 la
> masquait dans ce cas — « ce serait du décor ». C'était vrai tant que le glisser ne sortait pas
> du jour ; ça ne l'est plus. L'affordance dit ce que le geste permet, pas ce qu'il permettait.

> **Piège coûteux (#93)** — `splice` compte les indices NÉGATIFS depuis la fin. En extrayant le
> calcul du dépôt dans un util pur, la borne que `useReorderDrag` portait a été perdue : la flèche
> ↑ sur la première séance visait `-1` et l'aurait déplacée en **avant-dernière** place, sans rien
> signaler. Attrapé par le test du cas limite, pas par le typecheck — un indice hors plage est un
> `number` valide.

> **Piège coûteux (#93)** — la carte de séance est DANS la case du jour, qui est elle aussi une
> cible de dépôt. Sans `stopPropagation` sur la carte, l'événement remonte et la case écrase le
> rang visé par celui de sa fin de file : **toute** séance déposée atterrit en dernier, et le
> « rang exact » ne marche jamais. C'est le seul cas qu'un test à une seule journée ne voit pas.

> **Tranché en #148** (le décalage de renumérotation se DÉDUIT, il n'est pas une constante) :
> l'issue prescrivait `position + 1000`. Une journée qui porte déjà des trous — le cas d'avant ce
> correctif — peut occuper un rang supérieur à son propre effectif, et une constante finit par
> retomber dessus. Les deux passes garent donc au-dessus du **maximum observé**, libre par
> construction. Sans elles, l'échange de deux séances casse : `duplicate key value violates unique
> constraint "scheduled_session_planWeekId_scheduledDate_position_key"`, vérifié.

---

## Post-MVP — Hauteur des cases de la semaine athlète ([#206](https://github.com/Cimavia/cimavia/issues/206))

> **Tranché en #206** (l'écart est à la MAQUETTE, pas au code) : `athlete_web.dc.html` dessine
> elle-même la rangée en dents de scie — chaque jour y est un bloc nu, la carte prend la hauteur de
> son texte, et seul « Repos » porte un `min-height:100px`. L'implémentation lui était donc
> **fidèle** : ce que la grille fait désormais est un écart assumé, dans le sens inverse de ~~P3-5~~
> (le code rend mieux que la maquette). Sans cette ligne, une relecture de la maquette rétablit le
> défaut en croyant corriger une dérive.

> ⚠️ **Amendé en #172** : les deux encadrés qui suivent décrivent l'étirement des cartes, retiré
> depuis. Le geste qu'ils justifient (`flex-1` + `auto-rows-fr` sur le conteneur du jour) rendait la
> carte d'un jour peu chargé aussi haute que la pile d'un jour plein — voir *Cycles diffusés cumulés*
> plus bas. Ce qui SURVIT d'eux : le plancher vaut à toutes les largeurs, et rien de tout cela ne
> s'écrit dans `AthleteSessionCard`, qui sert aussi la liste verticale de `/sessions`.

> **Tranché en #206** (l'étirement s'écrit dans la COLONNE, jamais dans la carte) :
> `AthleteSessionCard` sert aussi la liste verticale de `/sessions`, où étirer n'aurait aucun sens.
> C'est le conteneur du jour qui porte `flex-1` + `auto-rows-fr` — les éléments de grille s'étirent
> d'eux-mêmes. Le seul ajout à la carte est un `mt-auto` sur le statut, qui vaut zéro tant qu'il n'y
> a pas de hauteur en trop à distribuer : un seul rendu, deux contextes.

> **Tranché en #206** (le plancher vaut à TOUTES les largeurs, après un aller-retour) : le premier
> jet bornait plancher et étirement à `xl`, au motif que la rangée de sept jours n'existe que là.
> Le rendu réel a démenti : en `md:grid-cols-2`, la boîte « Repos » gardait son `min-h-24` quand la
> carte de séance n'en avait toujours aucun — l'écart de plancher exact que l'issue décrit, laissé
> intact là où on le voit. Le plancher est donc porté par le conteneur du jour, sans préfixe, et
> retiré de la boîte « Repos » : un seul plancher, une seule définition. L'écart assumé de l'issue
> ne portait que sur l'**autre** geste, `auto-rows-fr` sur la grille EXTERNE, qui donnerait à
> chacune des huit cases de `md` la hauteur de la plus haute séance de la semaine. Celui-là n'est
> toujours pas posé : les rangées de `md` restent indépendantes les unes des autres.

---

## Post-MVP — Planifications lues par athlète ([#225](https://github.com/Cimavia/cimavia/issues/225))

> **Tranché en #225** (on lit des ATHLÈTES, plus des cycles) : `/plans` servait une grille de cartes
> rangée par date de début, à charge pour le coach de recomposer de tête qu'un même athlète en avait
> un en cours, un à venir et deux terminés — dix-huit cartes pour répondre à « où en est Léa ».
> L'écran groupe désormais par athlète — cycle courant, échéance, historique dépliable et paginé —
> et la dérivation entière (situation, échéance, ordre des lignes, ordre de l'historique) vit dans
> `@cmv/shared` (`plan-row.util.ts`). Même raisonnement qu'en #120 : un tri faux ne se voit pas, rien
> à l'écran ne le signale, d'où des fonctions pures et mesurées plutôt qu'une composition dans le JSX.
>
> Corollaire assumé, le même qu'en #120 : le tableau ne connaît que les athlètes ayant **au moins un
> cycle**. Celui qui n'a jamais été planifié n'a pas de ligne — le lister demanderait le
> `GET /athletes` que #225 retire justement de cet écran. Il reste visible au **tableau de bord**
> (#113), qui part des athlètes et non des cycles, et le sous-titre dit « N athlètes planifiés »,
> pas l'écurie entière.

> **Tranché en #225** (l'ordre se lit dans la colonne qu'il trie) : les lignes se rangent par
> situation — `ENDED` d'abord (l'athlète n'a plus rien, et `selectCurrentPlan` aurait élu un cycle à
> venir s'il en existait un), puis les cycles en cours par fin la plus proche, puis ceux à venir, qui
> ne demandent rien. La colonne de droite dit quelque chose pour les trois — « terminé depuis 3
> semaines », « se termine dans 1 semaine », « commence le 21 sept. » — si bien qu'elle raconte le
> tri de haut en bas. C'est ce qui l'a fait préférer à la variante « N cycles » de la maquette : un
> décompte ne reflète aucun ordre, et un tri faux y serait invisible.
>
> Conséquence : la planche annonçait « Trié par fin de cycle la plus proche » dans la barre d'outils.
> Le libellé est **retiré** — la facturation n'en a pas, et il était faux dans les quatre frames.

> **Tranché en #225** (un athlète sans cycle DIFFUSÉ n'a pas d'époque) : entre l'affectation d'un
> brouillon et sa diffusion — le parcours normal depuis #207 — un athlète n'a que des brouillons.
> Sa `situation` est alors `null`, sa colonne « Cycle » rend « — », et il n'apparaît sous **aucun
> segment**, seulement sous « Tous ». Ouvrir un quatrième segment donnerait un nom d'époque à ce qui
> n'en a pas ; le ranger dans « Terminés » inventerait un travail au coach. Il se range **deuxième**
> au tri, derrière celui qui n'a plus rien et devant ceux dont un cycle court : rien ne lui est servi
> non plus, mais le coach a commencé.
>
> Corollaire visible : `countPlanAthletesBySituation.ALL` peut **dépasser** la somme des trois autres
> segments. C'est exact, et c'est le prix de ne pas inventer d'époque. Cas non dessiné par la
> maquette — à rouvrir si le bac des brouillons ne suffit pas à le rendre lisible.

> **Tranché en #225** (le recouvrement avec le tableau de bord est assumé) : `/` porte déjà une
> colonne « Planification » par athlète (cycle courant, semaine n/N, phase, #113). Les deux écrans ne
> répondent pas à la même question — le tableau de bord dit « qui a besoin de moi maintenant »,
> l'état de l'instant sur une ligne ; la liste des cycles dit « qu'est-ce que je lui ai construit »,
> l'historique, les brouillons et les cycles terminés. La colonne du dashboard **reste**. Le
> dispositif qui empêche les deux de diverger est `currentAthletePlan`, exportée d'`athlete-row.util.ts`
> en #225 et désormais seule à choisir le cycle courant — deux dérivations parallèles auraient fini
> par désigner deux cycles différents pour le même athlète, sur deux écrans qu'un coach lit à la suite.

> **Signalé en #225, corrigé en #172** : #225 avait posé une pastille et un bandeau pour montrer que
> deux cycles diffusés qui se chevauchent n'étaient servis qu'à moitié — `selectCurrentPlan` en
> retenait un, l'athlète ignorait l'autre —, en précisant que le correctif vivait dans
> `AthletePlanService` et qu'il ne fallait pas fermer #172 sur la foi de ce rendu. C'est fait : les
> cycles s'accumulent, l'athlète les voit tous.
>
> Le signalement, lui, **a dû être repris** : ses noms disaient l'anomalie corrigée. `PlanOverlap`
> (`servedPlanId` / `hiddenPlanIds`) est devenu `PlanConcurrency` (`planIds`), et
> `plan.overlap.notice` — « « P1 » ne lui est pas servi » — a laissé place à `plan.concurrency`, qui
> dit ce qui reste vrai : sur cette fenêtre, l'athlète mène deux cycles **de front**. C'est une
> charge, plus un défaut de lecture. Le piège que #225 documentait (le cycle commencé le plus tôt est
> l'invisible) n'existe plus, et son paragraphe est retiré avec lui.

> **Assumé en #225** (pas de pagination) : `GET /plans` n'est toujours pas borné, et cette issue ne
> le borne pas — même famille que **D-1** et l'épic [#68](https://github.com/Cimavia/cimavia/issues/68).
> Le groupement réduit le nombre de LIGNES visibles, ce qui est le vrai problème de lecture ; le
> volume réseau reste entier. Seul l'historique déplié pagine, à cinq par athlète.

> **Trouvé en chemin, corrigé en #225** (une annotation `i18n-values` appartient au fichier qui BÂTIT
> la clé) : `i18n-values plan.status: PlanStatus` vivait dans `PlanList`, qui n'assemblait pas cette
> clé — c'est `PlanStatusLine` qui le fait. Le registre de `check:i18n` étant global (cf. l'encadré
> *Trouvé en chemin, corrigé en #120* ci-dessus), il était couvert par accident, et la suppression de
> `PlanList` l'a mis au jour. Deuxième symptôme du même défaut de portée du script.

> **Trouvé en chemin, corrigé en #225** (une clé citée par une annotation doit être une FEUILLE) :
> `checkSuffixesUnder` exige que `prefix.VALEUR` soit une chaîne au catalogue. Une clé pluralisée en
> `_one`/`_other` seulement n'en est pas une, et l'annotation échoue. Le catalogue porte donc le
> **singulier sur la clé de base** plus une variante `_other` (`plan.deadline.ENDS_IN`), comme
> `library.builder.usedInSessions`. Là où le nombre est toujours ≥ 2 ou toujours neutre, on passe
> `n` et non `count`, pour ne pas déclencher une pluralisation sans variante — convention héritée
> d'`InvoiceToolbar`.

> **Trouvé en chemin, corrigé en #225 — sur les deux écrans** (segment et recherche ne se comptent
> pas pareil) : #120 avait posé « les décomptes se font sur les lignes NON filtrées », pour la bonne
> raison qu'ouvrir « À jour » ne doit pas mettre les autres segments à zéro — on ne pourrait plus en
> sortir. La règle avait été étendue telle quelle à la RECHERCHE, sans que le raisonnement soit
> reposé. Or les deux ne font pas la même chose : le segment TRANCHE la liste, la recherche la
> RÉDUIT. Conséquence visible en bêta : « mar » tapé au clavier laissait « Terminés 1 » à l'écran
> alors qu'aucun athlète nommé « mar » n'a de cycle terminé — un décompte non nul dont le clic mène
> à « Aucun athlète ne correspond ».
>
> `countAthletesBySituation` et `countPlanAthletesBySituation` prennent désormais la recherche et
> ignorent toujours le segment. Corrigé des DEUX côtés dans le même commit : c'est le même défaut,
> et le réparer d'un seul aurait fait diverger deux barres d'outils qui doivent se ressembler. Un
> test par écran tient l'invariant qui manquait — pour chaque segment, son décompte égale le nombre
> de lignes que le clic donnerait.

> **Extrait en #225** (`pagination.util.ts`) : `pageOfInvoices` était déjà générique mais nommée
> d'après les factures, et l'historique des cycles pagine à l'identique. `pageOf` et
> `HISTORY_PAGE_SIZE` vivent désormais à part ; `pageOfInvoices`, `InvoicePage` et
> `INVOICE_HISTORY_PAGE_SIZE` en sont des alias, pour leurs appelants et parce qu'ils disent CE QU'ON
> pagine. Aucun changement de comportement.

---

## Post-MVP — Cycles diffusés cumulés ([#172](https://github.com/Cimavia/cimavia/issues/172))

> **Tranché en #172** (les cycles diffusés s'ACCUMULENT, ils ne se remplacent pas) : un coach
> diffusait un second cycle pour un athlète qui en avait déjà un, obtenait un `200`, sa facture était
> émise et sa notification partie — et l'athlète ne voyait rien. `GET /me/plan` n'en servait qu'un,
> élu par `selectCurrentPlan` (« en cours > à venir > terminé »), et le choix était **délibéré** :
> l'athlète avait un cycle courant, pas une bibliothèque de cycles.
>
> Le silence était le vrai défaut, mais le corriger en le SIGNALANT au coach aurait laissé debout la
> lecture qui le produit. `GET /me/plans` sert désormais **tous** les cycles en cours et à venir. Un
> athlète peut suivre deux cycles la même semaine ; c'est un cas d'usage (un bloc de force et une
> prépa falaise), pas une anomalie à empêcher.
>
> Conséquence sur le vocabulaire, à ne pas laisser dériver : `selectCurrentPlan` **reste**, et n'est
> plus ce que voit l'athlète. Il désigne le cycle qui RÉSUME un athlète en une ligne — la colonne du
> tableau de bord (#113), la ligne de la liste (#225) —, parce qu'une cellule n'en contient qu'un et
> que « plusieurs » n'y répond pas. Son commentaire disait « le coach en a diffusé un remplaçant → le
> plus récent gagne » : la moitié « remplacement » est **fausse depuis #172** et a été retirée, le
> départage par date de début la plus récente reste.

> **Tranché en #172** (un cycle à venir est promis, donc visible) : la règle d'avant masquait un
> cycle diffusé jusqu'à sa date de début — non par décision, mais faute de place dans une réponse à
> un seul cycle. L'athlète voit désormais ce qui l'attend. C'était la question ouverte du corps de
> #172 (« c'est peut-être le vrai sujet ») ; elle l'était.

> **Tranché en #172** (le dernier cycle terminé reste servi, seul) : quand plus rien ne court ni
> n'arrive, `selectVisiblePlans` retombe sur le dernier cycle terminé. Ce n'est pas une complaisance
> au sens de la règle dure n°5 mais l'état « hors cycle » que les deux clients affichent déjà — sans
> lui, un athlète entre deux cycles verrait un écran vide au lieu du dernier cycle reçu. Son
> HISTORIQUE, lui, n'est pas servi : un seul cycle, le plus récent.

> **Tranché en #172** (liste vide ≠ `null`) : `GET /me/plans` rend `[]` pour un athlète sans cycle
> diffusé. La question a reçu une réponse ; le `null` reste réservé à la requête qui n'a pas abouti,
> et les deux clients distinguent déjà les deux. Les confondre ferait attendre son coach à un athlète
> qui n'a qu'une panne réseau.

> **Tranché en #172** (l'ossature du planning athlète devient la semaine CIVILE) : les deux écrans
> étaient bâtis sur « la semaine N d'UN cycle » — `?week=3` dans l'URL, une `PlanWeekDto` dans la
> grille, `resolveShownWeek` pour choisir laquelle. Deux cycles concurrents n'ont aucune raison d'en
> être à la même semaine : la S3 de l'un tombe sur la S1 de l'autre. Le numéro de semaine a donc
> cessé d'être l'ossature de l'écran pour redevenir ce qu'il est — **une propriété de chaque cycle**,
> affichée avec lui dans le bandeau de tête, avec son type de semaine et la note du coach.
>
> L'URL du web suit : `?from=<lundi ISO>` remplace `?week=<n>`, validée comme un LUNDI et rien
> d'autre. Une grille décalée d'un jour serait pire qu'un retour au défaut.
>
> Le mobile, lui, n'a pas de navigation de semaine et n'en gagne pas : il montre **toujours** la
> semaine en cours, jamais un repli sur le début d'un cycle — son titre dit « Cette semaine », et
> lui faire coiffer une autre semaine serait un mensonge. `defaultAthleteMonday` n'y sert donc pas.
>
> ⚠️ **Ce dernier paragraphe est RENVERSÉ depuis [#236](https://github.com/Cimavia/cimavia/issues/236)**,
> et gardé ici pour ce qu'il apprend : son argument tenait tout entier sur le TITRE de l'écran, qui
> était une conséquence du choix et non sa raison. Le web se coiffe de la plage de dates et personne
> ne s'y perd — c'est donc le titre qui est tombé, pas la navigation. Le corps de #229 avait
> d'ailleurs prévu l'issue exacte que #236 a livrée (« `resolvePlanningState` perd son cas
> `outOfCycle` ») : c'est l'implémentation qui avait pris l'autre chemin, et cet encadré qui l'avait
> entériné. La suite est en « Tranché en #236 », plus bas.

> **Tranché en #172** (« hors cycle » et « semaine de repos » se disent différemment) : les deux
> montrent zéro séance et signifient l'inverse l'un de l'autre — l'un que rien n'est prévu parce que
> plus aucun cycle ne court, l'autre que le cycle prévoit du repos. `AthleteCalendarWeek.cycles` est
> ce qui les sépare, et les deux écrans le lisent : vide → on le DIT, non vide → sept jours dont
> certains au repos. Sans cette distinction, un cycle terminé se lirait comme une semaine calme.

> **Tranché en #172** (le nom du cycle ne s'écrit que s'il distingue) : les cartes de séance portent
> leur cycle **uniquement** quand la semaine en compte plusieurs. Avec un seul, ce serait la même
> étiquette répétée sept fois — du bruit qui déplace la lecture du contenu vers son origine, et sur
> mobile de la place prise pour rien. Avec deux, c'est la seule chose qui rende deux séances du même
> mardi distinctes. C'est l'appelant qui tranche (`showPlanTitle`) : la carte ne voit qu'une séance
> et ne peut pas le savoir.

> **Assumé en #172** (une séance peut être faite en avance, et rien ne l'empêche) : un cycle à venir
> devient visible, donc ses séances deviennent atteignables, et `getPublishedSessionOrThrow` ne teste
> que `PUBLISHED` — l'athlète peut débriefer une séance prévue le mois prochain. **Aucun verrou n'est
> posé** : une séance faite en avance est un fait réel, et l'interdire inventerait une règle que
> personne n'a demandée. À rouvrir si un coach s'en plaint.

> **Tranché en #172** (le constructeur dit LAQUELLE des six situations est vraie, ou se tait) :
> `plan.builder.publishedHint` affirmait « L'athlète voit ce cycle. Tes ajustements lui sont visibles
> immédiatement. » dès `status === PUBLISHED`, **sans aucune condition**. C'est mot pour mot le
> mensonge que le corps de #172 a reproduit au curl. `planAudience` rend les six cas
> (`NOT_PUBLISHED`, `VISIBLE_UPCOMING`, `VISIBLE_ALONE`, `VISIBLE_WITH`, `ENDED_SUPERSEDED`,
> `ENDED_LAST`) et `null` sur un cycle non situable — jamais « il le voit » par défaut, qui est
> exactement le repli qu'interdit la règle dure n°5 et la nature même du défaut corrigé.
>
> Le dispositif qui empêche la rechute : `planAudience` **dérive de `selectVisiblePlans`**, la même
> fonction que sert l'API. Deux dérivations parallèles auraient fini par se contredire — et c'est un
> écart entre ce que le coach lit et ce que l'API sert qui a produit #172. Un test tient l'invariant :
> le bandeau ne dit « visible » que pour les cycles réellement servis.

> **Assumé en #172** (rien au moment de diffuser) : le bandeau est **permanent** sur le constructeur
> plutôt qu'une confirmation au clic sur « Diffuser ». Ce qu'il dit reste vrai trois semaines plus
> tard, quand le coach rouvre le cycle, alors qu'une confirmation ne se lit qu'une fois — et pas par
> celui qui revient. `CmvConfirmButton.confirmHint` existe si on change d'avis. Le constructeur
> charge pour cela `GET /plans` (`usePlans`), déjà en cache dès qu'on arrive depuis `/plans` : c'est
> le prix de ne plus affirmer sans avoir vérifié.

> **Trouvé en chemin, CORRIGÉ en #172** (`scripts/check-i18n-keys.mjs` : un `const x = [` avalait
> l'énumération suivante) : le registre du script repère les énumérations par la regex
> `const (\w+) = ([{[])[\s\S]*?[}\]] as const`. Le `[\s\S]*?` est paresseux mais **traversait les
> instructions** : une déclaration ordinaire `const others = [second, ...rest];` placée avant un
> `export const PLAN_ROW_FILTERS = [...] as const` dans le même fichier consommait tout l'intervalle,
> enregistrait l'énumération sous le nom `others`, et faisait disparaître la vraie. `check:i18n`
> échouait alors sur `plan.stateFilter.PLAN_ROW_FILTERS` — une clé sans rapport avec la ligne fautive,
> à des dizaines de lignes d'elle.
>
> Le corps du match est désormais `[^;]*?` : un point-virgule termine une instruction et ne peut pas
> apparaître dans un littéral de tableau ou d'objet, si bien que le match ne peut plus sortir de la
> déclaration en cours. Ce n'est pas un analyseur syntaxique — il en faudrait un pour être exact —,
> mais c'est la borne qui manquait. Éprouvé en réintroduisant la ligne fautive : le script passe.
>
> Correctif **hors sujet de la PR, fait sur demande** : le piège restait posé pour le prochain, et
> son symptôme ne désignait pas sa cause.

> **Corrigé en #172** (une piste `auto` ne s'aligne pas entre deux grilles séparées) : les tableaux
> de `/plans` — la liste par athlète comme l'historique déplié — posaient leur gabarit de colonnes
> sur l'en-tête ET sur chaque ligne, avec le commentaire « sinon les intitulés se décalent du
> contenu ». La promesse était fausse : ce sont des grilles **distinctes**, et leur dernière piste,
> déclarée `auto`, s'y calculait indépendamment — nulle pour le `<span />` de l'en-tête, large de la
> pastille ou du chevron pour une ligne, et **différente d'une ligne à l'autre** selon que la
> pastille dit « À venir » ou « En cours · S3 ». Tout ce qui restait, distribué en `fr`, se décalait
> d'autant : les colonnes « Semaines » et « Début » flottaient de quelques pixels par ligne.
>
> La dernière piste est désormais **fixe** (`8rem` pour la pastille d'état, `1.5rem` pour le
> chevron), et son contenu `justify-self-end` pour garder le rendu d'avant. Règle à retenir : un
> gabarit partagé entre plusieurs conteneurs de grille ne peut contenir que des pistes dont la
> taille ne dépend pas du contenu.

> **Corrigé en #172, et c'est un revirement partiel de #206** (une carte ne prend plus la taille que
> les jours voisins lui laissent) : #206 avait donné à chaque jour la hauteur de sa colonne et à ses
> cartes une part égale de cette hauteur (`flex-1` + `auto-rows-fr`). Conséquence non voulue, et
> invisible tant que tous les jours portaient le même nombre de séances : **la carte d'un jour qui
> n'en a qu'une devenait aussi haute que les trois d'un jour chargé**. L'accumulation des cycles
> (#172) rend ce déséquilibre ordinaire — un jour peut désormais porter les séances de deux cycles
> quand son voisin n'en porte aucune.
>
> Nouvelle règle : **toutes les cartes de la semaine ont la même hauteur, celle de la plus remplie.**
> Elle se tient par une `subgrid` — les sept jours partagent les RANGÉES de la grille de la semaine,
> et les rangées `1fr` d'une grille de hauteur libre s'égalisent sur la plus haute. Aucune carte
> n'est étirée, aucun jour ne dicte la taille d'un autre.
>
> Frontière assumée, et c'est la même qu'en #206 : l'égalisation ne vaut qu'en `xl`, où la rangée de
> sept jours existe. En dessous, les jours s'empilent, il n'y a plus de rangée commune à égaliser, et
> les cartes reprennent la taille de leur contenu — avec le **plancher** `min-h-24`, qui lui vaut à
> toutes les largeurs. Ce que #206 avait posé sans préfixe reste sans préfixe.
>
> Le rendu s'appuie sur deux variables CSS (`--cmv-week-rows`, `--cmv-week-span`) plutôt que sur des
> classes calculées : Tailwind ne génère que les classes qu'il voit écrites en toutes lettres, et un
> nom assemblé à l'exécution ne produirait aucune règle. Aucun `calc()` dans un `grid-row: span`, dont
> le support est moins sûr qu'une simple substitution de variable.

> **Corrigé en #172** (un client d'authentification réel dans jsdom fait échouer une suite VERTE) :
> la CI est tombée sur `Lint + Typecheck + Test` avec **63 fichiers et 519 tests passés** et
> `Errors 1 error` — Vitest échoue sur une erreur non gérée même quand aucun test ne tombe. La trace :
> `ReferenceError: window is not defined` dans `cleanupBroadcastSetup` de `better-auth`, déclenchée
> par un `Timeout` de `nanostores`.
>
> Cause : `@/shared/lib/auth` **crée le client au chargement du module**, et `CmvAppShell` l'importe.
> Un test qui remplace `CmvAppShell` par `importOriginal` évalue quand même le graphe entier : le
> client réel s'arme alors d'un temporisateur de session qui **survit à la destruction du jsdom**.
> Quand il se déclenche, il n'y a plus de `window`.
>
> Deux fichiers sur soixante-cinq tiraient `@/shared/component` sans mocker `@/shared/lib/auth` —
> `AthletePlanningScreen.test.tsx` (ajouté ici) et `MyCoachScreen.test.tsx` (#146, antérieur). Le
> second expliquait aussi un « flake » local : ce test tombait environ une fois sur trois quand
> `turbo typecheck test` chargeait les quatre paquets en parallèle. **Même cause, deux symptômes.**
> Diagnostic établi par sonde (un `console.error` en tête du module d'auth) : deux évaluations avant,
> zéro après.
>
> Règle qui en sort : **un test qui monte quoi que ce soit tirant `@/shared/component` mocke
> `@/shared/lib/auth`**. Ce n'est pas une commodité de test, c'est ce qui empêche un minuteur réel
> d'exister. Le défaut ne se voit pas localement — il dépend de l'ordre et de la durée des fichiers.

> **Corrigé en #172, trouvé en cherchant l'autre** (`findByRole` résout AVANT que l'écran ait fini de
> se rendre) : `MyCoachScreen.test.tsx` (#146) tombait environ une fois sur trois, d'autant plus
> souvent que la machine était chargée. Ce n'était pas un défaut de lenteur mais une **course** :
> l'écran fait deux requêtes, `findByRole` sur le bouton résout dès que `myInvitations` a répondu,
> et `myCoach` répond ensuite en re-rendant l'écran — le nœud obtenu est alors détaché, le clic
> atterrit dans le vide, la mutation ne part pas, et le `waitFor` qui suit expire.
>
> Le correctif n'est pas un délai plus long : on exige d'abord un marqueur de CHAQUE requête
> (`coach.join.codeLabel` pour l'une, le bouton pour l'autre), puis on requête le bouton **à
> l'instant du clic**. Éprouvé 5 fois de suite, plus la porte complète sous contention.
>
> Le motif est général et vaut pour tout écran à plusieurs requêtes : `findBy*` dit « c'est
> apparu », jamais « l'écran a fini ». Cliquer sur son résultat suppose qu'aucune autre requête ne
> re-rendra la zone — supposition fausse dès qu'il y en a deux.

> **Assumé en #172** (la couverture du nouveau code se paie sur les écrans, pas sur les dérivations) :
> le quality gate Sonar a refusé la PR sur `new_coverage` à **74,4 %** pour un seuil de 80 — seule
> condition rouge, duplication à 0 % et notes A partout. Les 45 lignes manquantes se concentraient sur
> **trois écrans à 0 %** que la PR touchait sans qu'aucun test ne les ait jamais montés :
> `AthleteSessionsScreen` (web), `SessionsScreen` et `CurrentWeekSection` (mobile). Les dérivations
> partagées, elles, étaient déjà entre 95 et 100 %.
>
> C'est le corollaire de ce que §11 dit de la couverture : mettre une décision dans une fonction pure
> ne dispense pas de monter l'écran qui l'affiche — ça déplace seulement ce que chaque test peut
> affirmer. Les trois écrans ont désormais le leur, et `parsePlanningSearch` a été extraite de sa
> route pour être éprouvée seule, comme `parsePlansSearch` l'était déjà.

> **Corrigé en #172, dette M-6 appliquée** : `CACHE_SCHEMA_VERSION` passe à `"3"`
> (`apps/mobile/shared/lib/query.tsx`). La clé de cache ET la forme des données ont changé —
> `["my-plan","current"]` portait UN `PlanDto`, `["my-plan","visible"]` porte une LISTE. Sans bump,
> un athlète dont le cache persisté est encore chaud aurait reçu un objet là où les écrans attendent
> un tableau, pendant les sept jours de rétention, et **pas chez le développeur, dont le cache est
> neuf**. C'est exactement le scénario que M-6 décrit ; il ne s'est pas produit parce qu'on y a
> pensé, ce qui reste le défaut que #184 doit fermer.

> **Assumé en #172** (`GET /me/plans` n'est pas borné) : N cycles complets, semaines et séances
> comprises — même famille que **D-1** et l'épic
> [#68](https://github.com/Cimavia/cimavia/issues/68). En pratique un à trois cycles ; le déclencheur
> d'une pagination serait un athlète qui en cumule assez pour que la charge se voie, ce que le
> produit ne permet pas aujourd'hui. Une seule requête de détail pour les N cycles (`id: { in: [] }`)
> et non une par cycle : c'est le nombre de requêtes qui aurait mordu en premier, pas leur taille.

---

## Post-MVP — Navigation de semaine sur mobile ([#236](https://github.com/Cimavia/cimavia/issues/236))

> **Tranché en #236** (l'écran perd son titre plutôt que sa navigation) : « Cette semaine » coiffait
> le planning athlète du mobile, et interdisait à lui seul d'en montrer une autre. C'est la plage de
> dates qui coiffe désormais l'écran, comme sur le web — un titre qui ment une fois sur deux vaut
> moins qu'un repère qui dit toujours vrai, et « Aujourd'hui » fermé dit qu'on est bien sur la
> semaine en cours. ⚠️ Cette dernière affirmation était **fausse à la livraison de #236**, et n'est
> vraie que depuis [#240](https://github.com/Cimavia/cimavia/issues/240) : le bouton se fermait sur
> « aucune semaine choisie », qui n'est la semaine en cours que si un cycle a cours — cf. « Tranché
> en #240 », plus bas. `plan.thisWeek` est mort avec lui et a quitté le catalogue ;
> `plan.outOfCycle` a repris la formulation du web (« cette semaine-là »), sa phrase ne parlant plus
> forcément de la semaine courante.
>
> **Écart de maquette assumé** : `mobile-athlete/athlete-planning_semaine.dc.html` porte ce titre et
> ne dessine aucune commande. Il n'y a rien à y revenir — la maquette décrit un écran qui ne pouvait
> montrer qu'une semaine.

> **Tranché en #236** (« hors cycle » cesse d'être un état de l'écran) : `resolvePlanningState` passe
> de six cas à cinq. Une semaine sans cycle est une semaine **comme une autre** — ses sept jours, ses
> commandes —, que le rendu commente d'une phrase au-dessus. En faire un état exclusif lui retirait
> ses commandes : « suivant » menait à un cul-de-sac d'où plus rien ne ramenait. Ce que #172 sépare
> reste séparé, mais au RENDU (`week.cycles` vide) et non dans le type.
>
> Le cul-de-sac qui reste est l'autre : `week == null`, des cycles existent mais aucun n'est situable
> dans le temps. Il n'y a alors aucune semaine à parcourir, et l'écran rend son état vide — même
> repli que le web.

> **Tranché en #236** (jusqu'où va la navigation se décide dans `@cmv/shared`) :
> `athleteWeekNeighbours(monday, bounds)` remplace les quatre lignes que le `WeekHeader` du web
> portait en propre. Une borne est une DÉCISION, pas un détail de rendu : deux clients qui se
> bornent différemment se contrediraient sur les mêmes cycles. Le corps de #236 annonçait « rien
> n'est à écrire dans `@cmv/shared` » — vrai des dérivations, qui existaient toutes ; faux des
> bornes, qui n'existaient qu'au web.

> **Tranché en #236** (boutons seuls, et la semaine choisie ne survit pas à l'onglet) : la semaine
> vit dans un `useState` qui repart au défaut à chaque montage — revenir à Planning doit montrer où
> on en est. Le prix est qu'**aucun lien profond ne peut désigner une semaine sur mobile**, là où le
> web a `?from=` ; à rouvrir le jour où une notification devra ouvrir une semaine précise. Le
> balayage horizontal n'est pas retenu non plus : la semaine vit dans un `ScrollView` vertical, et
> un `PagerView` changerait la structure de l'écran pour un geste que personne n'a encore réclamé.

---

## Post-MVP — « Aujourd'hui » sur le planning athlète ([#240](https://github.com/Cimavia/cimavia/issues/240))

> **Tranché en #240** (« Aujourd'hui » veut dire la semaine d'aujourd'hui, pas le défaut) : les deux
> écrans fermaient le bouton sur « aucune semaine choisie » et le faisaient mener au défaut. Or
> `defaultAthleteMonday` ne rend la semaine d'aujourd'hui que si un cycle a cours ; sinon il se
> replie sur le début du cycle servi — terminé ou à venir. Le bouton était alors grisé comme si on
> y était, et pressé il ramenait au début du cycle. Le cas courant (un cycle en cours) masquait le
> défaut, parce que le défaut EST alors aujourd'hui : c'est ce qui l'a fait traverser #229 et #236.
>
> Le bouton compare désormais la semaine affichée au lundi d'aujourd'hui et y mène explicitement.
> **Le repli de `defaultAthleteMonday` ne bouge pas** (#172) : c'est la lecture qu'en faisaient les
> boutons qui était fausse, pas le repli.
>
> Conséquence sur l'URL du web : le bouton pose `?from=<lundi>` au lieu de retirer le paramètre.
> Le défaut qui suit le calendrier reste celui de l'URL nue — un lien partagé ; un bouton qui
> promet aujourd'hui doit y mener, quel que soit le défaut.

> **Tranché en #240** (hors de la plage des cycles, « Aujourd'hui » y mène quand même) : cycle
> terminé ou à venir, la semaine d'aujourd'hui tombe hors de `athleteCalendarBounds`. Le bouton
> l'ouvre malgré tout — c'est ce que l'athlète a demandé, et la phrase « hors cycle » dit pourquoi
> la semaine est vide. L'autre lecture, un bouton fermé hors plage, laissait un bouton grisé sans
> que rien n'explique pourquoi.
>
> **Écart assumé** : depuis une semaine hors plage, les flèches avancent **d'une semaine à la fois**
> (`athleteWeekNeighbours` ne vérifie que la borne du côté où l'on va) et ne sautent pas jusqu'à la
> plage. Or `selectVisiblePlans` sert le dernier cycle terminé **sans limite de durée** : un cycle
> fini il y a dix semaines demande dix pressions sur « ← », à travers des semaines vides, pour être
> retrouvé. Un `?from=` bricolé le permettait déjà ; le bouton en fait un chemin ordinaire. À
> rouvrir si un retour bêta s'en plaint — la sortie est un saut vers la borne la plus proche dans
> `athleteWeekNeighbours`, partagé par les deux clients.

---

## Post-MVP — Retour au planning depuis une séance ([#251](https://github.com/Cimavia/cimavia/issues/251))

> **Tranché en #251** (« ← Mon planning » rouvre la semaine d'où l'on vient, pas celle de la
> séance) : le lien retour effaçait `?from=` en dur, si bien que l'athlète qui préparait sa semaine
> suivante retombait sur le défaut après chaque séance. L'autre lecture —
> `mondayOfIsoWeek(session.scheduledDate)`, sans rien transporter — est écartée : le lien promet de
> revenir là où on était, et une séance ouverte depuis la semaine prochaine peut très bien tomber
> dans une autre.
>
> La semaine **voyage** donc avec l'athlète : la carte de la grille la pose sur l'URL de la séance,
> la séance la passe au débrief, le débrief la rend à la séance, et le retour la rend au planning.
> Elle est validée sur le LAYOUT `sessions.$sessionId.tsx`, qui couvre séance et débrief d'un coup,
> par `parsePlanningSearch` lui-même — c'est la même donnée relayée, et un second parseur finirait
> par diverger du premier.
>
> Elle est relayée **telle quelle**, sans être recalculée : `undefined` quand le planning est sur
> son défaut. Poser `week.startDate` à la place rendrait explicite un défaut qui ne l'était pas, et
> le retour figerait une semaine que l'URL nue aurait fait suivre au calendrier.
>
> Arrivé d'ailleurs — liste Séances, bulle de message, notification —, il n'y a aucune semaine
> d'origine, et le planning rouvre son **défaut**. Le repli sur la semaine de la séance, plus utile
> depuis une notification sur une séance à venir, ferait mener le même lien à deux endroits selon
> le chemin, sans que rien à l'écran ne le dise.
>
> Le mobile n'est pas concerné : `/session/[id]` s'ouvre par-dessus les onglets, et l'onglet
> Planning garde son `useState` en dessous (#236).

> **Appris en #251** (`navigate()` sur une union échappe au contrôle de `search`) : un
> `<Link to="/planning">` sans `search` ne compile pas quand la route a un `validateSearch`. Mais
> `NotificationBell` appelle `navigate(target)` avec l'union `NotificationTarget`, et TanStack ne
> vérifie alors plus rien : quatre des cinq cibles qui exigeaient un `search` n'en portaient aucun,
> sans que le typecheck bronche. Sans effet à l'exécution — la route comble —, mais c'est
> exactement le trou par lequel la cible de séance aurait échappé à #251 : ajouter un
> `validateSearch` au layout a fait réclamer cinq liens au compilateur, et pas celui-là. La table
> porte désormais tous ses `search`, et son test les compare en `toStrictEqual` : `toEqual` ignore
> les clés à `undefined`, et laisserait passer une clé oubliée.
>
> Corollaire côté tests : l'objet `router.state.location.search` de TanStack **échoue** à
> `toStrictEqual({})` même vide : c'est un objet SANS prototype, et `toStrictEqual` compare aussi
> les types. Une navigation s'affirme sur `location.href`, qui dit en une chaîne le chemin et la
> semaine — ou leur absence.

---

## Post-MVP — Semaine d'un cycle diffusé ([#312](https://github.com/Cimavia/cimavia/issues/312))

> **Tranché en [#312](https://github.com/Cimavia/cimavia/issues/312)** (un cycle diffusé ne perd
> plus rien : ni une semaine, ni lui-même) : `DELETE /plan-weeks/:id` renumérotait les semaines
> suivantes et faisait remonter leurs séances de sept jours, débriefs compris, sans prévenir
> l'athlète. C'est l'effet d'un `startDate` réécrit, que #207 refusait déjà sur un cycle diffusé.
> Le verrou couvre **toutes** les semaines, la dernière comprise : elle ne décale rien, mais
> emporte en cascade ses séances et leurs débriefs, ce que #313 refuse déjà pour une séance seule.
> Prix assumé : une semaine ajoutée **par erreur** en fin de cycle diffusé y reste (l'ajout, lui,
> reste ouvert : il ne déplace rien).
>
> [#85](https://github.com/Cimavia/cimavia/issues/85) est livrée dans la même PR : la suppression du
> **cycle** diffusé n'était bloquée que dans l'interface (P6-3), et c'est elle que l'issue citait
> comme modèle. Même règle, même fichier, même bloc d'e2e.
>
> La garde **lit le plan avant** la transaction, comme `assertHeaderWritable` et le collage. La
> placer dans la suppression, comme #313, ne protégerait de rien : le statut vit sur la ligne
> `Plan`, pas sur la ligne supprimée, et Postgres ne revérifie pas une condition portée par une
> autre table. La fenêtre restante (diffuser et retirer une semaine au même instant) est celle de
> tous les verrous de diffusion voisins.
>
> Un cycle diffusé **vidé de ses semaines** n'est plus atteignable par l'API, mais a pu être laissé
> par un retrait d'avant la garde. Le tick des rappels continue de l'ignorer, et l'e2e qui le
> prouve le rejoue en base.
>
> Retirer une semaine d'un cycle **en cours** avec notification et recalage explicite reste un
> besoin possible, renvoyé à [#231](https://github.com/Cimavia/cimavia/issues/231) : même dispositif
> que le report (prévenir l'athlète), même déclencheur (un coach qui le demande — aucun à ce jour).

---

## Post-MVP — Plage d'une semaine à cheval sur deux mois ([#322](https://github.com/Cimavia/cimavia/issues/322))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| DR-1 | **L'ordre jour/mois de la plage est pensé pour le français** : `formatIsoDateRange` (`@cmv/shared`) pose les deux bornes côte à côte, chacune formatée seule. En `en-US`, une semaine dans un seul mois rendrait « 12 – Oct 18 » au lieu de « Oct 12 – 18 ». Antérieur à #322, qui ne l'aggrave pas. | 🟢 | — *(déclencheur : un catalogue d'interface anglais — même déclencheur que **L-1**)* |

> **Tranché en [#322](https://github.com/Cimavia/cimavia/issues/322)** (la plage compose ses
> bornes, sans `formatRange`) : l'en-tête du planning affichait « 28 – 4 oct. » pour la semaine du
> 28 septembre, le mois du début étant toujours tu. Le début ne tait désormais son mois que si la
> fin porte le même, et l'**année n'apparaît que quand elle change**, des deux côtés
> (« 28 déc. 2026 – 3 janv. 2027 ») — l'issue disait « les afficher des deux côtés », lu comme
> « afficher ce qui diffère » : une année sur chaque semaine alourdirait l'en-tête mobile pour ne
> rien dire.
>
> - **`Intl.DateTimeFormat.prototype.formatRange` est écarté**, alors qu'il ferait ce travail ET
>   l'ordre propre à chaque langue (**DR-1**) : son support par Hermes n'est pas vérifié, et la
>   recette iPhone ([#394](https://github.com/Cimavia/cimavia/issues/394)) n'est pas faite. Le
>   composer dans `@cmv/shared` garde au mobile exactement le rendu que testent les tests Node.

---

## Post-MVP — « Aujourd'hui » et le fuseau ([#321](https://github.com/Cimavia/cimavia/issues/321))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| TZ-1 | **Le serveur compte à Paris pour tout le monde** (`PRODUCT_TIME_ZONE`, `apps/api/src/util/date.util.ts`) : les cycles visibles de l'athlète et les échéances des rappels du tick. Les clients, eux, comptent dans le fuseau de leur appareil : les deux ne s'accordent que pour un lecteur en métropole. Aux Antilles, le rappel « facture en retard » arrive vers 18 h ou 19 h le jour de l'échéance, quand l'écran ne l'annonce en retard qu'à minuit. Aucun utilisateur hors métropole aujourd'hui. | 🟢 | — *(déclencheur : un premier Coach ou Athlete hors du fuseau de Paris — le fuseau se stocke alors par utilisateur)* |

> **Tranché en [#321](https://github.com/Cimavia/cimavia/issues/321)** (le jour se lit dans un
> fuseau DIT, jamais en UTC par défaut) : `todayIsoDate()` rendait le jour UTC. Le lundi à 0 h 30 à
> Paris, le planning s'ouvrait sur la semaine passée, la séance du dimanche restait « à venir » et
> une facture échue la veille, « à échéance ».
>
> - **Les clients comptent dans le fuseau de l'appareil.** `todayIsoDate()` garde son nom et sa
>   signature, et lit les accesseurs locaux plutôt qu'`Intl` (le chemin que Hermes tient sans
>   recette) : ses vingt appelants web et mobile sont corrigés sans être touchés.
> - **Le serveur compte à Paris, nommément** (**TZ-1**). L'issue proposait un `todayUtcIsoDate`
>   « explicite » pour l'API : il aurait gardé l'écart, seulement en le nommant. À Paris, le rappel
>   « facture en retard » ne devenait dû qu'à 1 h ou 2 h du matin, quand l'écran l'annonçait déjà ;
>   aux Antilles, un cycle disparaissait vers 20 h le soir de son dernier dimanche. `productToday`
>   et `startOfProductDay` prennent le fuseau en paramètre, Paris par défaut.
> - **Les rappels déjà en base ne bougent pas** : leur `dueAt` reste à minuit UTC, l'index unique du
>   tick empêchant de les régénérer. L'écart d'une ou deux heures s'éteint avec eux.
> - **Un instant affiché comme un jour passe par `formatInstantDate`** (`paidAt`, `joinedAt`), et
>   par `isoDateOfInstant` quand la logique en a besoin : en tronquer les dix premiers caractères
>   donnait, lui aussi, le jour UTC. Huit appels le faisaient, l'issue en citait un.
> - **Les tests tournent à Paris** ([#382](https://github.com/Cimavia/cimavia/issues/382)) :
>   `env: { TZ: "Europe/Paris" }` dans les quatre `vitest.config.ts` unitaires. Sous l'UTC des
>   runners, heure locale et heure UTC se confondaient, et le test du changement d'heure passait
>   avec une addition naïve de 24 h — vérifié en la réintroduisant.
> - **Hors de cette issue** : un écran resté ouvert au passage de minuit garde la date du jour où
>   il a été rendu. Aucun retour ne l'a signalé.
