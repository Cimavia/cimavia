/**
 * Ce qui entre dans l'empreinte native, donc dans la `runtimeVersion` (#287). Un update n'est
 * servi qu'aux binaires dont l'empreinte est IDENTIQUE à la sienne.
 *
 * `ExpoConfigVersions` retire `version` : release-please la réécrit dans `app.json` à chaque
 * release. Laissée dans l'empreinte, elle couperait la diffusion à chaque version — un correctif
 * publié depuis le tag 1.5.4 n'atteindrait aucun binaire 1.5.3, ce qui est précisément ce qu'un
 * update doit faire. `android.versionCode` et `ios.buildNumber` suivent, sans effet ici : EAS les
 * tient à distance (`appVersionSource: remote`).
 *
 * `PackageJsonAndroidAndIosScriptsIfNotContainRun` est la valeur par défaut de
 * `@expo/fingerprint`, RÉPÉTÉE parce que `sourceSkips` la remplace au lieu de s'y ajouter.
 *
 * Tout le reste compte, et c'est voulu : un module natif ajouté, un plugin, un identifiant ou
 * `APP_VARIANT` qui changent donnent une autre empreinte. Un update publié sans `APP_VARIANT`
 * n'atteint donc personne, au lieu d'arriver tagué `development` chez le Coach.
 */
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "PackageJsonAndroidAndIosScriptsIfNotContainRun"],
};
