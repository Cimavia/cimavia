# Politique de sécurité

> **English:** please report vulnerabilities privately through GitHub — *Security* tab →
> *Report a vulnerability*. Reports in English or French are welcome.

## Signaler une faille

Un seul canal : le **signalement privé de GitHub**, onglet *Security* → *Report a vulnerability*
([lien direct](https://github.com/Cimavia/cimavia/security/advisories/new)). Le rapport n'est
visible que des mainteneurs.

**Jamais par une issue, une PR ou une discussion** : le dépôt est public, et l'environnement de
préversion porte de vraies données.

Pour qu'un rapport soit exploitable, il faut :

- la partie touchée (API, web, mobile, workflow, image Docker) ;
- la version, si elle est connue (tag `vX.Y.Z`) ;
- les étapes pour reproduire, **en local** (voir « Démarrage » dans `README.md`) ;
- l'impact : ce qu'un attaquant obtient, et à partir de quels droits (Coach, Athlete, anonyme).

Le projet est maintenu par une seule personne. Accusé de réception sous **7 jours** ; le correctif
part dans une nouvelle version, publiée dans `CHANGELOG.md`, et le rapport est rendu public une fois
le correctif déployé.

## Versions couvertes

Seule la **dernière version publiée**. Aucun correctif n'est reporté sur une version antérieure.

## Périmètre

**Dans le périmètre** — le code de ce dépôt :

- l'API (`apps/api`), le web (`apps/web`), l'app mobile (`apps/mobile`) et `@cmv/shared` ;
- en priorité : l'isolation entre comptes (un Coach qui lit les données d'un Athlete qui n'est pas
  le sien, un Athlete qui lit celles d'un autre), l'authentification, l'accès aux médias par URL
  signée ;
- les workflows GitHub Actions et les Dockerfiles.

**Hors périmètre** :

- **tester contre un environnement déployé** : il porte de vraies données. Tout se reproduit en
  local ;
- le déni de service, les tests de charge, l'ingénierie sociale ;
- les failles d'un service tiers (GitHub, Cloudflare, Expo, Sentry…) : à signaler à ce service ;
- une vulnérabilité déjà publiée d'une dépendance : Dependabot la suit. Un rapport reste utile s'il
  montre qu'elle est **atteignable** dans cimavia ;
- `apps/mobile/google-services.json` : des identifiants **clients** Firebase, embarqués dans chaque
  APK et versionnés volontairement (`CONTRIBUTING.md`, « Identifiants de build mobile »).
