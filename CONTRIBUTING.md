# Contribuer à cimavia

Workflow de développement et conventions opérationnelles. Pour les règles
d'architecture, voir `docs/architecture-choice.md`.

## Git flow (GitLab Flow)

Merge unidirectionnel `feature/* → main → staging → production` (jamais en sens inverse).

- `main` : branche de dev. **Push direct autorisé** (dev solo). **Commits signés obligatoires.** CI + SonarCloud tournent à chaque push (feedback, non bloquant).
- `staging` / `production` : cibles de promotion **protégées** — PR obligatoire, checks `CI` + `SonarCloud` verts requis, historique linéaire, commits signés, ni force-push ni suppression.

CI (`.github/workflows/`) :

- `ci.yml` — lint + typecheck + test (Biome, Turbo).
- `sonar.yml` — analyse SonarCloud (qualité + sécurité).

Les deux tournent sur push/PR vers `main`, `staging`, `production`.

## Commits

Convention **Conventional Commits**, sujet en minuscule (vérifié par commitlint).

### Commits signés (SSH)

`main` (et la promotion) exige des signatures vérifiées. Config locale, une fois :

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/<ta_clé>.pub
git config --global commit.gpgsign true

git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Puis ajouter la clé publique sur GitHub en **Signing Key** (Settings → SSH and GPG keys).

## Secrets GitHub Actions (Settings → Secrets → Actions)

Ajoutés phase par phase :

- `SONAR_TOKEN` — SonarCloud (en place).
- `SENTRY_DSN`, `AXIOM_TOKEN`, `AXIOM_DATASET` — observabilité (déploiement).
- `DATABASE_URL` — déploiement (P1).
- `BETTER_AUTH_SECRET` — auth (P1).

## Observabilité (API)

- Logs structurés **pino → Axiom** : transport actif dès que `AXIOM_TOKEN` + `AXIOM_DATASET` sont définis. `AXIOM_URL` selon la région du dataset (EU par défaut).
- Erreurs **Sentry** (`SENTRY_DSN`) : init dans `apps/api/src/instrument.ts` (1er import) + `SentryExceptionFilter` global.
- Variables d'environnement : voir `apps/api/.env.example`.
