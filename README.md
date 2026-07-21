# cimavia

Application de suivi de la relation **coach ↔ athlète** en escalade.

## Structure

```
apps/api      — @cmv/api    : NestJS 11 + Prisma 7 + PostgreSQL
apps/mobile   — @cmv/mobile : Expo SDK 56 + Expo Router + NativeWind
apps/web      — @cmv/web    : React 19 + Vite + TanStack Router/Query + Tailwind v3
packages/shared  — @cmv/shared  : DTOs, schémas Zod (partagés front/back)
packages/tokens  — @cmv/tokens  : Design tokens → Tailwind (web) + NativeWind (mobile)
packages/tsconfig — @cmv/tsconfig : Configs TypeScript de base
```

## Prérequis

- Node.js ≥ 22
- pnpm 10.34.4 (`corepack enable && corepack use pnpm@10.34.4`)
- Docker (pour PostgreSQL **et** MinIO local — object storage S3-compatible)
- Pour le mobile sur **appareil physique** uniquement (débrief, médias, push) : compte
  [Expo](https://expo.dev) + `eas-cli`, et un projet Firebase pour les notifications Android —
  voir « Développer sur un téléphone » plus bas.

## Démarrage

```bash
pnpm install
# Variables d'env : copier les modèles et renseigner les secrets
cp apps/api/.env.example apps/api/.env       # DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -base64 32), CORS_ORIGINS, S3_* (MinIO local)
cp apps/web/.env.example apps/web/.env        # VITE_API_URL
cp apps/mobile/.env.example apps/mobile/.env  # EXPO_PUBLIC_API_URL (IP LAN sur appareil/émulateur, pas localhost)
# Démarrer PostgreSQL + MinIO local (apps/api) — MinIO crée le bucket privé au 1er démarrage
docker compose -f apps/api/docker-compose.yml up -d   # S3 sur :9000, console MinIO sur :9001
# Migrer la base
pnpm --filter @cmv/api exec prisma migrate dev
# Lancer tout
pnpm turbo dev
```

## Commandes

```bash
pnpm turbo dev                           # toutes les apps
pnpm --filter @cmv/api dev               # API seule
pnpm --filter @cmv/mobile start          # Mobile seule
pnpm --filter @cmv/web dev               # Web seule
pnpm turbo lint typecheck test           # qualité (= ce que la CI bloque)
pnpm --filter @cmv/api exec prisma migrate dev
# Tests e2e d'isolation multi-tenant (DB dédiée sur 5434 + MinIO sur son bucket e2e)
docker compose -f apps/api/docker-compose.test.yml up -d
docker compose -f apps/api/docker-compose.yml up minio-setup   # crée les buckets (idempotent)
pnpm --filter @cmv/api test:e2e
```

> Les e2e tournent contre le **MinIO du docker-compose** (bucket `cimavia-media-e2e`) : sans
> storage réel, le flux d'upload des médias ne serait pas couvert. Le cas « storage non
> configuré → 503 » est, lui, couvert par le test unitaire de `StorageService`.

## Développer sur un téléphone (débrief, médias, notifications)

L'émulateur suffit pour les écrans. Il ne suffit **pas** pour les médias (appareil photo) ni pour
les notifications push (aucun service de notification). Sur appareil physique, deux règles
gouvernent tout le reste.

**1. Le téléphone n'est pas ta machine.** Toute URL qu'il reçoit doit être valable *pour lui* :
`localhost`, pour lui, c'est lui-même. Les quatre variables suivantes doivent porter l'**IP LAN**
de ton poste (`hostname -I`, ou `ipconfig` sous Windows) :

| Variable | Fichier | Pourquoi |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` | l'app appelle l'API |
| `BETTER_AUTH_URL` | `apps/api/.env` | Better Auth signe ses sessions pour cette origine |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `apps/api/.env` | y ajouter `http://<ip>:8081` (Metro) |
| `S3_ENDPOINT` | `apps/api/.env` | ⚠️ l'API **signe** les URLs d'upload avec — et c'est le **téléphone** qui les appelle, l'octet ne passant jamais par l'API |

`S3_ENDPOINT` est le piège : avec `localhost:9000`, l'API répond 201 avec une URL signée
parfaitement valide… que le téléphone ne peut pas joindre. L'échec est silencieux côté serveur.
En production le problème disparaît (Scaleway est une adresse publique).

**2. Un module natif impose un rebuild.** Le code JS se recharge à chaud (`r` dans Metro), mais
`expo-notifications`, `expo-image-picker`, `expo-device`… vivent dans le binaire. Après ajout
d'une dépendance native : `eas build --profile development --platform android`, puis désinstaller
l'ancienne app avant d'installer l'APK. Symptôme d'un build périmé :
`Cannot find native module 'X'`, suivi d'une cascade de `Route is missing the required default
export` (l'import qui lève casse le routing entier — une seule cause, pas dix).

### Notifications push (Android)

Expo passe par Firebase Cloud Messaging. Deux fichiers **distincts**, à ne pas confondre :

- `google-services.json` (Firebase → Paramètres → app Android, package `fr.cimavia.app`) → se
  dépose dans `apps/mobile/`, référencé par `app.json` (`android.googleServicesFile`). Ne
  s'uploade **nulle part** ;
- la **clé de compte de service** (Firebase → Paramètres → Comptes de service → Générer une clé
  privée) → expo.dev → Credentials → Android → **FCM V1**. La section n'apparaît qu'après le
  premier build.

Laisse `eas build` générer le keystore (ne pas passer par l'assistant « New Application
Identifier » d'expo.dev). `EXPO_ACCESS_TOKEN` reste optionnel : les push partent sans.

### Cas particulier WSL2 + Docker Desktop

Configuration asymétrique et source de tous les pièges : **l'API et Metro tournent dans WSL**,
**MinIO tourne côté Windows** (Docker Desktop). Le mode réseau change donc qui est joignable :

- **NAT** (défaut — *recommandé*) : Windows possède l'IP LAN, donc Docker Desktop expose MinIO
  nativement. Seuls les ports de WSL ont besoin d'un relais :
  `powershell -ExecutionPolicy Bypass -File scripts\dev-portproxy.ps1` (**admin**) — **à rejouer
  après chaque `wsl --shutdown`**, l'IP de WSL change ;
- **mirrored** : l'inverse — WSL possède l'IP, l'API est directement joignable mais **MinIO
  devient inaccessible au téléphone**. À éviter tant que le storage est sous Docker Desktop.

Le téléphone vise **toujours l'IP LAN de Windows**, jamais le `172.x` de WSL (adresse interne).

**Metro annonce le mauvais hôte.** Par défaut Metro publie son IP WSL (`172.x`) dans le QR — le
téléphone ne la résout pas (« unable to resolve host »). Poser `REACT_NATIVE_PACKAGER_HOSTNAME`
= l'IP LAN Windows dans **`apps/mobile/.env.local`** (voir `.env.example`) : `pnpm dev:mobile`
annonce alors la bonne adresse, sans préfixer la commande. À mettre à jour si l'IP LAN change
(DHCP). ⚠️ Bien un `.env.local`, pas `.env` : Expo SDK 56 refuse les variables non-`EXPO_PUBLIC_`
hors `.env.local`.

Trois obstacles rencontrés, dans l'ordre où ils mordent :

1. **Pare-feu Windows** — ouvrir les ports (**admin**) :
   ```powershell
   New-NetFirewallRule -DisplayName "cimavia dev" -Direction Inbound -Protocol TCP -LocalPort 3000,8081,9000 -Action Allow
   ```
2. **Règles de blocage Docker Desktop** — Windows en crée quand on répond « Annuler » à son
   invite, et **un blocage l'emporte sur une autorisation** : MinIO reste injoignable malgré la
   règle ci-dessus. À désactiver (**admin**) :
   ```powershell
   Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True |
     Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -like '*com.docker.backend.exe*' } |
     Disable-NetFirewallRule
   ```
3. **Conteneurs à redémarrer après tout changement de réseau** (`wsl --shutdown`, bascule de mode) :
   leurs redirections de ports ont été posées dans l'ancien réseau et ne mènent plus nulle part.
   `docker compose -f apps/api/docker-compose.yml restart` — sinon les symptômes trompent
   (`Connection terminated unexpectedly` de Postgres, qui ressemble à un bug applicatif).

Vérification, depuis le navigateur **du téléphone** — c'est le seul test qui compte, celui depuis
le PC étant un faux négatif en mode *mirrored* :

- `http://<ip>:3000/health` → l'API répond ;
- `http://<ip>:9000/minio/health/live` → **page blanche = succès** (200, corps vide).

## Conventions

- Lint/format : **Biome**
- Tests : **Vitest**
- Commits : **Conventional Commits** (sujet en minuscule, signés)
- Composants design system : préfixe `Cmv`
- Packages : scope `@cmv/*`
- Auth : **Better Auth** (email/mot de passe) sur les 3 couches ; profil (`role`, `locale`) sur `user`
- Multi-tenant : isolation à la couche données (tenancy interceptor + Prisma Client Extension) — voir `docs/architecture-choice.md` §6
- i18n : **i18next** dès le départ, aucune string en dur (FR ; EN en P7)
- Argent : montants en **centimes entiers** (`amountCents`), jamais de float ; formatage localisé par `formatMoney` / `formatInvoicePeriod` (`@cmv/shared`) — source unique, pas de calcul dans le JSX
- Médias : object storage privé, **URLs signées** (PUT à l'envoi, GET à la lecture) ; le binaire ne transite jamais par l'API

Voir `docs/architecture-choice.md` pour les règles d'archi détaillées, et
`CONTRIBUTING.md` pour le workflow de contribution (git flow, commits signés,
secrets CI, observabilité).
