(Démarre la phase P7 — i18n & Déploiement FR du plan de dev cimavia (docs/cimavia_dev-plan.html).
P6 est terminée (facturation liée au cycle : termes saisis dans le builder, facture émise à la
diffusion, statut payé/impayé, justificatif PDF, onglet Factures athlète).) => à contextualiser en fonction du dev à faire

Avant de coder, lis :

- docs/cahier-des-charges-mvp.md — §6 exigences non fonctionnelles (RGPD / hébergement / i18n),
  §7 architecture technique (§7.5 souveraineté), §11 internationalisation, §14 risques.
- docs/architecture-choice.md — conventions (§2 app.setup.ts, §5 design system, §7 types dans
  @cmv/shared + logique pure partagée).
- docs/dette-technique.md — dettes ouvertes
- README.md (setup, commandes, WSL2/téléphone) et CONTRIBUTING.md (git flow, commits signés,
  secrets CI, observabilité).

Rappels — acquis P0→P6 à respecter :

- i18n : les strings sont externalisées depuis P0, il ne manque que en.json. ATTENTION : les deux
  apps forcent `lng: "fr"` (apps/web/src/shared/lib/i18n.ts et apps/mobile/shared/lib/i18n.ts) —
  le mobile le fait délibérément, car sans ressource `en` un téléphone anglais afficherait des
  libellés FR avec des dates EN (les formateurs Intl lisent i18n.language). Activer EN = ajouter
  en.json + rebrancher la détection (expo-localization côté mobile) + `User.locale` (enum Locale
  fr|en dans @cmv/shared) déjà stocké par utilisateur.
- Formats localisés : tout passe par des fonctions PURES de @cmv/shared qui reçoivent la locale —
  formatIsoDate/formatIsoDateTime/formatIsoDateRange… (util/date-format.util.ts) et formatMoney/
  formatInvoicePeriod (util/money.util.ts). Les apps n'ont qu'un adaptateur qui injecte
  i18n.language (shared/util/date.util.ts, money.util.ts). Vérifier EN : dates, devise, et le
  piège timeZone "UTC" pour les dates civiles (vs heure locale pour les instants).
- Argent : montants en centimes entiers, jamais de float ; aucun calcul dans le JSX.
- Multi-tenant : toute entité métier est dans TENANT_SCOPES et accédée via TENANT_PRISMA. Les
  include imbriqués ne sont PAS scopés ; les FK n'imposent pas le tenant.
- Médias : buckets privés, URLs signées (PUT à l'envoi, GET à la lecture), le binaire ne transite
  jamais par l'API. Bascule prod = variables S3_* (S3_FORCE_PATH_STYLE=true pour MinIO local,
  false pour Scaleway).
- Observabilité : Pino → Axiom + Sentry sur les 3 couches (déjà en place, à activer en prod).
- Il reste un // MOCKED : l'envoi de l'e-mail de réinitialisation de mot de passe
  (apps/api/src/auth/auth.config.ts) — le commentaire l'annonce pour P7. Il faut donc une infra
  mail (+ i18n du message). À intégrer au plan.

Façon de travailler (inchangée) :

- D'abord un plan → j'attends ta validation avant que tu codes.
- Puis tu me donnes des commits atomiques que je valide 1 par 1 et je fais les commandes moi même (git add, git commit, git push)
- Les actions sur interfaces web (Scaleway, Neon, Cloudflare, EAS, SonarCloud, secrets GitHub,
  branch protection, DNS) c'est MOI qui les fais : liste-les explicitement, ne tente pas de les
  exécuter.
- Je teste moi-même (migrations, e2e, app sur téléphone physique) : prépare-moi de quoi tester,
  je lance et je rapporte.
- pnpm turbo lint typecheck test + les e2e (104 actuellement) doivent passer avant de conclure une
  étape. Les e2e exigent le MinIO du docker-compose
  (docker compose -f apps/api/docker-compose.yml up -d minio-setup).

Commence par me proposer le plan P7. Ne code pas avant que je valide.