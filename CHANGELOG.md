# Changelog

## [1.12.0](https://github.com/Cimavia/cimavia/compare/v1.11.0...v1.12.0) (2026-10-06)


### Fonctionnalités

* **api:** la séance planifiée garde ses marqueurs reçus et verrouille sa structure au put ([b46561d](https://github.com/Cimavia/cimavia/commit/b46561d74a525bc44dec323aff67b9b584b92b37))
* **api:** le coach retire une invitation en attente, et son destinataire le sait ([3da4cdb](https://github.com/Cimavia/cimavia/commit/3da4cdb0cc42b96f80c3b23771635ddbf5eb858d))
* **api:** le storage confronte un objet reçu à ce que le rattachement déclare ([8e965fa](https://github.com/Cimavia/cimavia/commit/8e965fa41b090db8ad308637024f1757d56a3ec1))
* **api:** une invitation se désigne par son id et vise toujours une adresse, sans code ([ab682e5](https://github.com/Cimavia/cimavia/commit/ab682e530c878991ce9351a7b88f4f2908e2cc8e))
* **mobile:** la touche envoyer du clavier émet l'invitation, et seulement une adresse ([4aa90db](https://github.com/Cimavia/cimavia/commit/4aa90dbdaef8b29501db7c35795066511c8ad2b1))
* **mobile:** le coach invite par adresse, et l'athlète sans coach voit où être invité ([43b91dd](https://github.com/Cimavia/cimavia/commit/43b91dd4984875af0703da744aac9e910ed8025d))
* **mobile:** retirer une invitation en attente, l'échec dit sous la ligne faute de toasts ([e2acfba](https://github.com/Cimavia/cimavia/commit/e2acfba2e548d33b805c06e99140be5bcb3a5b9d))
* **shared,web:** gestes de dosage par niveau, revenir rend les marqueurs reçus ([e05b670](https://github.com/Cimavia/cimavia/commit/e05b67025929cbba90a1c5a8c296e624fce9260c))
* **shared:** comparer un brouillon à l'enregistré sous la forme où il partirait ([faf2122](https://github.com/Cimavia/cimavia/commit/faf2122f7f733c246ebf3d7f8f9d940a4dab3ace))
* **shared:** l'adresse d'invitation se valide par le schéma de l'api, côté clients ([1534d10](https://github.com/Cimavia/cimavia/commit/1534d109a5becbcc7762142fed6ac89530b85b61))
* **shared:** la séance résumée porte son updatedat, seul signe d'une retouche du coach ([375834e](https://github.com/Cimavia/cimavia/commit/375834ee12f81ab1bdb9761487e84580f913cfef))
* **shared:** le client retire une invitation en attente par sa route de transition ([1816b50](https://github.com/Cimavia/cimavia/commit/1816b507b7ba93bfd03eb22cc6fff050d4f807e2))
* **shared:** le contrat de dupliquer en variante, titre et dosage seulement ([ed3eee3](https://github.com/Cimavia/cimavia/commit/ed3eee300fa133f7dc3655ec1eaaf40423c5fae6))
* **web:** fermer le panneau ou quitter le cycle demande avant de perdre la séance saisie ([d976817](https://github.com/Cimavia/cimavia/commit/d9768171c5452c75aac353cc332dddea83c48683))
* **web:** garde de sortie qui demande avant de perdre une saisie non enregistrée ([c08b962](https://github.com/Cimavia/cimavia/commit/c08b9625d712f44a2e4a8aa77ce68977c2f4e843))
* **web:** le panneau planifié ajuste le dosage pour l'athlète et rend les marqueurs reçus ([bf67e3d](https://github.com/Cimavia/cimavia/commit/bf67e3dde53adbb7a859e44fdad25371afd9a279))
* **web:** on invite par adresse seulement, et l'athlète sans coach voit où être invité ([b587af2](https://github.com/Cimavia/cimavia/commit/b587af25a8a9db118417a270fdba12d5fc61d6ab))
* **web:** retirer une invitation en attente, armé en deux temps comme le refus ([b9668f5](https://github.com/Cimavia/cimavia/commit/b9668f578d3a2a6c5349dc29d8b3995eb45138b8))


### Corrections

* **api:** 409 sur un cycle diffusé, ni semaine retirée ni cycle supprimé sous l'athlète ([d750dd5](https://github.com/Cimavia/cimavia/commit/d750dd543ed1449a86474eb328fb74af7ec90177))
* **api:** cesser de coacher retire ses invitations en attente, aucune ne lie à un ex-coach ([03b8b5b](https://github.com/Cimavia/cimavia/commit/03b8b5bf1d1fcdaeeb7520bbf328ae83c51f3c54))
* **api:** corps de requête plafonné à 1 mio par écrit, et bornes de [#297](https://github.com/Cimavia/cimavia/issues/297) éprouvées en e2e ([7a5558f](https://github.com/Cimavia/cimavia/commit/7a5558f03716f15c3796bd06c85e1850c40d86b4))
* **api:** le suivi d'un débrief s'écrit en une seule transaction, jamais à moitié ([cac1fc8](https://github.com/Cimavia/cimavia/commit/cac1fc88ca7915ce682b0d3b05d61dee6dad62d1))
* **api:** les invitations en attente d'un compte qui ne coache déjà plus sont retirées ([b4acd8d](https://github.com/Cimavia/cimavia/commit/b4acd8db86f867754fd4c0803267fe5d8b9219a2))
* **api:** plus d'avis de débrief en auto-coaching, qui ouvrait un fil avec soi-même ([993aeee](https://github.com/Cimavia/cimavia/commit/993aeee77e249241b5fa26540017f4c2421f44f8))
* **api:** purger les fils avec soi-même et les interdire par un check, comme coach_athlete ([395e8fb](https://github.com/Cimavia/cimavia/commit/395e8fb4bda94e063be365cea6cb5c20d2b5b647))
* **api:** repousser un rappel déjà poussé le refait partir à sa nouvelle échéance ([40cfe30](https://github.com/Cimavia/cimavia/commit/40cfe3031d23ab035b17d8c5d88624561a7e413c))
* **api:** taille d'un document signée puis confrontée à l'objet reçu, plafond opposable ([5eb4fc5](https://github.com/Cimavia/cimavia/commit/5eb4fc5692fe4389c152a636466352a62b95a256))
* **api:** un avis de débrief ne marque plus le débrief répondu, ce n'est pas une réponse ([944552b](https://github.com/Cimavia/cimavia/commit/944552bccc1611e88fa84ae536b60f06f6c8da23))
* **api:** un report tombé pendant les envois du tick n'est plus estampillé comme poussé ([881b714](https://github.com/Cimavia/cimavia/commit/881b71458ea76561767cf157b3a0083cddda4a85))
* **api:** une consigne ne cite que ses images, et la variante est copiée côté serveur ([1f3bb12](https://github.com/Cimavia/cimavia/commit/1f3bb12f77e7be04e1d7584d3cf717e92c48babd))
* **api:** une image partagée entre exercices n'est purgée qu'avec sa dernière ligne ([1cc7ab6](https://github.com/Cimavia/cimavia/commit/1cc7ab6576a813c0fb6155d69c7d2687a6c7b77b))
* **mobile:** hors-ligne resynchronisé après une retouche de séance ou une passe coupée ([545f5d8](https://github.com/Cimavia/cimavia/commit/545f5d89b309f618925299b6de890e9cccb4d4ce))
* **mobile:** joindre un premier média au débrief ne vide plus le texte en cours d'écriture ([01bcaab](https://github.com/Cimavia/cimavia/commit/01bcaab87d754a874016167273b05dd15dc728d1))
* **mobile:** la carte d'invitation dit l'échec de « rejoindre », sur place faute de toasts ([627006c](https://github.com/Cimavia/cimavia/commit/627006c100bfcb4e6ad1a375aad984b14baddfc0))
* **mobile:** le message ne quitte le champ qu'au succès, et un fil introuvable le dit ([e91701f](https://github.com/Cimavia/cimavia/commit/e91701ff293f660c0f9d6a9ea00ba627aae345ec))
* **mobile:** le texte tapé avant l'arrivée de la séance survit à son chargement ([eca31ac](https://github.com/Cimavia/cimavia/commit/eca31acb23a562554159b1c369720f6c759b9868))
* **mobile:** rejoindre un coach invalide tout le cache, onglet messages compris ([693b7a2](https://github.com/Cimavia/cimavia/commit/693b7a21d29ec430644f87f17b0ddaf70ceffde9))
* **mobile:** séance hors-ligne datée, document rouvert par une url re-signée ([9d08f92](https://github.com/Cimavia/cimavia/commit/9d08f92fc9468992574585a9dc5dff95de4d2622))
* **shared:** 50 exercices par séance, suivi de débrief borné et sans case en double ([f8922a2](https://github.com/Cimavia/cimavia/commit/f8922a2a36d0eb24f2f85e80037f502d12171c76))
* **shared:** au retour d'un envoi, le champ ne perd que le texte parti, pas la suite ([3b11668](https://github.com/Cimavia/cimavia/commit/3b11668cb55ae8e8218d77dc94e200467c9ad957))
* **shared:** la réponse à un débrief rend la promesse de son envoi de texte ([2f8c514](https://github.com/Cimavia/cimavia/commit/2f8c514ef94e1c98a533e27374b558644ae1e7e0))
* **shared:** le brouillon de débrief ne cède au texte rechargé que s'il n'a pas été touché ([b61bebd](https://github.com/Cimavia/cimavia/commit/b61bebdd34fd18c4755f6c3d356bb598b757ea7f))
* **shared:** le suivi envoyé avec un débrief laisse aussi les blocs retirés de l'exercice ([3d3cb0a](https://github.com/Cimavia/cimavia/commit/3d3cb0abebb6adebcec8fe795dcb3bc2f68175f9))
* **shared:** une semaine sur deux mois nomme le mois de son début, l'année si elle change ([44a6c3d](https://github.com/Cimavia/cimavia/commit/44a6c3dd2fbac0e879387661fc8d577953d2ca64))
* **web,mobile:** cesser de coacher prévient que les invitations en attente seront retirées ([2e8aa0f](https://github.com/Cimavia/cimavia/commit/2e8aa0f736625aa1128fc0a4a15ff262814fa92d))
* **web:** « rejoindre » depuis la carte d'invitation dit pourquoi il échoue ([14ee07d](https://github.com/Cimavia/cimavia/commit/14ee07d0edec0c1c5a23d5f99f2fb6d86fdde777))
* **web:** créer l'exercice manquant enregistre d'abord la séance au lieu de la jeter ([1cb8f88](https://github.com/Cimavia/cimavia/commit/1cb8f883d53930cd98dce6c000c950cae1970abe))
* **web:** diffuser fermé sur une saisie d'en-tête ou de facturation non enregistrée ([8b31601](https://github.com/Cimavia/cimavia/commit/8b316017e232d406dfbb424a61920d233fa2d2d9))
* **web:** dupliquer en variante passe par le serveur, qui garde les images de consigne ([ca1da4c](https://github.com/Cimavia/cimavia/commit/ca1da4ca75bbe118cb3fb1a7c2f479d8ab1c50fe))
* **web:** joindre un premier média au débrief ne vide plus le texte en cours d'écriture ([536eb6b](https://github.com/Cimavia/cimavia/commit/536eb6bab947c55ef71916a70705f9c22e165984))
* **web:** l'exercice créé depuis une séance y ramène, enregistré ou annulé ([76385e3](https://github.com/Cimavia/cimavia/commit/76385e3a78d07e902c774f8d551080cb4a591382))
* **web:** l'exercice ne s'enregistre plus sur une saisie refusée, et sa sortie la retient ([87160b2](https://github.com/Cimavia/cimavia/commit/87160b28d08249ab4599681f77970baa796cc7bf))
* **web:** la facturation garde le montant tapé quand un justificatif relit la facture ([cb6f272](https://github.com/Cimavia/cimavia/commit/cb6f2726e3cdaf8e4ceccc8277dab7e66f0fc366))
* **web:** la séance ajoute à son retour l'exercice créé depuis elle ([468da39](https://github.com/Cimavia/cimavia/commit/468da39d2def5cc62e8348033ad6c1c9e442e7e2))
* **web:** la séance ne s'enregistre plus sur une saisie refusée, même avant de la quitter ([4f07004](https://github.com/Cimavia/cimavia/commit/4f070042a60570ed73bd4bddcaa961acd0c78605))
* **web:** le constructeur d'exercice demande avant de perdre une saisie non enregistrée ([10b32ae](https://github.com/Cimavia/cimavia/commit/10b32ae8e00bb95dc8e1fb4c575a4f6577aabb2f))
* **web:** le constructeur de cycle demande avant de perdre un en-tête ou une facturation ([4f1ef66](https://github.com/Cimavia/cimavia/commit/4f1ef66f27395d6d0ba527cecaeba3de5944c338))
* **web:** le constructeur de séance demande avant de perdre une saisie non enregistrée ([9b008f2](https://github.com/Cimavia/cimavia/commit/9b008f2cfd9f23a857c7823bc709996a864e34c2))
* **web:** le message ne quitte le champ qu'au succès, et sans fil la barre reste fermée ([6aab045](https://github.com/Cimavia/cimavia/commit/6aab04543ce569b2225aa6640575046ef59b8b87))
* **web:** se déconnecter ou changer de compte demande avant d'agir, pas une fois parti ([44b4389](https://github.com/Cimavia/cimavia/commit/44b4389206d161ecc9459bc2d59f3898785b680d))
* **web:** suppression de semaine grisée sur un cycle diffusé, avec sa raison ([d3aabd7](https://github.com/Cimavia/cimavia/commit/d3aabd74efc096494bdc9fbfd6281d5b0152448c))
* **web:** une cellule refusée se voit et se dit, et un champ refusé se déclare à l'écran ([f2cd901](https://github.com/Cimavia/cimavia/commit/f2cd90115efb31fc3efd63e4aaaaafafaac7a25f))


### Performance

* **api:** une séance ne parse qu'une fois les blocs de chaque exercice qu'elle cite ([c1530f5](https://github.com/Cimavia/cimavia/commit/c1530f5d80a7173ae0d64c5b243c6676971b0df4))


### Technique

* **api:** chaque exercice du brouillon porte ses marqueurs reçus, sans drapeau ([b11746d](https://github.com/Cimavia/cimavia/commit/b11746d366eeefaaddd88c43da6947d29f9e552f))
* **api:** l'invitation d'une autre adresse se détecte par chaînage optionnel ([7749279](https://github.com/Cimavia/cimavia/commit/774927967440a7521aa7e6269fc777ae16ecc5cc))
* **shared:** l'acceptation d'invitation partagée, ses deux copies avaient divergé ([81f1856](https://github.com/Cimavia/cimavia/commit/81f1856e4d9076a1f571415e3a3ffb26419a5993))
* **shared:** un seul parcours transforme le bloc visé, couvert sur plusieurs blocs ([38c1684](https://github.com/Cimavia/cimavia/commit/38c168443a6e7f121275d4456e551d62ba6528c1))
* **web:** le dosage d'un exercice sort de la carte, ses marqueurs suivent le niveau ([ab3ab70](https://github.com/Cimavia/cimavia/commit/ab3ab702de01bb1b8566095672fefa6ba6fccf52))
* **web:** seul le panneau planifié s'en sert, ses trois modules passent dans plan ([6731269](https://github.com/Cimavia/cimavia/commit/6731269eb83ed4d603a1aa9a7cea32dc36d4798d))

## [1.11.0](https://github.com/Cimavia/cimavia/compare/v1.10.0...v1.11.0) (2026-10-03)


### Fonctionnalités

* **mobile:** déplacer une note vocale garde sa lecture ou sa pause, même après un 403 ([89c72d4](https://github.com/Cimavia/cimavia/commit/89c72d49950b69412611a95b751b9046eba4e766))
* **mobile:** les notes vocales d'un débrief, de ses réponses et d'un fil s'enchaînent ([4eee5f1](https://github.com/Cimavia/cimavia/commit/4eee5f15d6b8b17c1b287fd27621845a5a774b88))
* **mobile:** un curseur audio qu'on tape ou glisse sans voler le défilement de la liste ([1e41166](https://github.com/Cimavia/cimavia/commit/1e41166b3ca1c5586d75cdd7224664ca76bd722e))
* **shared:** fin des cotations à dupliquer, celle du catalogue passe en spécifique ([bec626c](https://github.com/Cimavia/cimavia/commit/bec626cbcf48cc73e28561df582abbffcad13b8c))
* **shared:** note vocale suivante et note unique, une règle pour les deux apps ([aaf5f3e](https://github.com/Cimavia/cimavia/commit/aaf5f3e1d03c769ae0c98ce2c80f474034cc7092))
* **web:** les notes vocales d'un débrief, de ses réponses et d'un fil s'enchaînent ([612ea09](https://github.com/Cimavia/cimavia/commit/612ea0947752fca5aeea1fba3951abe9bada3954))


### Corrections

* **mobile:** une note vocale lancée coupe celle qui joue, et part si la liste le demande ([bce1aa8](https://github.com/Cimavia/cimavia/commit/bce1aa822f4421da1caa262d1f83222e3bcc4e8a))
* **web:** une note vocale lancée coupe celle qui joue, et démarre si la liste le demande ([36a8f3b](https://github.com/Cimavia/cimavia/commit/36a8f3b448d5f429666e277eeb8a3d3522589f2b))


### Technique

* **web:** les familles du sélecteur suivent leur ordre déclaré, plus le catalogue ([b7ef459](https://github.com/Cimavia/cimavia/commit/b7ef459c20f6a21cf9df08f953f5f7a2891de469))

## [1.10.0](https://github.com/Cimavia/cimavia/compare/v1.9.1...v1.10.0) (2026-10-02)


### Fonctionnalités

* **api:** un push à chaque envoi sur un débrief déposé, un média seul le rend à relire ([11464c7](https://github.com/Cimavia/cimavia/commit/11464c7a4b5ad78b848ce6f5da031003e744856e))
* **mobile:** la séance regroupe les séries qui reprennent la même ligne sous une plage ([7d507b3](https://github.com/Cimavia/cimavia/commit/7d507b31f505c1805dc430cb4f3e936533410b62))
* **mobile:** la suite d'un lot de médias ne pousse pas, une sélection fait un seul push ([6f7d0ea](https://github.com/Cimavia/cimavia/commit/6f7d0ea593cccb41e27fe1d8ecccc6dab258cf86))
* **shared:** un drapeau de suite de lot, pour qu'une sélection ne pousse qu'une fois ([d8199b6](https://github.com/Cimavia/cimavia/commit/d8199b6e0956f29ac61c78319ded8dff00c11f50))
* **shared:** une série sans ligne reprend la dernière, fantômes et plages en découlent ([5b226d6](https://github.com/Cimavia/cimavia/commit/5b226d6694a928db8255cd8b74e732449267b759))
* **web:** l'aperçu regroupe les séries qui reprennent la même ligne sous une plage ([2ec3ac3](https://github.com/Cimavia/cimavia/commit/2ec3ac35ceb886d21690d42d4a2806bdaf0d31b8))
* **web:** la grille d'une séries montre une ligne par série, les manquantes en fantômes ([389943a](https://github.com/Cimavia/cimavia/commit/389943ad4b0af023865be6e3c68123456d74c978))
* **web:** la suite d'un lot de médias ne pousse pas, une sélection fait un seul push ([8081761](https://github.com/Cimavia/cimavia/commit/808176121ba98c83abb5eea839f83a019ed3496a))


### Corrections

* **api:** un push par message, et l'avis de débrief non lu n'éteint plus la série ([66208d5](https://github.com/Cimavia/cimavia/commit/66208d57a35b005fb47755ea86c1417737729a45))
* **mobile:** l'emom d'une minute dit chaque minute, le repos du circuit comme en séries ([052af8c](https://github.com/Cimavia/cimavia/commit/052af8c0039adc462157f56e51b4d9945fea621d))
* **mobile:** l'exemple de note de rappel commence par ex., comme sur le web ([7b29c1a](https://github.com/Cimavia/cimavia/commit/7b29c1a3aecab5241c83f83af61097c137689dda))
* **shared:** l'emom d'une minute dit chaque minute, plutôt que toutes les 1' ([f32b61f](https://github.com/Cimavia/cimavia/commit/f32b61f8d9436a749dceb7e207d8e8123256ba0c))
* **web:** le bouton d'en-tête juge le lundi qui sera enregistré, plus le jour encore saisi ([18b7599](https://github.com/Cimavia/cimavia/commit/18b7599fcad0dbe9a0e25edd6fd4ba3fa0f46533))
* **web:** les durées suivent l'écriture 2'30, jusqu'au message d'erreur du champ ([fe8169b](https://github.com/Cimavia/cimavia/commit/fe8169b91dc7bb88abd588eb72b159c599962cc3))
* **web:** un exemple de champ vide commence par ex., le repos des séries dit entre séries ([4c84827](https://github.com/Cimavia/cimavia/commit/4c84827ea3ddc84ddb20e54c0036b5efe9fe6767))


### Technique

* **api:** les gardes déjà tenues en amont cèdent la place au type ou à required ([2f98748](https://github.com/Cimavia/cimavia/commit/2f987483ae289baeb962d2baa43646e280e813bb))
* **api:** nom ou ligne garantis par une fk lus par required, plus par une garde ([c3ca3b9](https://github.com/Cimavia/cimavia/commit/c3ca3b9e6c7eee769e404e83d04e58d4ac426e38))
* **mobile:** gardes mortes retirées, atterrissage garanti, deux branches vivantes ([dea0105](https://github.com/Cimavia/cimavia/commit/dea0105873ce06438addf07d22057e3a80f12280))
* **shared:** dosage, parts d'upload et grille sans les gardes que le type rend mortes ([ad36b9f](https://github.com/Cimavia/cimavia/commit/ad36b9f91e346d318627f8bcdf7469101aea4173))
* **shared:** initiales, médias et suivi sans repli, le web lit ses noms de fichier ([cd241df](https://github.com/Cimavia/cimavia/commit/cd241dfedad549f7209a5c91855a1dfba4b00301))
* **shared:** un cycle élu est toujours situable, et les écrans cessent d'en douter ([493ce1d](https://github.com/Cimavia/cimavia/commit/493ce1de39b3c20bcb9413ea5107f2f8af6ad4c0))
* **shared:** un invariant violé lève par une fonction unique et testée ([fc2e14d](https://github.com/Cimavia/cimavia/commit/fc2e14df4158760e2856029ec5b243e6837afc44))
* **shared:** une durée en nombre se formate toujours, sans repli mort chez l'appelant ([8196553](https://github.com/Cimavia/cimavia/commit/81965532facae8a3fecf7b99aec4d519171e2385))
* **shared:** une ligne de facturation a toujours une facture, sa devise sans repli ([acc9485](https://github.com/Cimavia/cimavia/commit/acc9485a91a871edab370d3ce47521cce4953b1a))
* **web:** hors bibliothèque, gardes mortes retirées, le nom du coach absent testé ([3833275](https://github.com/Cimavia/cimavia/commit/383327564a7f4abd9bd4e3c24b604bd1742c754e))
* **web:** la bibliothèque perd ses gardes de boutons fermés et ses replis morts ([d011ef6](https://github.com/Cimavia/cimavia/commit/d011ef6a5ebce3e98bdfae64bd89ed8016092e84))
* **web:** les exemples de saisie ne supposent plus l'escalade, tout coach s'y retrouve ([fad612c](https://github.com/Cimavia/cimavia/commit/fad612c7b6fa677a5f62b95408e7116b31168de9))

## [1.9.1](https://github.com/Cimavia/cimavia/compare/v1.9.0...v1.9.1) (2026-10-01)


### Corrections

* **mobile:** attendre le déplacement de la vignette vidéo avant d'en … ([cd13687](https://github.com/Cimavia/cimavia/commit/cd13687ecdf1adca751d0e35dbed8d4c0492761e))
* **mobile:** attendre le déplacement de la vignette vidéo avant d'en rendre l'uri ([deb7656](https://github.com/Cimavia/cimavia/commit/deb7656100b7c0bfe24194119d5e719158cc56d6))


### Technique

* **api:** chaînage optionnel, string raw et async inutiles, même comportement ([05cb8da](https://github.com/Cimavia/cimavia/commit/05cb8dacca5706d66f4abb4350ecbcb8b8a6042a))
* **mobile:** icône d'onglet hors de app, props en lecture seule, promesses marquées ([04dc0d7](https://github.com/Cimavia/cimavia/commit/04dc0d75b249e7d53d32a0275d7afa0723ff3463))
* **shared:** barre finale retirée sans regex, une copie pour les mailers et le mobile ([0310e29](https://github.com/Cimavia/cimavia/commit/0310e2945ffa66264b0b9fb522393c577fcc2d36))
* **shared:** bascule optimiste des réglages e-mail commune, le toast reste au web ([35510de](https://github.com/Cimavia/cimavia/commit/35510deaa92f05ecfdfd6f19468a7706d10939a3))
* **shared:** coches, tours et dosage d'une case lus une fois au lieu de quatre ([bf7664f](https://github.com/Cimavia/cimavia/commit/bf7664f943b7c1079afb633f8d7a3960c98bdb65))
* **shared:** hooks (moi) composés dans shared, chaque app injecte sa session ([82062db](https://github.com/Cimavia/cimavia/commit/82062db452ab8f3c1e31e5ab41d7364137d3b677))
* **shared:** la règle du libellé (moi) écrite une fois, chaque app lit sa session ([170059f](https://github.com/Cimavia/cimavia/commit/170059fb46fff41fd098f059a1f00ff4954a044d))
* **shared:** les gestes du pied de facture décidés une fois pour le web et le mobile ([eea9e2c](https://github.com/Cimavia/cimavia/commit/eea9e2c49d9e71bc8451fb108abe71e490b160f8))
* **shared:** set, réexport direct, séparateur et objet vide, alertes sonar levées ([5c2879f](https://github.com/Cimavia/cimavia/commit/5c2879fa2b1dbc068bd524a541ec1e3b60fe2320))
* **sonar:** écarts justifiés pour l'await en boucle, la clé par index et l'autofocus ([cd74f0f](https://github.com/Cimavia/cimavia/commit/cd74f0ff879ebe15587c30b62cdb011b0be697c5))
* **web:** barre de progression en progress natif, peinte sur les tokens partout ([3ffc463](https://github.com/Cimavia/cimavia/commit/3ffc463e3deb36619eb44eac7b411bfaa61e32d7))
* **web:** props en lecture seule, imports fusionnés, ternaire et calcul sortis ([8bff35d](https://github.com/Cimavia/cimavia/commit/8bff35ddd3239d826790bc72e7b7678fcd9cddd9))
* **web:** top-level await au démarrage, un chunk en échec reste sur l'écran de crash ([da65922](https://github.com/Cimavia/cimavia/commit/da65922f19fc32b944147339b4e0d6993fa3c7df))
* **web:** un pied de pagination commun aux historiques, les colonnes restent à chacun ([a33381e](https://github.com/Cimavia/cimavia/commit/a33381eed490d600cb97bb98a8134b12b0e015fa))

## [1.9.0](https://github.com/Cimavia/cimavia/compare/v1.8.3...v1.9.0) (2026-09-30)


### Fonctionnalités

* **mobile:** lire la vidéo en plein écran dans l'app et la reprendre si son url expire ([2f0ce63](https://github.com/Cimavia/cimavia/commit/2f0ce636c4a39e1f29feccc19d4f283afd1011ad))
* **mobile:** montrer la vignette de la vidéo dans la galerie du débrief et dans la bulle ([9346957](https://github.com/Cimavia/cimavia/commit/9346957f8f90d412f9b627c556d1890a9e888474))
* **mobile:** tirer sur l'appareil la vignette d'une vidéo, purgée au changement de compte ([9bc8ea6](https://github.com/Cimavia/cimavia/commit/9bc8ea6f7b3370ff515dc87a85fe9135c2b068ff))
* **mobile:** traduire les permissions ios depuis le catalogue i18next, repli en français ([27abbd4](https://github.com/Cimavia/cimavia/commit/27abbd4c4642933bf1fb09ebff01c0a2f46a7b72))
* **shared:** restreindre le suivi d'un débrief aux exercices encore dans la séance ([39a872a](https://github.com/Cimavia/cimavia/commit/39a872ab90f0b28e20b9558895371b970df5fa23))


### Corrections

* **api:** l'édition d'une séance planifiée garde ses lignes au lieu de les recréer ([8be1653](https://github.com/Cimavia/cimavia/commit/8be16532dfebbb7a99910b450821f8994e4b4c2d))
* **api:** le débrief refuse en 400 un exercice absent de la séance au lieu de l'ignorer ([ca69e54](https://github.com/Cimavia/cimavia/commit/ca69e542f24967787ca9256ca5368807dee209f7))
* **api:** payer ou annuler une facture clôt son rappel en retard, dans la même transaction ([c4f5be5](https://github.com/Cimavia/cimavia/commit/c4f5be57da164210658bb507fea9f92c80e4aef7))
* **mobile:** aligner reanimated et worklets sur le sdk 56, pairs impl… ([c25573e](https://github.com/Cimavia/cimavia/commit/c25573e142d1680e543efb0415b0eaa00e246d09))
* **mobile:** aligner reanimated et worklets sur le sdk 56, pairs implicites non choisis ([570f703](https://github.com/Cimavia/cimavia/commit/570f703460ab18611e4744ddd0b3051c4719c586))
* **mobile:** chaque coche part de la précédente, le rattrapage ne perd plus de séries ([cbf0ca2](https://github.com/Cimavia/cimavia/commit/cbf0ca203af028f16ffc8da2abad4954e9d2fdb6))
* **mobile:** le cache de séance prend le suivi envoyé, l'ancien décompte ne revient plus ([64fb28a](https://github.com/Cimavia/cimavia/commit/64fb28a579adea6db4a720ee007e43e7f34ab7c2))
* **mobile:** le débrief écarte le suivi d'un exercice retiré et relit la séance sur un 400 ([ceab943](https://github.com/Cimavia/cimavia/commit/ceab943f32fd8e4a096c1187bc520c8150c09708))
* **mobile:** retirer la permission face id que l'app ne demande jamais ([de70b4e](https://github.com/Cimavia/cimavia/commit/de70b4ec4147419b80baf3b7dc9ac0516e92c3ef))
* **mobile:** un seul suivi local par séance, partagé par la séance et son débrief ([af84a59](https://github.com/Cimavia/cimavia/commit/af84a593bc8ff1b18fb85516dad552b029fd4470))
* **mobile:** une coche posée pendant l'envoi du débrief reste en local, plus effacée ([f652d27](https://github.com/Cimavia/cimavia/commit/f652d2792046a2f96cefc18dfc84976fa7743c69))
* **web:** la confirmation de rechargement ne promet plus de perte quand rien n'est ajusté ([b7b3adb](https://github.com/Cimavia/cimavia/commit/b7b3adb1ad4170978039ca98aa1c6c46c68c0a77))
* **web:** le cache de séance prend le suivi envoyé, l'ancien décompte ne revient plus ([6acbe03](https://github.com/Cimavia/cimavia/commit/6acbe03bce5d260af7c56e9b450f848aa045ff47))
* **web:** le débrief n'envoie plus le suivi d'un exercice retiré par le coach ([bf24f07](https://github.com/Cimavia/cimavia/commit/bf24f0760406762e4efe101460c6897e0fcb956d))
* **web:** recharger un exercice ne reprend plus que sa ligne, pas les modifs des autres ([2eaa89c](https://github.com/Cimavia/cimavia/commit/2eaa89c94294762fab63e2cdea3f1c88a260d1ac))
* **web:** un échec après la création d'un exercice ne le recrée plus au réessai ([e652adc](https://github.com/Cimavia/cimavia/commit/e652adc157268aaf295d34e1cf079d7db3b3579f))
* **web:** un lien de pièce jointe invalide est refusé dès l'ajout, pas à l'enregistrement ([7180ea4](https://github.com/Cimavia/cimavia/commit/7180ea469c75562b56fda8a79c7b35bb01859077))
* **web:** un refus du débrief relit la séance, l'envoi suivant passe sans attendre ([e227376](https://github.com/Cimavia/cimavia/commit/e2273764e2f56b9a6d0a70c81d5af2c3b9fa59b3))
* **web:** une coche posée pendant l'envoi du débrief reste en local, plus effacée ([51e9f4b](https://github.com/Cimavia/cimavia/commit/51e9f4b1e35674c3a10c11ca25a0077cf8f12010))
* **web:** une image de consigne déjà envoyée n'est plus renvoyée au réessai ([9ed4c17](https://github.com/Cimavia/cimavia/commit/9ed4c177890cddc37d0a5cd10be0a53cb88e5533))


### Technique

* **deps:** bump dbeaver/cloudbeaver ([ac11e54](https://github.com/Cimavia/cimavia/commit/ac11e54fedbd051f44eab80b0a4cda07daf8c27a))
* **deps:** bump dbeaver/cloudbeaver from 26.2.0 to 26.2.1 in /deploy/preview in the docker-compose group across 1 directory ([ace3fc6](https://github.com/Cimavia/cimavia/commit/ace3fc65df493da67787ff889b32a57d15f921c7))
* **mobile:** ajouter expo-video à la version du sdk 56, mocké dans le harnais de test ([3b2811e](https://github.com/Cimavia/cimavia/commit/3b2811ef4bf5378baa0f5559480b92c24ac44ef8))
* **mobile:** aligner expo sur le sdk 56, dom-webview et metro-runtime déclarés ([fbea317](https://github.com/Cimavia/cimavia/commit/fbea3172c7123e0dc770cb3da3459bdd5dca428b))
* **shared:** deux alertes sonar levées dans le suivi de séance, même comportement ([e099115](https://github.com/Cimavia/cimavia/commit/e09911513a10c4844ac2676f402b475f596e9606))
* **shared:** typecheck la config vitest, où all traînait morte, et mesurer type/ ([12aac85](https://github.com/Cimavia/cimavia/commit/12aac85bf248852a561a680b28a6869766723e4c))
* **shared:** un seul enregistrement du débrief pour web et mobile, déjà divergents ([ea725c2](https://github.com/Cimavia/cimavia/commit/ea725c26fc0a6856797791c3e326b4397bb2baec))
* **shared:** une seule fonction écrit le suivi envoyé dans la séance en cache ([719af5d](https://github.com/Cimavia/cimavia/commit/719af5d3ec0840ec693d27f6a833cb96c5a7b061))
* **sonar:** poser la jumelle du baril de @cmv/shared, exclu du seul côté vitest ([6688139](https://github.com/Cimavia/cimavia/commit/66881393d30e6bc8636cf3dc684366c2b45ca3e7))

## [1.8.3](https://github.com/Cimavia/cimavia/compare/v1.8.2...v1.8.3) (2026-09-28)


### Corrections

* **api:** la diffusion refuse un justificatif préparé pour un autre athlète que la facture ([e277a78](https://github.com/Cimavia/cimavia/commit/e277a784323ff552236610bb56a8e0280d709564))
* **api:** un justificatif joint bloque la réaffectation du brouillon, il nomme son athlète ([d366289](https://github.com/Cimavia/cimavia/commit/d3662899792f321038291610d68b2fcf639d70d8))
* **web:** un justificatif joint ferme le sélecteur d'athlète, et la raison s'écrit dessous ([14246d1](https://github.com/Cimavia/cimavia/commit/14246d190f8c41b31892225173f307319296968a))

## [1.8.2](https://github.com/Cimavia/cimavia/compare/v1.8.1...v1.8.2) (2026-09-27)


### Technique

* sonar dit pourquoi le tag et le digest d'une image de base changent toujours ensemble ([31f4bf9](https://github.com/Cimavia/cimavia/commit/31f4bf9e02a8aaedaeed40242521674afbc338f3))

## [1.8.1](https://github.com/Cimavia/cimavia/compare/v1.8.0...v1.8.1) (2026-09-27)


### Corrections

* **api:** une séance débriefée refuse la suppression, la cascade effaçait le débrief ([e9381a1](https://github.com/Cimavia/cimavia/commit/e9381a1fbc0dc328087d99178dda34e016ef6307))
* **web:** l'étage de build installe les certificats racine, sentry-cli joint enfin sentry ([6ba7344](https://github.com/Cimavia/cimavia/commit/6ba73448697f48f8a302800866e57363151a04f5))
* **web:** la raison d'une suppression fermée s'affiche, le bouton désactivé la masquait ([7917d28](https://github.com/Cimavia/cimavia/commit/7917d28fa708ced67e392de27cc6dc852c6e249b))
* **web:** la raison d'une suppression fermée s'affiche, le bouton désactivé la masquait ([b4407b4](https://github.com/Cimavia/cimavia/commit/b4407b4be092bb52cd301b618cc0f13c502b2a86))
* **web:** un cycle diffusé dit au survol pourquoi sa suppression est fermée ([e65f8d0](https://github.com/Cimavia/cimavia/commit/e65f8d0d285019ac7703bbfa236d81ad44ba702f))
* **web:** un téléversement sentry qui échoue fait échouer le build au lieu de passer vert ([545ffce](https://github.com/Cimavia/cimavia/commit/545ffce5e8d97c084a8feec989c59bd296e246e8))
* **web:** une séance débriefée grise sa suppression, et un retrait diffusé s'annonce ([8666c7c](https://github.com/Cimavia/cimavia/commit/8666c7cd15ce144c6a19bf3a9cd730c181475a56))


### Technique

* le miroir pagine sa recherche d'issue, au-delà de 100 ouvertes il en créait un doublon ([749a130](https://github.com/Cimavia/cimavia/commit/749a130812d3163956824649d0f1c25f1b275794))
* pnpm-version.yml signale chaque lundi un pnpm plus récent dans la même majeure ([73872ce](https://github.com/Cimavia/cimavia/commit/73872cecd29a3c7f23b561c8c141e3255dbbf64b))

## [1.8.0](https://github.com/Cimavia/cimavia/compare/v1.7.1...v1.8.0) (2026-09-27)


### Fonctionnalités

* **web:** url de l'api et tier lus dans config.js au démarrage, sans repli sur localhost ([98981b4](https://github.com/Cimavia/cimavia/commit/98981b40f8d8e1cdc0acacd80fc91f5eeecb74d1))


### Corrections

* **mobile:** marquer lu chaque nouvel entrant, un second restait non lu et coupait le push ([cfd407d](https://github.com/Cimavia/cimavia/commit/cfd407d5755b04521e512a682f603387ca6e18c7))
* **shared:** marquer lu par id du dernier entrant non lu, et retenter après un échec ([42fb1b6](https://github.com/Cimavia/cimavia/commit/42fb1b6e58bf2e56eab4654a10d721bacea3a560))
* **web:** marquer lu chaque nouvel entrant, un second restait non lu et coupait le push ([e481bf2](https://github.com/Cimavia/cimavia/commit/e481bf2f9413fc8664d5b8e245154bc2cf2b6def))


### Technique

* **deploy:** le nas passe sa config au web et attend qu'il soit sain, comme l'api ([d4ad7b1](https://github.com/Cimavia/cimavia/commit/d4ad7b11c30364ea9c4ca41b7d03f6f72c4798cd))
* détection du commit de bump extraite en action, pour que l'api et le web la partagent ([bb2b260](https://github.com/Cimavia/cimavia/commit/bb2b26063904ac975c8f928238dd9b5368481d7a))
* l'image web se construit une fois par commit de main, et démarre avant son tag ([a2013df](https://github.com/Cimavia/cimavia/commit/a2013df8071db28320913f5bdb1c24239f647af7))
* la promotion retague l'image web de la version au lieu de la reconstruire pour preview ([325d36f](https://github.com/Cimavia/cimavia/commit/325d36fe2953ba78e1deb5cc5887b7b143102f32))
* **web:** nginx sert config.js depuis l'environnement, l'image ne fige plus le tier ([6c56b26](https://github.com/Cimavia/cimavia/commit/6c56b26ee974cff9c925bfe314c7cbe6e70232fe))

## [1.7.1](https://github.com/Cimavia/cimavia/compare/v1.7.0...v1.7.1) (2026-09-27)


### Corrections

* **shared:** refuser au démarrage les secrets courts, l'auth en http et le push sans jeton ([a565db0](https://github.com/Cimavia/cimavia/commit/a565db00ae6fed1c59553bd74e2a6c0855a26a2f))


### Technique

* donner un jeton expo factice au smoke de l'image, exigé désormais en preview ([0164d80](https://github.com/Cimavia/cimavia/commit/0164d8019caec53e64bd94f9ca5b780440fe7900))
* sonar ignore la règle tag ou digest des dockerfiles, qui contredit l'épinglage de [#379](https://github.com/Cimavia/cimavia/issues/379) ([78a8cd6](https://github.com/Cimavia/cimavia/commit/78a8cd64654ddbf8cba7545b3d945903e6cd8ebb))

## [1.7.0](https://github.com/Cimavia/cimavia/compare/v1.6.2...v1.7.0) (2026-09-27)


### Fonctionnalités

* **shared:** lire un décimal à la virgule ou au point, l'écrire dans la langue du lecteur ([34c0fe6](https://github.com/Cimavia/cimavia/commit/34c0fe6c48fbf01ac3a6e8002a04d0f3b2c9acb3))
* **shared:** une seule liste des secrets d'url, pour le web et bientôt pour l'api ([0618c5e](https://github.com/Cimavia/cimavia/commit/0618c5e9aff0144b95ce5daf265f589b34d1cdad))


### Corrections

* **api:** les journaux ne gardent que id, méthode, url blanchie et statut, aucun en-tête ([70e2014](https://github.com/Cimavia/cimavia/commit/70e201443cc4785a9fb90db3df6986f637e7dfc6))
* **api:** sentry ne lit plus le corps et retire cookies, en-têtes secrets et jetons d'url ([bbb9f1b](https://github.com/Cimavia/cimavia/commit/bbb9f1b3fb98f7e172908dedcc5c7e1d9465ad49))
* écrire les valeurs de dosage dans la langue du lecteur, 12,5 kg et non 12.5 kg ([440a383](https://github.com/Cimavia/cimavia/commit/440a38375b4427112d04e4c26244ce37e2146672))
* saisie décimale dans la grille de dosage ([#298](https://github.com/Cimavia/cimavia/issues/298) · [#299](https://github.com/Cimavia/cimavia/issues/299) · [#332](https://github.com/Cimavia/cimavia/issues/332)) ([1cdbf72](https://github.com/Cimavia/cimavia/commit/1cdbf723aab79a53c023d3832fc59fcd6096c700))
* **shared:** arrondir la progression régulière, un pas de 0,1 donnait 0,30000000000000004 ([743620a](https://github.com/Cimavia/cimavia/commit/743620ac3acb44fdd314bb13eccf037fd9064fd5))
* **web:** accepter un pas décimal dans la progression régulière au lieu de le tronquer ([314bc36](https://github.com/Cimavia/cimavia/commit/314bc36416dd50d19b8fc266013917b8881bce0e))
* **web:** garder la virgule à la frappe, et la valeur tapée quand entrée ajoute une ligne ([8e25a57](https://github.com/Cimavia/cimavia/commit/8e25a5711bb0ade6acda1acd18ba9de8a896f772))


### Technique

* codeql trié, l'alerte du contrôle i18n corrigée et le default setup retenu ([c2880dc](https://github.com/Cimavia/cimavia/commit/c2880dcf3e33ad4d9845757b83256c001a31e49d))
* dependabot ne propose plus les majeures de node, qui avancent à l… ([01557de](https://github.com/Cimavia/cimavia/commit/01557ded82e5e234ec20369301568dd093296997))
* dependabot ne propose plus les majeures de node, qui avancent à la main vers une lts ([cea6488](https://github.com/Cimavia/cimavia/commit/cea64889c522bfc74c1ab2f700cd16fe0d3f0b3d))
* le contrôle i18n liste ses fichiers en node, plus de find lancé par un shell ([7312811](https://github.com/Cimavia/cimavia/commit/7312811ac3a94f738330159ed0ad5142f802ff9e))

## [1.6.2](https://github.com/Cimavia/cimavia/compare/v1.6.1...v1.6.2) (2026-09-27)


### Corrections

* **api:** l'image de l'api n'embarque plus npm, corepack ni yarn, 18 failles de moins ([1f166d9](https://github.com/Cimavia/cimavia/commit/1f166d909b585617b04bfbf547d62cea2158177c))
* **web:** nginx tourne sans root sur le port 8080, image web passée sur nginx-unprivileged ([7f70802](https://github.com/Cimavia/cimavia/commit/7f708027e3c77f605f50854148e39eafe5efe2c7))
* **web:** utilisateur 101 explicite dans le dockerfile, trivy config n'y voit plus de root ([e839f67](https://github.com/Cimavia/cimavia/commit/e839f6720b4d8a2d2d55768ea80eedcd58a21a0c))


### Technique

* bump the actions group across 2 directories with 10 updates ([3e7c4cb](https://github.com/Cimavia/cimavia/commit/3e7c4cbe18a260f9992ee89c2961c00580d2f5c1))
* dependabot suit npm, docker et les composes, majeures à part ; builds bornés à 15 min ([c2bc8ea](https://github.com/Cimavia/cimavia/commit/c2bc8ea62bf2b0ed39d4f29c610427ef6371c889))
* images tirées épinglées par digest, un tag reconstruit ne change plus rien en douce ([8a055c5](https://github.com/Cimavia/cimavia/commit/8a055c59166d3f53bff19e0526436dcb270f9010))
* les derniers restes du nom dev du tier preview partent, repli deploy/dev compris ([c97fe00](https://github.com/Cimavia/cimavia/commit/c97fe00fd9158e4e13316853138b65b798daa894))
* nom fixe pour le job matriciel de trivy, un job sauté affichait l'expression brute ([71d7810](https://github.com/Cimavia/cimavia/commit/71d78107a8932d52af75aea1ef10dda1a781cd83))
* trivy scanne images et dockerfiles sans jamais croiser de jeton, en alerte seulement ([c332b8d](https://github.com/Cimavia/cimavia/commit/c332b8df41eef53f4450b343906ae8b5457c37b5))

## [1.6.1](https://github.com/Cimavia/cimavia/compare/v1.6.0...v1.6.1) (2026-09-26)


### Technique

* l'image de l'api démarre sur une base jetable avant de recevoir son numéro de version ([ab8aff1](https://github.com/Cimavia/cimavia/commit/ab8aff1096a71484f0f6d85c32f3c4270dd7ad7b))
* le smoke lit les identifiants de sa base jetable dans le compose, sans les recopier ([d0506e9](https://github.com/Cimavia/cimavia/commit/d0506e90620c12378ca2b775b7abb5a9ecab034d))
* les builds de production des trois apps tournent sur chaque pr, filtrés par app ([71e9f9c](https://github.com/Cimavia/cimavia/commit/71e9f9c0b7ab29b96bde52ac5bf65f3647fbe60b))
* un scope de cache par image, l'api et le web n'effacent plus l'index l'un de l'autre ([6772531](https://github.com/Cimavia/cimavia/commit/67725317ad17aa8a545709091274f3ea9c2dcc98))

## [1.6.0](https://github.com/Cimavia/cimavia/compare/v1.5.9...v1.6.0) (2026-09-26)


### Fonctionnalités

* **shared:** un helper qui reconnaît le 401 d'une session perdue, commun au web et au mobile ([607874e](https://github.com/Cimavia/cimavia/commit/607874e6a941f5858a730c1f57a56d33632884b7))
* **web:** reconnexion sur place quand la session tombe, sans démonter l'écran ni perdre la saisie ([c60db5b](https://github.com/Cimavia/cimavia/commit/c60db5b5105852d2879cdb54438ac45499e529ab))


### Corrections

* **api:** ouvrir sa propre fiche en auto-coaching, qui répondait 404 faute de relation ([e951396](https://github.com/Cimavia/cimavia/commit/e951396dca862cb1a81f8c0d736eb4bcbce288a7))
* **api:** une fiche par couple coach-athlète, la fiche perso heurtait celle du coach ([73fcda3](https://github.com/Cimavia/cimavia/commit/73fcda37bf03d51d93348565d6c59eec61ee4993))
* **web:** fiche athlète éditable une fois reçue, un échec de lecture ne l'écrase plus ([fe89eba](https://github.com/Cimavia/cimavia/commit/fe89eba57c8b17a640e74d4c88d887c9297e3b08))
* **web:** la garde emporte la page demandée jusqu'à la connexion et ne piège plus le bouton retour ([7c9ecc9](https://github.com/Cimavia/cimavia/commit/7c9ecc915a8853839e701afdc6d4499b118818f9))
* **web:** la reconnexion devient un vrai dialog, et les remarques sonar sont levées ([0c305dc](https://github.com/Cimavia/cimavia/commit/0c305dc9220360d5eebeb34e05b0ddb94b6889b7))
* **web:** les constructeurs se taisent sur un 401, la reconnexion en dit la cause ([5c3203d](https://github.com/Cimavia/cimavia/commit/5c3203d50a6e346438dac8152db026d1f6c5f36f))
* **web:** retirer jetons et signatures s3 des événements sentry, qui emportent l'url de la page ([0616700](https://github.com/Cimavia/cimavia/commit/0616700175585104d35f08eae937169ea964323b))
* **web:** retirer le jeton de réinitialisation de l'url dès sa lecture, sans entrée d'historique ([c77154c](https://github.com/Cimavia/cimavia/commit/c77154c56da04e8a82fdf495242bf1606e07ba2c))
* **web:** un 401 fait relire la session au lieu d'afficher un toast unauthorized brut ([56e3698](https://github.com/Cimavia/cimavia/commit/56e36981764defea894a45f9b59c6e440777788c))
* **web:** un seul point de purge au changement de compte, presse-papier de semaine compris ([62f433f](https://github.com/Cimavia/cimavia/commit/62f433f454d49a3a52a6444979353de3fcac9678))


### Technique

* chaque job épinglé sur ubuntu 26.04 et borné dans le temps, mesure en commentaire ([6c3771e](https://github.com/Cimavia/cimavia/commit/6c3771ead41ce5b706aaadcf2ac4a772c3a7879d))
* commitlint relit chaque commit de la pr en ci, plus seulement sur le poste ([a44ef0f](https://github.com/Cimavia/cimavia/commit/a44ef0f5e5ab77df66d918b41c5e6fb7ffa82c1b))
* dependabot suit aussi les actions appelées par les actions composites du dépôt ([7164174](https://github.com/Cimavia/cimavia/commit/7164174405f599c51ba75aed851ba3653add86fe))
* setup commun aux trois jobs de ci.yml, versions lues à la source, dsn factice retiré ([6933dc3](https://github.com/Cimavia/cimavia/commit/6933dc3c9f72c6e2922c5026595f08ad4714b30b))
* **web:** l'échec d'un formulaire passe par un composant testé, pas trois copies ([c2104cb](https://github.com/Cimavia/cimavia/commit/c2104cbade3ff899a31bb6c13c0237c4c9a7246c))

## [1.5.9](https://github.com/Cimavia/cimavia/compare/v1.5.8...v1.5.9) (2026-09-26)


### Corrections

* **api:** fermer les capacites a /update-user, qui contournait le ver… ([9933d2f](https://github.com/Cimavia/cimavia/commit/9933d2f85d5df3f6cafebccd36ee40582b4de1c3))
* **api:** fermer les capacites a /update-user, qui contournait le verrou des athletes actifs ([539b4f4](https://github.com/Cimavia/cimavia/commit/539b4f4be8b2fd64a1f9b79c737f830b8da13d9b))

## [1.5.8](https://github.com/Cimavia/cimavia/compare/v1.5.7...v1.5.8) (2026-09-26)


### Technique

* audit zizmor des workflows à chaque pr et chaque lundi, constats dans code scanning ([9863239](https://github.com/Cimavia/cimavia/commit/9863239d8edba05e93559f14685bd791416e9853))
* build de l'api sans concurrency par choix, exception zizmor posée et motivée ([74d3be3](https://github.com/Cimavia/cimavia/commit/74d3be3479a771f6ac324dd4b5bbf6d56187d053))
* dependabot attend 7 jours avant de proposer une nouvelle version d'action ([821fc35](https://github.com/Cimavia/cimavia/commit/821fc359b5df61ffe176c4b4c62cec602aff240d))
* épinglages dont la version se vérifie, action-setup sur le commit de v4.3.0 ([2f4c71d](https://github.com/Cimavia/cimavia/commit/2f4c71d04d25b916a585992fb33005d577a15db4))
* jetons de l'app bornés aux droits utiles, chaque permission de job justifiée ([6f3ead5](https://github.com/Cimavia/cimavia/commit/6f3ead5702bfc3f14f9453e979bf8af1bc8fc34f))
* plus aucun checkout ne garde son jeton, sauf celui qui pousse preview ([97f8137](https://github.com/Cimavia/cimavia/commit/97f8137f15c4092349bebf6757876de0fb085a2b))
* promotion en preview, variables passées par env et plus interpolées dans le script ([2932f86](https://github.com/Cimavia/cimavia/commit/2932f8636f6a12479f0293d5c61dcd28fe658cc4))
* tick de rappels sans droit de jeton, borné à 5 min, variable et secret passés par env ([d90f01e](https://github.com/Cimavia/cimavia/commit/d90f01e85de58d74c2be1b0001350cdd12460522))

## [1.5.7](https://github.com/Cimavia/cimavia/compare/v1.5.6...v1.5.7) (2026-09-26)


### Corrections

* **api:** nest 11.2.6 et @fastify/static 10, find-my-way et le garde de /docs corrigés ([e104f6a](https://github.com/Cimavia/cimavia/commit/e104f6ae37f08bdec314f1ebf296e92f9044d71f))
* **api:** nodemailer 9.1.1, l'option raw ne contourne plus le bac à sable des fichiers ([26de8db](https://github.com/Cimavia/cimavia/commit/26de8dbdc441c1cde360644999ab50041de30072))
* forcer les correctifs de même majeure des dépendances transitives par overrides pnpm ([344127f](https://github.com/Cimavia/cimavia/commit/344127fef7a07c6029d145b0259cd28ee8d7afa5))
* **web:** tiptap 3.31.3, ferme le redos markdown et la fuite __proto__ de mergeattributes ([45cf650](https://github.com/Cimavia/cimavia/commit/45cf65060277038b16862540284b32345518565b))


### Technique

* vitest 4.1.11 et postcss 8.5.28, traversée de chemin du mocker et des source maps ([811dfc4](https://github.com/Cimavia/cimavia/commit/811dfc4e9613b5b6a6327166fd85fdaaef65eac8))

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
