# Déploiement — environnement DÉVELOPPEMENT (NAS)

Tier **development** du modèle à 4 environnements du projet :

```
local (ta machine)  →  développement (ce NAS)  →  staging (cloud)  →  prod (cloud)
     sources                image Docker              image Docker        image Docker
  NODE_ENV=development     NODE_ENV=production      NODE_ENV=production   NODE_ENV=production
                          APP_ENV=development        APP_ENV=staging      APP_ENV=production
```

Pourquoi un environnement sur le NAS et pas seulement `localhost` : être **joignable depuis le
téléphone** (via Cloudflare Tunnel, hors réseau maison) pour tester ce que l'émulateur ne couvre
pas — médias signés, push, app réelle en HTTPS — sur une image identique à celle de la prod.

> ⚠️ **Règle dure — données synthétiques uniquement.** Ce NAS ne reçoit JAMAIS de compte athlète
> réel ni de média réel. C'est ce qui le maintient **hors du périmètre HDS** (l'hébergement de
> vraies données de santé est réservé à la prod, Clever Cloud HDS). Aucun script de copie
> prod → NAS ne doit exister.

## Prérequis matériels (DS720+)

- Le DS720+ est en **x86_64** (Celeron J4125) : les images `amd64` tournent nativement.
- **RAM** : 2 Go d'origine, c'est juste pour API Node + PostgreSQL + SILO. Ajouter une barrette
  (1 slot libre) avant de commencer est fortement recommandé.
- **Container Manager** (le Docker de DSM) installé depuis le Centre de paquets.
- DSM occupe déjà 5000/5001 ; on ne publie **aucun** port de toute façon (cf. réseau ci-dessous).

## Exposition — Cloudflare Tunnel

Aucun port n'est ouvert sur la box : seul le conteneur `cloudflared` **sort** vers Cloudflare, et
joint `api`/`web`/`silo` par leur nom de service sur le réseau interne du compose.

Côté dashboard Cloudflare (**Zero Trust → Networks → Tunnels**), créer un tunnel puis mapper trois
*public hostnames* vers les services internes :

| Hostname public | Service (URL interne) | |
|---|---|---|
| `api-dev.<domaine>` | `http://api:3000` | |
| `app-dev.<domaine>` | `http://web:80` | |
| `s3-dev.<domaine>`  | `http://silo:9000` | `minio:9000` marche encore : alias gardé jusqu'à #271 |

> **`app-dev` est derrière Cloudflare Access** (#263), les deux autres non : l'API est appelée par
> le téléphone, qui ne sait pas résoudre un écran de connexion, et `s3-dev` sert les URLs signées
> que ce même téléphone appelle. Un quatrième hostname a existé jusqu'à #269, `mail-dev`, qui
> exposait la boîte Mailpit du tier — il n'a plus de service derrière lui.

> Sous-domaines **mono-niveau** (tiret, pas point) : le SSL gratuit de Cloudflare couvre
> `*.<domaine>` mais **pas** `*.dev.<domaine>`. `api-dev` fonctionne ; `api.dev` donnerait une
> erreur de certificat (sauf Advanced Certificate Manager, payant).

Récupérer le **token du connecteur** (bouton *Install connector*, la chaîne après `--token`) et le
poser dans `CLOUDFLARE_TUNNEL_TOKEN` du `.env`.

> Les trois hostnames sont indispensables — pas seulement `api`. L'API **signe** les URLs de
> médias, et c'est le **téléphone** qui les appelle : sans `s3-dev` public, les uploads/downloads
> échouent. C'est le même piège que `S3_ENDPOINT` en dev local (README racine §WSL2).

## Mise en route

1. **Cloudflare** : tunnel créé, 3 hostnames mappés (dont `app-dev`, **derrière Access**), token
   en main (ci-dessus).
2. **Images** : rien à préparer. La CI publie l'image de l'API à chaque push sur `main`, et le NAS
   ne tire que la version **promue** (voir « Déploiement » ci-dessous).
3. **Fichiers sur le NAS** : un dossier stable avec un `.env` (copié de `.env.example`, renseigné).
   Le `docker-compose.yml`, lui, ne se copie pas : le script le télécharge au commit de la version
   promue. Générer les secrets :
   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET (différent de la prod)
   openssl rand -hex 24      # POSTGRES_PASSWORD, S3_ROOT_PASSWORD, S3_SECRET_ACCESS_KEY
   ```
4. **Déploiement tiré + première promotion** : voir « Déploiement » ci-dessous. Le premier `up`
   applique les migrations Prisma seul (`migrate deploy` dans l'entrypoint) et crée le bucket
   privé SILO (`silo-setup`, idempotent).
5. **Vérifier** (le test qui compte se fait depuis le **téléphone**, hors réseau maison) :
   - `https://api-dev.<domaine>/health` → `{"status":"ok"}`
   - `https://api-dev.<domaine>/health/ready` → `{"database":"up"}`
   - `https://app-dev.<domaine>` → Cloudflare demande une adresse et un code, **puis** l'app web
     se charge. Si elle se charge sans rien demander, la policy Access manque (#263).

## Déploiement : le NAS tire la version promue

GitHub ne pousse plus rien vers le NAS (#266) : le runner auto-hébergé qui le faisait était inscrit
sur un dépôt public, donc exécutable par un workflow venu d'une PR. Désormais :

1. un push sur `main` publie l'image de l'API, et rien d'autre ;
2. une version n'arrive chez le Coach que si on la **promeut** (`promote-preview.yml`, voir
   `CONTRIBUTING.md` § *Versions et releases*) : le workflow construit son web et pose le tag
   `preview` sur les deux images ;
3. toutes les 5 minutes, `pull-preview.sh` tire le tag `preview`. S'il a changé, il télécharge le
   compose **du commit promu**, le valide contre le `.env`, lance `up -d` et attend que l'API soit
   saine.

Aucun port entrant ni aucun accès de GitHub au NAS : c'est le NAS qui sort, vers GHCR et GitHub.

### Installer (une fois)

**1. Un jeton GHCR en lecture** — GitHub → *Settings → Developer settings → Personal access tokens →
Tokens (classic) → Generate new token (classic)* : scope **`read:packages` seul**, expiration d'un an
(un rappel dans l'agenda). GHCR n'accepte ni jeton *fine-grained* ni jeton d'App.

**2. Sur le NAS, en root, dans le dossier du `.env`** :

```bash
cd /volume1/<…>/cimavia-dev                       # le dossier qui contient le .env
mkdir -p .docker && chmod 700 .docker
read -rs TOKEN                                     # Entrée, PUIS coller le jeton, Entrée
echo "$TOKEN" | DOCKER_CONFIG="$PWD/.docker" docker login ghcr.io -u <compte GitHub> --password-stdin
unset TOKEN
curl -fsSL https://raw.githubusercontent.com/Cimavia/cimavia/main/deploy/dev/pull-preview.sh -o pull-preview.sh
chmod 700 pull-preview.sh
bash pull-preview.sh; echo "code $?"               # 0 : rien n'est encore promu
```

> **Jamais le jeton sur la ligne de commande** (`read -rs TOKEN ghp_…`) : il resterait dans
> l'historique du shell root. `read` se tape seul, le jeton se colle ensuite.

**3. La tâche planifiée** — *Panneau de configuration → Planificateur de tâches → Créer → Tâche
planifiée → Script défini par l'utilisateur* :

- *Général* : utilisateur **root** ;
- *Programmer* : tous les jours, **toutes les 5 minutes**, de 00:00 à 23:55 ;
- *Paramètres de tâche* : `bash /volume1/<…>/cimavia-dev/pull-preview.sh`, et « Envoyer les détails
  d'exécution par e-mail » **uniquement en cas d'arrêt anormal** : le NAS signale lui-même un échec.

**4. Variables de dépôt** (Actions → *Variables*, non sensibles) :

| Variable | Valeur |
|---|---|
| `DEV_PUBLIC_API_URL` | `https://api-dev.<domaine>` — figée dans le build web de la promotion, qui la sonde ensuite |
| `DEV_SENTRY_DSN_WEB` | le DSN du projet Sentry web |

### Le script ne se met pas à jour tout seul

Le **compose** suit la version promue ; le **script**, lui, est la copie posée à l'installation. Quand
`pull-preview.sh` change dans le dépôt, relancer la commande `curl` ci-dessus après le merge.

### Quand ça échoue

Trois endroits le disent : le run de promotion devient rouge au bout de 20 minutes, la tâche DSM
envoie son e-mail, et le journal `pull-preview/pull-preview.log` (dans le dossier du `.env`) dit
pourquoi.

| Dans le journal | Cause probable |
|---|---|
| `tirage de …cimavia-api:preview : … unauthorized` | jeton GHCR expiré ou révoqué : en créer un, refaire le `docker login` |
| `compose de … invalide avec ce .env` | une ligne cassée dans le `.env` (une commande collée dedans, une variable renommée par la version promue) |
| `API non saine après 300s` | l'API ne démarre pas, souvent une migration : `docker logs` du conteneur `api` |

Une fois la cause réglée, le prochain passage réessaie seul. Si seule la confirmation du workflow a
échoué, *Re-run failed jobs* la relance sans republier.

## Données

- Volumes nommés `postgres_data` et `silo_data` (persistés par Container Manager). Le second garde
  son nom d'avant #257 sur le NAS, `cimavia-dev_minio_data` : le renommer démarrerait un stockage vide.
- Ce sont les **vraies données du Coach bêta** depuis #260 : leur sauvegarde est ci-dessous, pas
  optionnelle.

## Qui peut créer un compte (#263)

Ce tier est joignable publiquement — son URL est figée dans l'APK et dans chaque e-mail qu'il
envoie — et sa règle dure est « données synthétiques seulement ». Les deux ne tiennent ensemble que
si un inconnu ne peut pas s'y inscrire : l'inscription y est donc **fermée**.

| Variable du `.env` | Effet |
|---|---|
| `SIGNUP_MODE` | `invitation` (le défaut du compose, même si le `.env` se tait) ou `open`. **À ne pas passer à `open` sur ce tier** |
| `SIGNUP_ALLOWED_EMAILS` | les adresses qui peuvent s'inscrire **sans invitation**, séparées par des virgules |

Deux portes, et deux seulement :

- **un Coach** : son adresse dans `SIGNUP_ALLOWED_EMAILS`, parce que personne ne l'invite ;
- **un Athlete** : une invitation **nominative** en cours, créée par son coach depuis l'app.

Un lien d'invitation **générique** (sans adresse) ne suffit pas : il n'identifie personne, donc il
ne peut rien autoriser avant l'inscription. Sur ce tier, on invite par l'adresse.

Ajouter un Coach se fait donc à la main, et le changement ne prend qu'au redémarrage de l'API :

```bash
sudo -i
cd /volume1/<…>/cimavia-dev           # le dossier du .env
vi .env                               # SIGNUP_ALLOWED_EMAILS=coach@exemple.fr,autre@exemple.fr
rm -f pull-preview/deployed           # sans ça, le script voit « rien de nouveau » et ne fait rien
bash pull-preview.sh
tail -n 3 pull-preview/pull-preview.log
```

> ⚠️ **Passer par le script, jamais par un `docker compose up -d api` à la main.** Le compose lit
> `${API_IMAGE}`, et une variable du shell l'emporte sur le `.env` : `pull-preview.sh` exporte le
> digest de la version promue, une invocation manuelle retombe sur ce que le `.env` contient. Si
> c'est une vieille valeur (celle du bootstrap, § *Déploiement manuel*), preview **recule d'une
> version sans rien dire** — et le script ne le rattrapera pas, son marqueur `deployed` indiquant
> que le tag `preview` n'a pas bougé. Mesuré le 2026-09-20 : une recréation à la main a remplacé
> la 1.5.0 fraîchement promue par l'image d'avant.
>
> Et recréer, pas redémarrer : un conteneur reçoit son environnement **à sa création**. Un
> `restart` relancerait le même processus avec les anciennes valeurs, sans le moindre message.

> L'inscription refusée répond **403**, et les deux apps affichent « demande une invitation à ton
> coach ». Le formulaire, lui, reste visible : le client ne connaît pas le mode, et une route qui
> l'annoncerait renseignerait surtout qui sonde l'API.

## Envoi d'e-mails (#269)

Jusqu'à #269, tout ce que l'API envoyait atterrissait dans une boîte **Mailpit** que seul toi
pouvais lire : le Coach bêta et ses Athletes ne recevaient ni invitation, ni lien de
réinitialisation, ni notification. Le tier écrit maintenant à de **vraies adresses**, par
**Scaleway Transactional Email** (300 messages par mois offerts).

| Variable du `.env` | Valeur |
|---|---|
| `SMTP_HOST` | `smtp.tem.scaleway.com` |
| `SMTP_PORT` | `465` — TLS implicite, ce que `MailService` applique **sur ce port précis** |
| `SMTP_USER` | l'**ID du projet** Scaleway (un UUID), pas une adresse |
| `SMTP_PASSWORD` | la clé secrète de l'application IAM `cimavia-preview-mail` |
| `MAIL_FROM` | `Cimavia <no-reply@cimavia.fr>` — une adresse du domaine vérifié |

**Aucun repli** : une variable oubliée laisse l'envoi éteint et `MailService` le journalise à
chaque tentative. C'est volontaire — un repli sur une boîte locale rendrait l'oubli invisible.

> ⚠️ **La clé d'API expire le 20 septembre 2027.** Scaleway plafonne les clés à douze mois. Ce
> jour-là les envois s'arrêteront, et le seul symptôme sera un échec d'authentification SMTP dans
> les logs. En regénérer une (IAM → Applications → `cimavia-preview-mail` → API keys) et remplacer
> `SMTP_PASSWORD`.

L'application IAM ne porte qu'une permission, **`TransactionalEmailEmailSmtpCreate`** : elle peut
envoyer **par SMTP**, pas relire les messages partis ni toucher à la configuration du domaine. La
clé vit sur le NAS, c'est donc elle qui peut fuiter.

> ⚠️ Scaleway a **deux** permissions d'envoi, et leurs noms se ressemblent :
> `TransactionalEmailEmailApiCreate` ne couvre que l'API HTTP, `…SmtpCreate` le relais SMTP. Avec
> la première, l'authentification SMTP réussit puis le serveur répond `535 5.7.8 Permission
> denied` — un message qui ne désigne pas sa cause. Cherché une heure le 2026-09-20.

**Vérifier qu'un message est bien parti** : Console Scaleway → *Transactional Email* → **Email
activity**. Dans le message reçu, les en-têtes doivent porter `spf=pass` et `dkim=pass`.

**Recevoir du courrier sur `@cimavia.fr`** passe par Cloudflare Email Routing, pas par Scaleway :
`contact@` et `dmarc@` sont réexpédiées vers la boîte personnelle. `no-reply@` n'est **pas** routée
— ce qui lui répond rebondit, et c'est voulu.

## Faire entrer quelqu'un dans la bêta

Trois cas, et une règle qui les gouverne tous les trois : **la liste `SIGNUP_ALLOWED_EMAILS`
autorise à CRÉER un compte, l'invitation nominative LIE à un coach.** Ce sont deux gestes
distincts, et certains n'en demandent qu'un.

> ⚠️ **Access d'abord, invitation ensuite.** Un lien d'e-mail envoyé à quelqu'un qui n'est pas dans
> la policy `beta-web` s'arrête sur une demande de code qu'il ne peut pas satisfaire, sans rien lui
> dire d'utile. Vrai pour l'invitation comme pour la réinitialisation de mot de passe, que le
> mobile renvoie vers le web.

### Un Coach

Personne ne l'invite : c'est le seul cas qui demande une intervention sur le NAS.

1. **Cloudflare Access** → *Applications* → `app-dev` → politique `beta-web` → *Include → Emails* :
   ajouter son adresse.
2. **`.env` du NAS** : ajouter l'adresse à `SIGNUP_ALLOWED_EMAILS` (séparateur : la virgule), puis
   recréer le conteneur (commande exacte au § *Qui peut créer un compte*) — la liste est lue au
   démarrage.
3. Lui donner l'app (`eas build --profile preview --platform android`, § *App mobile de test*) ou
   l'URL du web.
4. Il crée son compte avec **l'adresse autorisée**, case *coach* cochée.

### Un Athlete

Aucune intervention sur le NAS : c'est son coach qui ouvre la porte, depuis l'app.

1. **Cloudflare Access** : ajouter son adresse à `beta-web`.
2. **Son coach l'invite par son ADRESSE** (l'invitation nominative), pas par un lien générique :
   un lien sans adresse n'identifie personne, donc n'autorise aucune inscription.
3. Lui donner l'app.
4. Il crée son compte avec **l'adresse invitée**, case *athlète* cochée, puis accepte l'invitation
   qui l'attend dans l'app.

### Quelqu'un qui est les deux

Les capacités sont **cumulables** : à l'inscription, on coche les deux cases. Ce qui change est
seulement *par quelle porte* il entre.

- **Un coach qui se coache lui-même** : exactement le cas « Coach » ci-dessus, avec les deux cases
  cochées. Aucune invitation — il n'a pas de coach, il est son propre athlète.
- **Un coach qui est aussi l'athlète de quelqu'un d'autre** : les deux gestes, dans cet ordre —
  l'adresse dans `SIGNUP_ALLOWED_EMAILS` **ou** une invitation de son futur coach lui permet de
  s'inscrire, puis il accepte l'invitation pour être lié. Rappel de l'invariant : **au plus un
  coach par athlète**, et l'API refuse la seconde liaison (`409`).

## Deux identités pour le stockage (#267)

L'API ne connaît plus le compte root du stockage. C'est ce qui sépare « une clé qui fuit » de « le
stockage est à prendre » : la clé de l'API apparaît **en clair dans chaque URL signée**
(`X-Amz-Credential`), et c'est précisément ce qu'exigeaient les failles que SILO corrige.

| Identité | Variables du `.env` | Ce qu'elle peut |
|---|---|---|
| **root** | `S3_ROOT_USER`, `S3_ROOT_PASSWORD` | tout administrer : créer la clé de l'API (`silo-setup`), lister le bucket (`backup.sh`). Ne sort jamais du NAS |
| **API** | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | lire, écrire et supprimer les **objets** du bucket, gérer ses envois découpés. Ni lister, ni administrer |

`silo-setup` réapplique cette policy à chaque démarrage : changer un secret dans le `.env` suffit à
le faire prendre au déploiement suivant, l'API et le stockage redémarrant ensemble.

> ⚠️ **Après la bascule, changer le mot de passe root.** Jusqu'à #267, c'est lui que l'API portait
> dans son environnement : il doit être considéré comme connu. Poser une nouvelle valeur dans
> `S3_ROOT_PASSWORD`, promouvoir, puis vérifier que `backup.sh` passe encore.

## Sauvegarde (#268)

`backup.sh` tourne chaque nuit et fabrique, dans `backup/` à côté du `.env` :

Le script prend le compte **root** : le miroir liste le bucket, ce que la clé de l'API ne peut
pas faire (#267).

- `base/cimavia-<date>.dump` — un `pg_dump -Fc`, **relu** avant d'être gardé. Copier les fichiers du
  volume PostgreSQL à chaud ne vaudrait rien : une copie prise pendant une écriture est incohérente.
- `media/` — le miroir du bucket, **suppressions comprises** : la copie est l'image exacte du
  stockage, sinon un média effacé y survivrait indéfiniment (#285).
- `manifest-<date>.txt` — dump, taille, empreinte SHA-256, nombre d'objets, poids des médias : de
  quoi vérifier une sauvegarde **sans rien restaurer**.
- `backup.log` — une ligne par nuit, et la cause en cas d'échec.

Les **7 derniers** dumps sont gardés, par nombre et non par âge : un NAS arrêté trois semaines ne
doit pas se réveiller sans aucune sauvegarde.

> ⚠️ **Ces copies restent sur le NAS.** Elles protègent d'un `down -v`, d'un bug qui efface, d'une
> migration fautive, d'une suppression par erreur. Elles ne protègent **ni** de la panne de disque,
> **ni** du rançongiciel, **ni** du vol ou de l'incendie. C'est un écart assumé le temps que preview
> vive sur le NAS ; le hors-site est manuel, ci-dessous.

### Installer (une fois)

```bash
cd /volume1/<…>/cimavia-dev                  # le dossier qui contient le .env
curl -fsSL https://raw.githubusercontent.com/Cimavia/cimavia/main/deploy/dev/backup.sh -o backup.sh
chmod 700 backup.sh
bash backup.sh; echo "code $?"               # 0, puis lire backup/manifest-*.txt
```

Puis une **tâche planifiée DSM** (*Panneau de configuration → Planificateur de tâches → Créer →
Tâche planifiée → Script défini par l'utilisateur*) : utilisateur **root**, tous les jours à **03:00**,
commande `bash /volume1/<…>/cimavia-dev/backup.sh`, et « Envoyer les détails d'exécution par e-mail »
**uniquement en cas d'arrêt anormal**.

Comme `pull-preview.sh`, ce script est une **copie** : quand il change dans le dépôt, relancer le
`curl` ci-dessus.

### Emporter une copie hors du NAS

À faire de temps en temps, et **avant toute opération risquée** (promotion qui touche au stockage,
migration). Une seule commande fabrique une archive chiffrée :

```bash
cd /volume1/<…>/cimavia-dev/backup
tar -cf - base media manifest-*.txt | openssl enc -aes-256-cbc -pbkdf2 -salt -out "cimavia-$(date +%F).tar.enc"
```

Copie ensuite le `.tar.enc` ailleurs (poste, disque externe). La phrase de passe vit dans ton
gestionnaire de mots de passe : **sans elle, l'archive ne vaut rien**. Pour la relire :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in cimavia-<date>.tar.enc | tar -xf -
```

### Restaurer, et le vérifier

Une sauvegarde jamais restaurée n'en est pas une. **À refaire après chaque modification du script.**
Tout se passe sur le poste de développement, **à côté** de la base de dev, sans rien écraser.

```bash
# 1. Récupérer le dump et les médias de la nuit depuis le NAS (scp, File Station…)

# 2. Une base et un bucket dédiés, dans la pile locale
docker exec cimavia_postgres createdb -U cimavia cimavia_restore
docker exec -i cimavia_postgres pg_restore -U cimavia -d cimavia_restore --no-owner --no-acl < base/cimavia-<date>.dump

# 3. Les médias dans un bucket à part
docker run --rm --network api_default -v "$PWD/media:/media" --entrypoint sh \
  ghcr.io/cimavia/mc:RELEASE.2026-09-16T00-00-00Z -c \
  "mc alias set s http://silo:9000 cimavia cimavia_dev_secret >/dev/null \
   && mc mb --ignore-existing s/cimavia-restore && mc mirror --quiet /media s/cimavia-restore \
   && mc ls --recursive --summarize s/cimavia-restore | tail -2"

# 4. Lancer l'API sur cette base et ce bucket, puis le web
DATABASE_URL="postgresql://cimavia:cimavia@localhost:5432/cimavia_restore" S3_BUCKET=cimavia-restore \
  pnpm --filter @cmv/api dev
```

**Ce qui prouve que la sauvegarde vaut quelque chose** : se connecter avec le compte du Coach et son
mot de passe **inchangé**, ouvrir une planification, lire une vidéo de débrief et un PDF de facture.
Le nombre d'objets affiché à l'étape 3 doit être celui du manifeste.

**Deux contrôles qui se lisent sans ouvrir l'app**, et qui valent d'être faits à chaque restauration.

Le premier compare la base restaurée à celle d'origine, table par table — il n'a de sens que si les
deux tournent encore :

```bash
Q="SELECT table_name, (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS n FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
docker exec cimavia_postgres psql -U cimavia -d cimavia -At -F'|' -c "$Q" > /tmp/src.txt
docker exec cimavia_postgres psql -U cimavia -d cimavia_restore -At -F'|' -c "$Q" > /tmp/dst.txt
diff /tmp/src.txt /tmp/dst.txt && echo "nombres de lignes identiques"
```

Le second vérifie que **chaque média référencé par la base existe dans le stockage restauré** :

```bash
P="SELECT \"storagePath\" FROM feedback_media UNION SELECT \"storagePath\" FROM exercise_document UNION SELECT \"storagePath\" FROM scheduled_session_exercise_document UNION SELECT \"storagePath\" FROM message WHERE \"storagePath\" IS NOT NULL UNION SELECT \"documentPath\" FROM invoice WHERE \"documentPath\" IS NOT NULL;"
docker exec cimavia_postgres psql -U cimavia -d cimavia_restore -At -c "$P" | sed '/^$/d' | sort > /tmp/paths.txt
docker run --rm --network api_default --entrypoint sh ghcr.io/cimavia/mc:RELEASE.2026-09-16T00-00-00Z -c \
  "mc alias set s http://silo:9000 cimavia cimavia_dev_secret >/dev/null && mc ls --recursive s/cimavia-restore" \
  | awk '{print $NF}' | sort > /tmp/objects.txt
comm -23 /tmp/paths.txt /tmp/objects.txt    # chemins SANS objet : doit être vide
comm -13 /tmp/paths.txt /tmp/objects.txt | wc -l   # objets non référencés : voir ci-dessous
```

**Un chemin sans objet est une sauvegarde incomplète** : elle ne vaut rien tant que ce n'est pas
compris. Des **objets non référencés**, en revanche, sont normaux — ce sont les envois abandonnés
que personne ne ramasse (dette **U-6**). Leur nombre dit ce que cette dette coûte : 19 sur un poste
de développement au 2026-09-20, pour 101 chemins référencés.

Ménage une fois le test fait :

```bash
docker exec cimavia_postgres dropdb -U cimavia cimavia_restore
docker run --rm --network api_default --entrypoint sh ghcr.io/cimavia/mc:RELEASE.2026-09-16T00-00-00Z -c \
  "mc alias set s http://silo:9000 cimavia cimavia_dev_secret >/dev/null && mc rb --force s/cimavia-restore"
```

## App mobile de test (beta)

Le mobile est un **client**, pas un service déployé sur le NAS : il pointe simplement vers l'API
publique du tier dev. Pour donner une app installable à un testeur (le coach), on produit un APK
via EAS avec l'URL de l'API figée dans le build (profil `preview` de `apps/mobile/eas.json`, qui
pose `EXPO_PUBLIC_API_URL=https://api-dev.cimavia.fr`) :

```bash
cd apps/mobile
eas build --profile preview --platform android   # APK standalone (distribution interne)
```

EAS renvoie un lien de téléchargement de l'APK à installer sur le téléphone. Comme l'API passe par
le tunnel Cloudflare, l'app fonctionne **hors du réseau maison** — plus besoin d'IP LAN ni de
port-proxy WSL2 (cf. README racine §WSL2, qui ne concerne plus que le dev local avec Metro).

> **Corollaire — tester un CHANGEMENT de réseau exige ce tier, pas le dev local.** En local,
> `EXPO_PUBLIC_API_URL` et `S3_ENDPOINT` pointent une IP LAN (`192.168.x.x`) : couper le wifi met
> le téléphone en 5G, donc hors du LAN, où plus rien n'est joignable. Un envoi qui « ne reprend pas
> en 5G » n'y prouve donc rien — il n'y a simplement plus de serveur à atteindre. Le basculement
> wifi ↔ cellulaire ne se teste qu'avec `api-dev` et `s3-dev` publics, c'est-à-dire ici.

## Déploiement manuel (dépannage)

Tout passe par le script, y compris en dépannage. Depuis le dossier du `.env`, en root :

```bash
bash pull-preview.sh; echo "code $?"     # rejoue un passage (le verrou empêche d'en lancer deux)
tail -n 50 pull-preview/pull-preview.log
rm pull-preview/deployed                 # force le redéploiement de la version déjà en place
```

Un `docker compose up` lancé à la main s'arrête sur `API_IMAGE` / `WEB_IMAGE` manquantes : c'est
voulu, ces images sont épinglées par le script. Seule la couche applicative change ; Postgres et
SILO gardent leurs volumes.
