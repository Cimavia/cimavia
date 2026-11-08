import { Locale } from "../locale";
import { trimTrailingSlashes } from "./url.util";

/**
 * Les documents légaux (#778), dans l'ordre où les apps les listent. Le quatrième (#795) dit comment
 * supprimer son compte : Google Play veut une adresse lisible sans l'app.
 *
 * Ce sont des pages STATIQUES servies par le web sous `/legal/<langue>/<document>`, et non des
 * routes de la SPA : `app-preview` est derrière Cloudflare Access (#263), et une route de la SPA
 * ouverte au public chargerait l'app entière — d'où l'on rejoint `/login` sans repasser par Access.
 * Le pourquoi complet est dans l'encadré « Tranché en #778 » du journal.
 *
 * Le web et le mobile y renvoient tous deux : les chemins ne vivent qu'ici.
 */
export const LEGAL_DOCUMENTS = [
  { document: "privacy", labelKey: "legal.privacy" },
  { document: "legal-notice", labelKey: "legal.legalNotice" },
  { document: "terms", labelKey: "legal.terms" },
  { document: "account-deletion", labelKey: "legal.accountDeletion" },
] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number]["document"];

/**
 * Les langues dans lesquelles les textes sont RÉDIGÉS — pas celles de l'interface. L'anglais est
 * prévu pour l'interface ; tant que les textes n'existent pas en anglais, un lien vers
 * `/legal/en/…` tomberait sur une 404.
 */
export const LEGAL_LOCALES: readonly Locale[] = [Locale.FR];

/**
 * L'URL publique d'un document, dans la langue de l'interface quand il y est rédigé.
 *
 * Le repli sur le français n'est pas une donnée inventée : c'est le texte qui fait foi, et une
 * personne qui lit l'app en anglais doit tout de même pouvoir lire ce qu'elle accepte. `language`
 * vient d'i18next, qui peut porter une région (« fr-FR »), ou rien du tout avant sa première
 * initialisation : seule la langue compte, et son absence vaut le français, pour la même raison.
 */
export function legalDocumentUrl(
  webUrl: string,
  document: LegalDocument,
  language: string | undefined,
): string {
  const primary = language?.split("-")[0]?.toLowerCase();
  const locale = LEGAL_LOCALES.find((candidate) => candidate === primary) ?? Locale.FR;
  return `${trimTrailingSlashes(webUrl)}/legal/${locale}/${document}`;
}
