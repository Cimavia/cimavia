# Dette technique — Facturation

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P6 — Facturation

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P6-1~~ | ~~**Astérisques d'obligation partiels**~~ : la ligne datait, et disait « seul le formulaire de facturation » alors que quatre autres surfaces avaient reçu `requiredMark` entre-temps. | ✅ | résolue en [#97](https://github.com/Cimavia/cimavia/issues/97) — le repère suit désormais une règle écrite, et non l'ordre d'arrivée des écrans |
| P6-2 | **Objet S3 orphelin quand un cycle est supprimé** : un cycle DRAFT cascade sa facture en base **sans** purger le justificatif. | 🟡 | [#73](https://github.com/Cimavia/cimavia/issues/73) · [#72](https://github.com/Cimavia/cimavia/issues/72) |
| ~~P6-3~~ | ~~**Suppression d'un cycle diffusé bloquée côté UI seulement**~~ : `DELETE /plans/:id` acceptait encore un `PUBLISHED`, et effaçait sa facture émise — ainsi que les débriefs de ses séances et leurs médias, laissés orphelins dans le bucket (#313). | ✅ | résolue en [#85](https://github.com/Cimavia/cimavia/issues/85) — 409 dans `PlanService.delete`, livré avec le verrou de la semaine (cf. « Tranché en #312 ») |

---

> **Tranché en P6** (le modèle de la facturation) : une facture est **liée 1:1 à un cycle**
> (`Invoice.planId @unique`, `onDelete: Cascade`) plutôt qu'émise isolément — c'est le geste réel du
> coach (« la planif + la facture »). Trois conséquences assumées :
> **(1)** la facturation se saisit **dans le builder**, sous les semaines, et non sur un écran
> dédié ; `/invoices` ne fait plus que du **suivi** (statut payé/impayé).
> **(2)** un statut **`DRAFT`** a été ajouté à `InvoiceStatus` pour que les termes vivent avec le
> cycle en brouillon **sans polluer le modèle `Plan`** de colonnes de facturation — les deux modèles
> restent séparés, reliés par la seule FK. Le brouillon est **toujours complet** (`amountCents` et
> `dueDate` NOT NULL), ce qui rend le verrou de diffusion trivial : *un DRAFT existe ⇒ la
> facturation est remplie*. Corollaire assumé : on saisit les termes **avant** de joindre le PDF.
> **(3)** la facture est **émise dans la transaction du `publish`** (DRAFT → PENDING, `issuedAt`
> posé), donc l'athlète ne voit jamais de facture pour un cycle non diffusé, et diffuser sans
> facturation est refusé (400) — **sauf en auto-coaching**, où #14 a levé ce gating (on ne se
> facture pas soi-même), et le refus est précédé depuis #144 de celui du destinataire manquant. Ce verrou a rendu nécessaire l'ajout d'une facturation aux setups
> P4/P5 qui diffusaient un cycle — d'où le helper `billAndPublish` des e2e.

---

> **Tranché en #211** (consulter n'est pas saisir) : `GET /plans/:id/billing` ne porte plus que le
> **404** du cycle introuvable. Les trois refus qu'il opposait — cycle diffusé (400), sans
> destinataire (409, #144), écrit pour soi (409, #14) — sont des règles de **saisie**, et restent
> entiers sur les **quatre écritures** (`PUT billing`, `POST document/upload-url`, `PUT document`,
> `DELETE document`).
>
> Ce n'est pas une tolérance concédée : dans ces trois cas, **aucun brouillon ne peut exister**.
> Diffusé, `issueForPlan` l'a passé en `PENDING` dans la transaction du `publish` ; sans
> destinataire, `assertPlanDetachable` interdit de détacher un cycle déjà chiffré ; en
> auto-coaching, `saveDraft` n'a jamais laissé écrire quoi que ce soit. La réponse est `null` **par
> construction** — la lecture ne divulgue donc rien, elle cesse simplement de reprocher au client
> d'avoir posé une question dont la réponse était toujours la même. Un 400 disait « tu n'avais pas
> le droit de demander », et ces erreurs auraient fait du bruit dans Sentry sans désigner de panne.
>
> Côté web, la conséquence est structurelle et vaut d'être dite : la lecture n'a plus qu'**un seul
> appelant** (`PlanBuilderScreen`), qui descend `billing` en prop à `PlanBillingSection`. Deux
> observateurs sur la même clé TanStack rendaient la garde `enabled` **inopérante** — il suffisait
> que l'un des deux soit actif pour que la requête parte, et c'est exactement ce qui a produit le
> défaut. Le `enabled` qui subsiste n'est plus un garde-fou contre une erreur, c'est une économie :
> on ne pose pas une question dont on tient déjà la réponse.

> **Tranché en [#334](https://github.com/Cimavia/cimavia/issues/334)** (la saisie de facturation
> écrasée par une relecture) : le formulaire se resynchronisait sur l'objet `billing`, que chaque
> lecture renouvelle — `documentUrl` est re-signé. Un montant passé de 120 à 150 € revenait à 120 €
> au succès de l'upload du justificatif, ou au retour sur l'onglet.
>
> - **Ni l'`id` ni `updatedAt`, que l'issue proposait.** Joindre un PDF met à jour la ligne de la
>   facture, donc avance `updatedAt` : le scénario même de l'issue serait resté cassé. Et l'`id`
>   naît au premier enregistrement, ce qui perd la frappe faite pendant l'envoi — le piège de #284.
> - **La règle de #284, champ par champ** : `draftAfterLoad` (`@cmv/shared`) sur le montant,
>   l'échéance et la note. Un champ que le coach n'a pas touché suit le serveur ; un champ touché
>   gagne, y compris sur une saisie faite entre-temps dans un autre onglet.
> - **La comparaison se fait sur le texte affiché** : « 120.00 » tapé sur 120 € enregistrés compte
>   comme touché. Sans effet, les deux valent les mêmes centimes ; c'est `hasUnsavedTerms`, pas
>   cette règle, qui dit à « Diffuser » si la saisie s'écarte de l'enregistré (#326).

---

## Post-MVP — Facturation lue par athlète ([#120](https://github.com/Cimavia/cimavia/issues/120))

> **Tranché en #120** (on lit des ATHLÈTES, plus des factures) : `/invoices` servait une liste plate
> de cartes, à charge pour le coach de recomposer de tête qu'un même athlète en avait trois en
> retard. L'écran groupe désormais par athlète — situation, montant dû, historique dépliable et
> paginé — et la dérivation entière (situation, somme due, ordre des lignes, ordre de l'historique)
> vit dans `@cmv/shared` (`invoice-row.util.ts`). C'est une décision PRODUIT : un tri faux ne se
> voit pas, rien à l'écran ne le signale, d'où des fonctions pures et mesurées plutôt qu'une
> composition dans le JSX.
>
> Corollaire assumé : le tableau ne liste que les athlètes **facturés**. Un athlète sans facture n'a
> pas de ligne, et le sous-titre dit « N athlètes facturés » — pas l'écurie entière, qui
> demanderait un second `GET /athletes` pour un nombre qui ne décrit pas ce qu'on a sous les yeux.

> **Tranché en #120** (la gravité tient à l'ÉTAT, jamais au NOMBRE) : la planche v2 colore le
> montant dû en `error` « quand plusieurs factures sont impayées » — Théo, un seul retard, y a son
> montant en neutre — et adoucit la pastille « 1 en retard » d'un ton par rapport à « 3 en retard ».
> C'est l'inverse de l'arbitrage de #37 sur les statuts de facture, et le défaut se voit sur un cas
> voisin : deux factures **à venir** peindraient un athlète en rouge alors qu'il ne doit rien
> d'échu. Retenu : un athlète en retard est rouge, quel qu'en soit le nombre.
>
> Le dispositif qui le garantit est `INVOICE_SITUATION_STATE`, qui mappe la situation vers un
> `InvoiceState` et emprunte sa couleur à `INVOICE_STATE_BADGE`. Surtout **pas** une seconde table
> de couleurs : elle dériverait de la première, et le même athlète se lirait « en retard » en rouge
> sur le tableau de bord et en orange sur la facturation. Un test tient l'équivalence.
>
> Écarts de maquette assumés, dans ce sens : `#e5c07a` (hors palette) et `info.on` sur « à
> échéance » ne sont pas repris. Le reste de la planche est conforme aux tokens.

> **Tranché en #120** (une facture ANNULÉE ne pèse sur aucun agrégat, et reste visible) : elle
> n'est due par personne — la compter dans le montant dû serait faux, la ranger dans « à jour »
> serait le fallback silencieux qu'interdit la règle dure n°5. Elle reste dans l'historique de
> l'athlète, barrée : on ne fait pas disparaître une facture qui a existé. Corollaire : un athlète
> dont l'unique facture est annulée est « à jour » **sans sous-titre**, faute de règlement à dater —
> « à jour » énonce « il ne doit rien », pas « tout va bien ».

> **Tranché en #120** (le non-réglé se lit sur le `status`, jamais sur l'état dérivé) :
> `resolveInvoiceState` rend `null` sur une échéance illisible, et la facture disparaîtrait alors du
> montant dû sans que personne ne le voie. `status === PENDING` ne ment pas — `PAID` et `CANCELLED`
> sont les deux seules façons de ne plus rien devoir. Une impayée à date illisible reste donc « à
> échéance », montant compris, et c'est seulement son sous-titre qui se tait.

> **Tranché en #120** (les notes ⓘ de la planche sont des ANNOTATIONS, pas de l'UI) : trois lignes
> à icône ⓘ ferment les frames de `coach_facturation_v2.dc.html`. Deux s'adressent sans ambiguïté au
> lecteur du canvas (« c'est le signal qu'on cherche d'un coup d'œil », « Rien à relancer : pas de
> bandeau, pas de bouton d'alerte »). La troisième — « Cinq factures par page… » — a d'abord été
> rendue à l'écran, puis retirée : même icône, même style, même position. Convention à retenir pour
> les planches suivantes.

> **Écarté du périmètre de #120** : le bouton « Relancer les retards » de l'en-tête, celui
> « Relancer les 3 » du bandeau d'athlète, et la phrase « Aucune relance envoyée depuis le 2 août ».
> Relancer un athlète n'existe pas — `NotificationType` n'a que `INVOICE_ISSUED`, aucune trace de
> relance n'est persistée, et un rappel `INVOICE_OVERDUE` est **déjà** auto-généré pour le coach
> (`reminder-tick.service.ts`), si bien qu'un bouton qui en créerait ferait doublon. C'est une
> fonctionnalité — geste sortant, canal, garde anti-spam — pas un rendu.

> **Écarté du périmètre de #120** : la colonne « Numéro » (`F-2026-041`). `Invoice` n'a pas de
> numéro, et un vrai numéro de facture est une mention légale — séquentielle, unique, jamais
> réattribuée. Écart déjà consigné deux fois (`maquettes/README.md` pour `athlete_web` et
> `coach_mobile`, puis [#150](https://github.com/Cimavia/cimavia/issues/150)) ; l'historique affiche
> la **période** à la place. Aucune issue ouverte : décision de ne pas le traiter.

> **Trouvé en chemin, corrigé en #120** (deux panneaux superposés se fermaient ensemble) : le
> panneau de détail d'une facture porte « Programmer un rappel », qui ouvre le sien — première
> superposition du dépôt, les sept autres appelants de `CmvPanel` montent depuis une page. Chacun
> posant son écouteur sur `window`, annuler le rappel refermait la facture qu'on lisait derrière.
> `CmvPanel` tient désormais une pile au niveau du MODULE — elle décrit ce qui est à l'écran, pas ce
> qu'un arbre React contient. Le piège du correctif : les huit appelants passent une flèche **en
> ligne** à `onClose` ; la laisser en dépendance de l'effet dépilait puis réempilait le panneau à
> chaque rendu, remettant sur le dessus celui que rien n'avait rouvert. `onClose` est lu dans une
> ref, l'effet ne dépend que de l'ouverture.

> **Trouvé en chemin, corrigé en #120** (`check:i18n` résout les constantes par leur NOM, sans
> portée) : deux nouvelles tables déclaraient chacune un `COLUMNS`, comme `AthleteTrackingTable`.
> Le registre du script étant global, `i18n-values invoice.table.columns: COLUMNS` réclamait l'union
> des trois — `invoice.table.columns.feedbacks`, entre autres. Renommées `ATHLETE_COLUMNS` et
> `HISTORY_COLUMNS`. Règle générale : une constante citée par une annotation `i18n-values` doit
> porter un nom **unique dans le dépôt**.

---

## Post-MVP — Facturation mobile lue par athlète ([#224](https://github.com/Cimavia/cimavia/issues/224))

> **Tranché en #224** (le détail est un ÉCRAN PLEIN, pas une feuille par le bas) : la maquette
> proposait les deux, et la feuille se justifiait par « le retour est un balayage ». Ce balayage
> n'est pas livrable — `apps/mobile` n'a ni `react-native-gesture-handler` ni `reanimated`, et un
> geste de fermeture ne serait pas observable par le harnais de rendu (`react-native-web`, dette
> **Q-6**) : la surface la mieux protégée de l'app se serait éprouvée à l'œil. Le `Modal
> animationType="slide"` plein écran est le motif que l'app a déjà (`ScheduleReminderButton`,
> `CmvImageViewer`), il ne coûte aucune dépendance, et il se teste.
>
> Piège rencontré et figé par un commentaire : `Modal` (react-native-web) rend dans un **portail**,
> accroché au `body`. Un test qui interroge `container` y trouve un `<div />` vide et passe à côté de
> tout ce qu'il croit presser, sans échouer bruyamment. Les tests de cette surface interrogent
> `baseElement`.

> **Tranché en #224** (l'historique se DÉPLIE, il ne se pousse pas) : la maquette en faisait d'abord
> un écran dédié par athlète. Avec le détail déjà en écran plein, cela empilait liste → historique →
> détail — trois écrans pour lire une note de facture — et faisait perdre la vue d'ensemble à chaque
> athlète consulté. Le déplié sur place garde deux niveaux, n'ajoute aucune route Expo, et reprend
> le comportement du web (#120). Un seul athlète ouvert à la fois : la question posée à cet écran est
> « qui me doit quelque chose », tout ouvrir la reposerait à zéro.

> **Tranché en #224** (une facture ANNULÉE montre son échéance, pas sa date d'annulation) : la
> maquette écrivait « Annulée le 12 mars ». `InvoiceDto` ne porte AUCUN `cancelledAt` — la date
> n'existe nulle part. Elle tombe donc dans le cas général et affiche « Échéance : … », comme le web
> ; sa pastille et son montant barré suffisent à dire ce qui lui est arrivé. Même famille d'erreur
> que le numéro de facture consigné au README des maquettes pour `coach_mobile.dc.html`.

> **Tranché en #224** (le décompte d'une chip n'est pas stylable à part) : la maquette colorait le
> nombre par situation, en police distincte du libellé. `invoice.coach.situationFilter.*` interpole
> ce nombre DANS la chaîne (« En retard {{n}} »), comme le web depuis #120 — et une chaîne
> interpolée ne peut pas porter deux styles. Le scinder aurait fait diverger deux barres d'outils
> qui doivent se ressembler, pour un gain décoratif. Les chips rendent un libellé homogène.

> **Rattrapé en #224** (annotation `i18n-values` sur une constante ÉTALÉE) : `INVOICE_ROW_FILTERS`
> vaut `["ALL", ...INVOICE_SITUATIONS]`, et `check:i18n` ne déplie pas l'étalement — il n'y lisait
> que `ALL`, et signalait trois clés vivantes comme mortes. L'annotation correcte est celle du web :
> `INVOICE_SITUATIONS, ALL`. À retenir avec la règle voisine du nom unique : une annotation
> `i18n-values` doit citer des tableaux de **littéraux**, jamais une constante composée.

> **Écart LEVÉ en #224** (l'annulation existe enfin sur mobile) : `useCancelInvoice` n'y était pas,
> alors que `invoiceApi.cancel` était déjà servi par `createInvoiceApi` dans `@cmv/shared` — seul le
> branchement manquait. Le coach a désormais les quatre gestes des deux côtés. Deux props additives
> l'ont permis sur `CmvConfirmButton` (mobile) : `confirmHint`, que le web avait déjà, et `variant`
> (`danger` par défaut et inchangé, `secondary`, `ghost`), qui laisse un pied de page hiérarchiser
> trois actions. `ghost` armé emploie `error.soft` / `line` / `on` — un `text-cmv-error` de moins,
> mais [#218](https://github.com/Cimavia/cimavia/issues/218) reste ouverte pour les autres, dont
> celui que `danger` conserve.

> **Écart assumé en #224** (pas de recherche par nom sur mobile) : c'est un confort de web, sur une
> liste que le coach parcourt des yeux — les chips de situation suffisent à trancher. À reprendre le
> jour où un coach bêta suit assez d'athlètes pour que le défilement coûte plus qu'un champ.

> **Écart assumé en #224** (l'athlète garde sa liste À PLAT) : il n'a qu'un coach, il n'y a rien à
> grouper — même choix qu'au web. Sa carte a néanmoins perdu la note, le justificatif et les
> actions, qui vivent désormais au détail : les deux titres ouvrent le MÊME écran, et la carte
> redevient ce qu'elle doit être, une porte d'entrée.
