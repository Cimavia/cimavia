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
- **RAM** : 2 Go d'origine, c'est juste pour API Node + PostgreSQL + MinIO. Ajouter une barrette
  (1 slot libre) avant de commencer est fortement recommandé.
- **Container Manager** (le Docker de DSM) installé depuis le Centre de paquets.
- DSM occupe déjà 5000/5001 ; on ne publie **aucun** port de toute façon (cf. réseau ci-dessous).

## Exposition — Cloudflare Tunnel

Aucun port n'est ouvert sur la box : seul le conteneur `cloudflared` **sort** vers Cloudflare, et
joint `api`/`web`/`minio` par leur nom de service sur le réseau interne du compose.

Côté dashboard Cloudflare (**Zero Trust → Networks → Tunnels**), créer un tunnel puis mapper trois
*public hostnames* vers les services internes :

| Hostname public | Service (URL interne) |
|---|---|
| `api-dev.<domaine>` | `http://api:3000` |
| `app-dev.<domaine>` | `http://web:80` |
| `s3-dev.<domaine>`  | `http://minio:9000` |

> Sous-domaines **mono-niveau** (tiret, pas point) : le SSL gratuit de Cloudflare couvre
> `*.<domaine>` mais **pas** `*.dev.<domaine>`. `api-dev` fonctionne ; `api.dev` donnerait une
> erreur de certificat (sauf Advanced Certificate Manager, payant).

Récupérer le **token du connecteur** (bouton *Install connector*, la chaîne après `--token`) et le
poser dans `CLOUDFLARE_TUNNEL_TOKEN` du `.env`.

> Les trois hostnames sont indispensables — pas seulement `api`. L'API **signe** les URLs de
> médias, et c'est le **téléphone** qui les appelle : sans `s3-dev` public, les uploads/downloads
> échouent. C'est le même piège que `S3_ENDPOINT` en dev local (README racine §WSL2).

## Mise en route

1. **Cloudflare** : tunnel créé, 3 hostnames mappés, token en main (ci-dessus).
2. **Images** : publiées sur GHCR par la CI (`API_IMAGE` / `WEB_IMAGE`). L'image **web** doit être
   buildée avec `VITE_API_URL = https://api-dev.<domaine>` (le web est figé par environnement).
3. **Fichiers sur le NAS** : déposer `docker-compose.yml` + un `.env` (copié de `.env.example`,
   renseigné). Générer les secrets :
   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET (différent de la prod)
   openssl rand -base64 24   # POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY
   ```
4. **Runner + premier déploiement** : voir « Déploiement automatique » ci-dessous. Le premier
   `up` applique les migrations Prisma seul (`migrate deploy` dans l'entrypoint) et crée le bucket
   privé MinIO (`minio-setup`, idempotent).
5. **Vérifier** (le test qui compte se fait depuis le **téléphone**, hors réseau maison) :
   - `https://api-dev.<domaine>/health` → `{"status":"ok"}`
   - `https://api-dev.<domaine>/health/ready` → `{"database":"up"}`
   - `https://app-dev.<domaine>` → l'app web se charge.

## Déploiement automatique (CI, runner self-hosted)

Un push sur `main` déclenche `.github/workflows/deploy-dev.yml` : build + push des images sur
GHCR, puis un job `deploy` qui tourne **sur le NAS** (runner self-hosted) et fait
`docker compose pull && up -d`, suivi d'un smoke check `GET /health`. Aucun port entrant : le
runner **sort** vers GitHub, comme cloudflared sort vers Cloudflare.

**Installer le runner (une fois)** — Repo GitHub → Settings → Actions → Runners → *New
self-hosted runner* → Linux/x64 :

- Sur le NAS, faire tourner le runner avec **accès au démon Docker** (le plus simple : le lancer
  en conteneur avec `/var/run/docker.sock` monté, ou installer `docker` CLI à côté). Le job fait
  du `docker compose`, il lui faut donc parler au Docker du NAS.
- À l'enregistrement, lui donner le **label `cimavia-dev`** (en plus de `self-hosted`) : c'est ce
  que cible `runs-on` du workflow.
- Déposer le `.env` renseigné à un chemin **stable** sur le NAS (hors git), et pointer la variable
  de dépôt **`DEV_ENV_FILE`** dessus (Settings → Secrets and variables → Actions → *Variables*),
  ex. `/volume1/docker/cimavia-dev/.env`. Le job échoue proprement si ce fichier manque.

Variables de dépôt nécessaires (Actions → *Variables*, non sensibles) :

| Variable | Valeur |
|---|---|
| `DEV_PUBLIC_API_URL` | `https://api-dev.<domaine>` — figée dans le build web |
| `DEV_ENV_FILE` | chemin absolu du `.env` sur le NAS |

## Données

- Volumes nommés `postgres_data` et `minio_data` (persistés par Container Manager). À inclure dans
  la sauvegarde du NAS.
- La base ne contient que des **données de seed** (cf. règle dure). Un script de seed dédié sera
  ajouté ultérieurement ; en attendant, créer les comptes de test via l'app.

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

## Déploiement manuel (dépannage)

Le déploiement est automatique (ci-dessus). En dépannage, depuis le NAS :

```bash
docker login ghcr.io -u OWNER            # si les images sont privées
docker compose --env-file /chemin/.env pull
docker compose --env-file /chemin/.env up -d --remove-orphans
```
Seule la couche applicative change ; Postgres et MinIO gardent leurs volumes.
