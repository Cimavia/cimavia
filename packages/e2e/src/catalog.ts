import { createInstance, type TOptions } from "i18next";

/** Un libellé du catalogue, interpolé. */
export type Translate = (key: string, options?: TOptions) => string;

/**
 * Le traducteur des parcours, sur le VRAI catalogue d'une app — le web (#627), le mobile (#638) —
 * là où les tests de rendu rendent la clé. Un sélecteur se cherche dans ce que l'écran affiche :
 * passé par sa clé, il reste vert quand une formulation change, et échoue quand la clé disparaît —
 * ce que la même phrase écrite en dur ferait à l'envers.
 *
 * Une clé absente LÈVE : i18next rendrait la clé elle-même, et le parcours chercherait à l'écran
 * `auth.login.submit` — un échec qui accuserait l'app, loin de sa cause.
 */
export function catalog(app: string, translation: Record<string, unknown>): Translate {
  const i18n = createInstance();
  void i18n.init({
    resources: { fr: { translation } },
    lng: "fr",
    fallbackLng: "fr",
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return (key, options) => {
    if (!i18n.exists(key, options)) throw new Error(`Clé absente du catalogue ${app} : ${key}`);
    return i18n.t(key, options ?? {});
  };
}
