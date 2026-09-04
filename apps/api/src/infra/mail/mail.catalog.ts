import { Locale } from "@cmv/shared";
import { en } from "./locale/en";
import { fr } from "./locale/fr";

/**
 * Catalogue d'e-mails serveur : les textes des messages transactionnels, par langue.
 *
 * **Pourquoi pas i18next** — l'API n'est pas une UI. Elle rend une poignée de gabarits, jamais
 * dans un contexte de requête utilisateur (Better Auth appelle `sendResetPassword` sans que
 * personne ne soit authentifié), et l'image dépasse déjà 1 Go (dette P7-1). Un objet typé donne
 * plus : une clé oubliée en anglais casse le `satisfies` à la compilation, là où i18next l'aurait
 * laissée passer jusqu'au premier envoi.
 *
 * **L'anglais est écrit dès maintenant**, dormant tant qu'aucun compte ne porte `locale: "en"`.
 * Le coût est de quelques lignes ; l'écrire après coup coûterait de rouvrir chaque gabarit.
 *
 * **Aucune couleur dans le rendu**, et ce n'est pas un oubli : la règle dure n°3 interdit tout
 * `#xxxxxx` hors `@cmv/tokens`, un client mail ne lit aucune classe Tailwind, et la palette est
 * sombre par construction — `text.hi` est illisible sur le fond blanc d'un client mail, que Gmail
 * et Outlook réinversent de toute façon en mode sombre. Un message sans couleur rend correctement
 * partout.
 */

export type MailTemplate = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Les textes d'une langue. `code` en fait partie parce que le gabarit en a besoin : c'est lui qui
 * remplit `<html lang>`, dont dépend la prononciation par un lecteur d'écran et la césure.
 */
export type MailStrings = {
  code: Locale;
  common: {
    signature: string;
    linkFallback: string;
  };
  resetPassword: {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
    expiry: (hours: number) => string;
    ignore: string;
  };
};

export type ResetPasswordParams = {
  url: string;
  /** Durée de validité réelle du jeton, passée par l'appelant — jamais réécrite ici, sous peine
   * de mentir au premier ajustement (même principe que les plafonds médias de `@cmv/shared`). */
  expiresInHours: number;
};

export type MailCatalog = {
  resetPassword(params: ResetPasswordParams): MailTemplate;
};

// `Record<Locale, …>` et non un objet libre : ajouter une valeur à `Locale` sans écrire son
// catalogue devient une erreur de compilation, pas un e-mail en français chez un anglophone.
const STRINGS: Record<Locale, MailStrings> = {
  [Locale.FR]: fr,
  [Locale.EN]: en,
};

// `Object.hasOwn` et non `in` : `in` remonte le prototype, et `"toString"` passerait pour une langue.
function isLocale(value: string): value is Locale {
  return Object.hasOwn(STRINGS, value);
}

/**
 * Les textes de la langue demandée, français par défaut.
 *
 * Le repli ne contredit pas la règle « nullable, pas de fallback silencieux » : une locale n'est
 * pas une donnée métier manquante dont l'absence signifierait quelque chose, c'est un réglage
 * d'affichage dont la base garantit déjà le défaut (`User.locale @default("fr")`). Un e-mail sans
 * langue résolue n'a pas de « — » à afficher : il doit partir.
 */
export function mailStringsFor(locale: string | null | undefined): MailStrings {
  return locale != null && isLocale(locale) ? STRINGS[locale] : STRINGS[Locale.FR];
}

export function mailCatalog(locale: string | null | undefined): MailCatalog {
  const strings = mailStringsFor(locale);
  return {
    resetPassword: ({ url, expiresInHours }) => {
      const body = {
        heading: strings.resetPassword.heading,
        paragraphs: [
          strings.resetPassword.intro,
          strings.resetPassword.expiry(expiresInHours),
          strings.resetPassword.ignore,
        ],
        cta: strings.resetPassword.cta,
        url,
      };
      return {
        subject: strings.resetPassword.subject,
        text: renderText(body, strings),
        html: renderHtml(body, strings),
      };
    },
  };
}

type MailBody = {
  heading: string;
  paragraphs: readonly string[];
  cta: string;
  url: string;
};

/**
 * Échappement HTML, `&` en premier — sinon les entités produites juste après seraient
 * ré-échappées. Ce n'est pas une précaution de principe : une URL Better Auth porte
 * `?token=…&callbackURL=…`, et un `&` brut dans un attribut `href` peut être relu comme le début
 * d'une entité par un client mail — le jeton arriverait tronqué, et le lien ne marcherait « que
 * parfois ».
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Version texte : servie telle quelle aux clients qui refusent le HTML, et c'est aussi elle que
// lisent les filtres anti-spam — un message sans partie texte est plus souvent classé indésirable.
function renderText(body: MailBody, strings: MailStrings): string {
  return [
    body.heading,
    body.paragraphs.join("\n\n"),
    `${body.cta} : ${body.url}`,
    strings.common.signature,
  ].join("\n\n");
}

function renderHtml(body: MailBody, strings: MailStrings): string {
  const href = escapeHtml(body.url);
  const paragraphs = body.paragraphs
    .map((text) => `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`)
    .join("");
  return [
    `<!doctype html><html lang="${strings.code}"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width"><title>${escapeHtml(strings.resetPassword.subject)}</title></head>`,
    `<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5">`,
    `<div style="max-width:520px;margin:0 auto">`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(body.heading)}</h1>`,
    paragraphs,
    `<p style="margin:24px 0"><a href="${href}" style="font-weight:bold">${escapeHtml(body.cta)}</a></p>`,
    `<p style="margin:0 0 4px;font-size:13px">${escapeHtml(strings.common.linkFallback)}</p>`,
    `<p style="margin:0 0 24px;font-size:13px;word-break:break-all">${href}</p>`,
    `<p style="margin:0;font-size:13px">${escapeHtml(strings.common.signature)}</p>`,
    `</div></body></html>`,
  ].join("");
}
