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
| `api.dev.<domaine>` | `http://api:3000` |
| `app.dev.<domaine>` | `http://web:80` |
| `s3.dev.<domaine>`  | `http://minio:9000` |

Récupérer le **token du connecteur** (bouton *Install connector*, la chaîne après `--token`) et le
poser dans `CLOUDFLARE_TUNNEL_TOKEN` du `.env`.

> Les trois hostnames sont indispensables — pas seulement `api`. L'API **signe** les URLs de
> médias, et c'est le **téléphone** qui les appelle : sans `s3.dev` public, les uploads/downloads
> échouent. C'est le même piège que `S3_ENDPOINT` en dev local (README racine §WSL2).

## Mise en route

1. **Cloudflare** : tunnel créé, 3 hostnames mappés, token en main (ci-dessus).
2. **Images** : publiées sur GHCR par la CI (`API_IMAGE` / `WEB_IMAGE`). L'image **web** doit être
   buildée avec `VITE_API_URL = https://api.dev.<domaine>` (le web est figé par environnement).
3. **Fichiers sur le NAS** : déposer `docker-compose.yml` + un `.env` (copié de `.env.example`,
   renseigné). Générer les secrets :
   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET (différent de la prod)
   openssl rand -base64 24   # POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY
   ```
4. **Connexion GHCR** (images privées) puis démarrage :
   ```bash
   echo $GHCR_TOKEN | docker login ghcr.io -u OWNER --password-stdin
   docker compose pull
   docker compose up -d
   ```
   Les migrations Prisma s'appliquent seules au démarrage de l'API (`migrate deploy` dans
   l'entrypoint). Le bucket privé MinIO est créé au premier lancement (`minio-setup`, idempotent).
5. **Vérifier** (le test qui compte se fait depuis le **téléphone**, hors réseau maison) :
   - `https://api.dev.<domaine>/health` → `{"status":"ok"}`
   - `https://api.dev.<domaine>/health/ready` → `{"database":"up"}`
   - `https://app.dev.<domaine>` → l'app web se charge.

## Données

- Volumes nommés `postgres_data` et `minio_data` (persistés par Container Manager). À inclure dans
  la sauvegarde du NAS.
- La base ne contient que des **données de seed** (cf. règle dure). Un script de seed dédié sera
  ajouté ultérieurement ; en attendant, créer les comptes de test via l'app.

## Après un changement d'images (nouveau build CI)

```bash
docker compose pull && docker compose up -d
```
Seule la couche applicative change ; Postgres et MinIO gardent leurs volumes.
