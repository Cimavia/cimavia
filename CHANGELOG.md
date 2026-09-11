# Changelog

## [1.2.0](https://github.com/Cimavia/cimavia/compare/v1.1.0...v1.2.0) (2026-09-11)


### Fonctionnalités

* **mobile:** montrer sa version en pied de l écran de profil, comme la maquette ([5ad3505](https://github.com/Cimavia/cimavia/commit/5ad35054d525ebdc603bef3f681e323d4532d958))
* **shared:** dire la version du produit d une seule façon pour les deux clients ([1fefea0](https://github.com/Cimavia/cimavia/commit/1fefea0bba925676cf3f9a564cda47312b7a3a1b))
* **web:** montrer sa version en pied de l écran de compte, comme la maquette ([0dedf1f](https://github.com/Cimavia/cimavia/commit/0dedf1fdc917642a043391aa6f1232646944e144))


### Corrections

* **mobile:** faire du numéro de version le buster du cache, pour qu on ne l oublie plus ([5b4276b](https://github.com/Cimavia/cimavia/commit/5b4276b99fbe702aed2b27d42d8ac2207335c549))

## [1.1.0](https://github.com/Cimavia/cimavia/compare/v1.0.2...v1.1.0) (2026-09-09)


### Fonctionnalités

* **api:** rattacher une erreur sentry au build exact qui l a produite, pas au seul numéro ([ce88ec7](https://github.com/Cimavia/cimavia/commit/ce88ec7b840e2ee656b86f76d08dfe4d76805f97))
* **shared,api:** dire quelle version tourne, à qui a une session et pas au premier venu ([7c5d9a8](https://github.com/Cimavia/cimavia/commit/7c5d9a89fdf50aad88ee98909ff49e96450e3dd3))
* **shared,api:** faire porter sa version par l image, jamais par l environnement du serveur ([5c6dcd9](https://github.com/Cimavia/cimavia/commit/5c6dcd918d3875b26b0bb9c1267e8eba949c0915))
* **web:** figer la version dans le bundle, au même endroit que l url d api ([adb778b](https://github.com/Cimavia/cimavia/commit/adb778bfea9badf62747d8979af71bda10785f51))


### Technique

* donner sa version à chaque artefact, et son numéro au seul build qui la porte ([463b9a4](https://github.com/Cimavia/cimavia/commit/463b9a49726267ac662900b72ce1ec2fde29b272))
* **mobile:** aligner app json sur la version racine sans jamais la recopier à la main ([bff7d3f](https://github.com/Cimavia/cimavia/commit/bff7d3fe8cb0e4c703e3076ac4a42005f595e4e0))

## [1.0.2](https://github.com/Cimavia/cimavia/compare/v1.0.1...v1.0.2) (2026-09-09)


### Corrections

* **release:** laisser le dépôt à un paquet garder son défaut, sans quoi aucun tag ne se pose ([d7869f5](https://github.com/Cimavia/cimavia/commit/d7869f5dcbe3e040ce4e6fd6b6e36ccc1e8fd471))

## [1.0.1](https://github.com/Cimavia/cimavia/compare/v1.0.0...v1.0.1) (2026-09-08)


### Technique

* ouvrir la pr de release depuis une app plutôt que le jeton par défaut, qui ne déclenche rien ([59cdc0c](https://github.com/Cimavia/cimavia/commit/59cdc0cae391b876726888f9a10ff18624537dea))
* **release:** donner au produit un numéro unique, à la racine et nulle part ailleurs ([fa24861](https://github.com/Cimavia/cimavia/commit/fa24861a3a14034c9039797d78e4f05eff78b3e4))
