/**
 * Les demandes de permission iOS, traduites (#254).
 *
 * iOS les affiche avant la première ligne de JS : elles sont gravées dans l'`Info.plist` au build,
 * et i18next ne peut rien pour elles. Ce qui les traduit est la clé `expo.locales`, dont
 * `@expo/config-plugins` tire un `<langue>.lproj/InfoPlist.strings` au prebuild.
 *
 * Elles vivent pourtant au catalogue i18next, sous `permission.ios`, plutôt que dans des fichiers
 * `locales` à part : c'est ce qui les met sous `check:i18n` — cette table est lue par son contrôle A,
 * et le registre (tutoiement) couvre `fr.json`. `expo.locales` accepte un objet à la place d'un
 * chemin, d'où une fonction plutôt qu'un script de génération.
 *
 * La valeur écrite dans les plugins d'`app.json` reste le texte de l'`Info.plist` lui-même. Elle
 * double `fr.json`, et un test la tient alignée (dette IOS-4).
 */
export const IOS_PERMISSION_KEY = {
  NSPhotoLibraryUsageDescription: "permission.ios.photoLibrary",
  NSMicrophoneUsageDescription: "permission.ios.microphone",
} as const;

/**
 * Le générateur d'Expo écrit `clé = "valeur";` sans rien échapper : un guillemet droit ou une
 * barre oblique inverse produirait un `InfoPlist.strings` invalide, et rien n'échouerait au build.
 */
const UNESCAPED = /["\\]/;

function translate(catalog: object, key: string, lang: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalog,
    );
  // Une clé absente ne se replie sur rien : la demande s'afficherait dans la langue de repli sans
  // que personne ne le voie — c'est ce que #254 corrige.
  if (typeof value !== "string") {
    throw new TypeError(`Le catalogue ${lang} n'a pas de clé ${key}`);
  }
  if (UNESCAPED.test(value)) {
    throw new Error(`${lang}:${key} contient un caractère qu'InfoPlist.strings n'échappe pas`);
  }
  return value;
}

export function buildIosPermissionLocales(
  catalogs: Record<string, object>,
): Record<string, { ios: Record<string, string> }> {
  return Object.fromEntries(
    Object.entries(catalogs).map(([lang, catalog]) => [
      lang,
      {
        ios: Object.fromEntries(
          Object.entries(IOS_PERMISSION_KEY).map(([plistKey, key]) => [
            plistKey,
            translate(catalog, key, lang),
          ]),
        ),
      },
    ]),
  );
}
