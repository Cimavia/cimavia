# Changelog

## [1.5.6](https://github.com/Cimavia/cimavia/compare/v1.5.5...v1.5.6) (2026-09-25)


### Technique

* faire analyser par sonar la couverture des jobs de test ([17906e6](https://github.com/Cimavia/cimavia/commit/17906e6f21067755e7fff46de379e058fbbcacc1))
* ne rejouer la ci sur main qu'au commit de release, sans jamais annuler un run de main ([461f265](https://github.com/Cimavia/cimavia/commit/461f2658ef90d681b9fc5a8321eb0a4b7c93f781))

## [1.5.5](https://github.com/Cimavia/cimavia/compare/v1.5.4...v1.5.5) (2026-09-24)


### Corrections

* **mobile:** déclarer les plugins babel de nativewind, introuvables au build natif sous pnpm ([fe61bc1](https://github.com/Cimavia/cimavia/commit/fe61bc14c1dd8e6fcafc2aeb7a2acd7eaab37c86))

## [1.5.4](https://github.com/Cimavia/cimavia/compare/v1.5.3...v1.5.4) (2026-09-24)


### Corrections

* **mobile:** refuser une variante hors développement sans url d'api ni url web ([0f620cb](https://github.com/Cimavia/cimavia/commit/0f620cb838deb30a9c9959e4a4b1785f2f0b3c6a))
* **mobile:** relancer l'app depuis l'écran de panne pour appliquer un correctif déjà téléchargé ([5d794ba](https://github.com/Cimavia/cimavia/commit/5d794ba396def9f75ddd556836d32ef6f2c29465))


### Technique

* **mobile:** installer expo-updates avec une runtime version par empreinte native ([14e764a](https://github.com/Cimavia/cimavia/commit/14e764aa1f76ffe17da9e60a4b3c80bda6297e0e))
* **mobile:** lire les variables depuis les environnements eas et graver un canal par profil ([11d1aaf](https://github.com/Cimavia/cimavia/commit/11d1aafeb2258bed9f42ee5747c28f9b6cc70d0d))
* **mobile:** publier un update preview uniquement depuis un tag propre ([87be560](https://github.com/Cimavia/cimavia/commit/87be560933aed9b04d393124619ac7c0b3c8032a))

## [1.5.3](https://github.com/Cimavia/cimavia/compare/v1.5.2...v1.5.3) (2026-09-23)


### Technique

* **deploy:** deplacer le nas dans preview et renommer son projet compose ([df6147d](https://github.com/Cimavia/cimavia/commit/df6147d3099427e45575894fb856d8e29e2271c3))
* **deploy:** nommer preview le nas des hostnames aux variables et a la doc ([3a1826e](https://github.com/Cimavia/cimavia/commit/3a1826e37839335cd1435e279eb892719b2ffd39))
* **deploy:** retirer l alias reseau minio du stockage de preview ([e0faac2](https://github.com/Cimavia/cimavia/commit/e0faac2ee8e2b4210d20fc39e26b2de800743909))

## [1.5.2](https://github.com/Cimavia/cimavia/compare/v1.5.1...v1.5.2) (2026-09-22)


### Corrections

* **mobile:** passer le mode audio entier, ios refuse l'enregistrement sans lecture en silencieux ([7a921b4](https://github.com/Cimavia/cimavia/commit/7a921b4aed3b0d2a576ab6bf00d9e4c6b8f3d9cd))
* **mobile:** remonter a sentry la cause d'un echec d'enregistrement ([5a9dd73](https://github.com/Cimavia/cimavia/commit/5a9dd739f17e176593d4100689ef289fe2e102b0))
* **mobile:** retablir le mode lecture quand l'enregistrement echoue ([cf3ff6c](https://github.com/Cimavia/cimavia/commit/cf3ff6ca95cd74568f69d99b5b0d69d1e2d96021))

## [1.5.1](https://github.com/Cimavia/cimavia/compare/v1.5.0...v1.5.1) (2026-09-21)


### Corrections

* **mobile:** restaurer app.json et retirer les fichiers eas crees a la racine ([9c22bdf](https://github.com/Cimavia/cimavia/commit/9c22bdf7d2f3871830a86ad4bb08b8855b4176e0))
* **mobile:** restaurer la configuration eas supprimee par megarde ([f74073b](https://github.com/Cimavia/cimavia/commit/f74073bdab26b4e5410a406871fec921cabf807e))

## [1.5.0](https://github.com/Cimavia/cimavia/compare/v1.4.1...v1.5.0) (2026-09-20)


### Fonctionnalités

* **api:** fermer l inscription aux invites sur les environnements non ouverts ([3ab5ad5](https://github.com/Cimavia/cimavia/commit/3ab5ad55fae64d553eebfcf8a0be8df84dd679bb))
* **api:** ne plus publier la documentation swagger en production ([e89546b](https://github.com/Cimavia/cimavia/commit/e89546bd11b36aad129f7682adc87bd1abb37ba3))
* **deploy:** envoyer les e-mails du nas par scaleway et retirer mailpit ([56d91fc](https://github.com/Cimavia/cimavia/commit/56d91fc5f94fdc87ea3989a85b800e8626855e28))
* **mobile:** dire a l inscription refusee de passer par son coach ([a43f74e](https://github.com/Cimavia/cimavia/commit/a43f74e47a2a33cac36a663a01c1afca98d3c515))
* **shared:** valider le mode d inscription et normaliser les adresses sans base ([bd063a0](https://github.com/Cimavia/cimavia/commit/bd063a0002c167b42f59bb4ecbce8182bf32a888))
* **web:** dire a l inscription refusee de passer par son coach ([0544277](https://github.com/Cimavia/cimavia/commit/05442778b7f84c4dd1e76531d7f41cc4a29a8228))


### Technique

* **shared:** mutualiser le choix des capacites et le message d inscription refusee ([1f83134](https://github.com/Cimavia/cimavia/commit/1f8313409f0d3f23e97866b509723293f20b72d4))

## [1.4.1](https://github.com/Cimavia/cimavia/compare/v1.4.0...v1.4.1) (2026-09-20)


### Technique

* **infra:** donner a l api une cle s3 limitee aux objets de ses buckets ([fb65ed8](https://github.com/Cimavia/cimavia/commit/fb65ed855a9160f2bafbd4c6df15c1984f2c995c))
* **infra:** separer la cle root du stockage de celle de l api sur le nas ([f5a840b](https://github.com/Cimavia/cimavia/commit/f5a840ba7a57a097fbdb2334d0e64c75e8df168f))
* **infra:** vider le bucket e2e au demarrage du setup plutot que de l accumuler ([04f8b4d](https://github.com/Cimavia/cimavia/commit/04f8b4d9dabb9c11c7f2886d297cf011bd92be14))

## [1.4.0](https://github.com/Cimavia/cimavia/compare/v1.3.0...v1.4.0) (2026-09-18)


### Fonctionnalités

* **infra:** sauvegarder chaque nuit la base et les medias du nas ([bc0e971](https://github.com/Cimavia/cimavia/commit/bc0e971d6dcf2a105687dd8f563def0931f1dac7))


### Corrections

* **infra:** rendre l endpoint du stockage parametrable dans le script de sauvegarde ([aa52b35](https://github.com/Cimavia/cimavia/commit/aa52b35f42f18e8c7d81a8a8d5ff1628bca1f1d9))

## [1.3.0](https://github.com/Cimavia/cimavia/compare/v1.2.5...v1.3.0) (2026-09-18)


### Fonctionnalités

* **web,mobile:** ouvrir le débrief d'une séance sans exercice, seul geste qui lui reste ([956b88f](https://github.com/Cimavia/cimavia/commit/956b88f2c992188acfbc4df2d15f58677e797d81))

## [1.2.5](https://github.com/Cimavia/cimavia/compare/v1.2.4...v1.2.5) (2026-09-17)


### Technique

* **infra:** remplacer minio par silo tire du miroir ghcr sans changer de volume ([0e96f0f](https://github.com/Cimavia/cimavia/commit/0e96f0f712df547b82ff8d16890c977b376106df))

## [1.2.4](https://github.com/Cimavia/cimavia/compare/v1.2.3...v1.2.4) (2026-09-16)


### Technique

* copier les images de stockage dans ghcr et signaler une version epinglee en retard ([ef1f464](https://github.com/Cimavia/cimavia/commit/ef1f464821c02128d7a834099c8078b077431db7))

## [1.2.3](https://github.com/Cimavia/cimavia/compare/v1.2.2...v1.2.3) (2026-09-16)


### Corrections

* **infra:** exiger https dans les redirections du script du nas et suivre les regles shell de sonar ([b3e1792](https://github.com/Cimavia/cimavia/commit/b3e17929497bb493a6cc539b14d88f88a0de8c01))


### Technique

* construire l image de l api par commit sans annulation et retirer le runner du nas ([48c64a1](https://github.com/Cimavia/cimavia/commit/48c64a1ec2a177f77af58be5776295725c76fa92))
* **infra:** tirer la version promue depuis le nas au lieu de la pousser par un runner ([745da18](https://github.com/Cimavia/cimavia/commit/745da18f32b7371fc56eac3f6a39319d879feffc))
* promouvoir une version publiee vers preview sans reconstruire l image de l api ([04e4a2c](https://github.com/Cimavia/cimavia/commit/04e4a2cc1bc6afd322b7593640dd1441d8bcfa62))

## [1.2.2](https://github.com/Cimavia/cimavia/compare/v1.2.1...v1.2.2) (2026-09-14)


### Technique

* renommer le tier staging en preview ([3d82d91](https://github.com/Cimavia/cimavia/commit/3d82d91db0ca258a24edadbeade8233f372739a6))
* renommer le tier staging en preview pour un seul vocabulaire sur les trois couches ([fce0b32](https://github.com/Cimavia/cimavia/commit/fce0b32d11620d99308b7ee486eea61b49581485))
* viser la branche preview et retirer staging des commentaires de build et de deploiement ([4dc47a2](https://github.com/Cimavia/cimavia/commit/4dc47a257c3d0c709877571b56bc3996b2f84520))

## [1.2.1](https://github.com/Cimavia/cimavia/compare/v1.2.0...v1.2.1) (2026-09-13)


### Corrections

* **infra:** tirer minio de quay.io en version épinglée, ses images ont quitté docker hub ([b6531a6](https://github.com/Cimavia/cimavia/commit/b6531a6773f01127fc2cc33d52c928dd9d741ab5))

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
