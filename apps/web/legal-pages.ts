import { readdirSync, readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
// Le JSON, et non `cmvColors` d'`@cmv/tokens` : ce fichier est chargé avec la config Vite, par Node,
// qui lit le paquet sans les alias de l'app. Son `index.ts` importe ce même JSON sans l'attribut
// `type: "json"` que Node exige — démarrage refusé (`ERR_IMPORT_ATTRIBUTE_MISSING`). Même source.
import palette from "../../packages/tokens/src/palette.json";

/**
 * Les documents légaux (#778) : politique de confidentialité, mentions légales, conditions
 * d'utilisation, suppression du compte (#795). Des pages STATIQUES, hors de la SPA — l'encadré « Tranché en #778 » du journal dit
 * pourquoi : `app-preview` est derrière Cloudflare Access, et seule une page qui ne charge pas l'app
 * peut en être exemptée sans rouvrir l'app entière.
 *
 * Chaque texte est un FRAGMENT HTML, `legal/<langue>/<document>.html`, qui commence par son `<h1>`.
 * Le plugin l'enveloppe dans un gabarit dont le style est tiré de `@cmv/tokens` (règle n°3) et
 * l'émet en `dist/legal/<langue>/<document>.html` ; nginx le sert sans l'extension. En dev, un
 * middleware rend la même page à la volée : modifier un texte puis recharger suffit. En
 * `vite preview`, un autre sert la page CONSTRUITE, comme nginx : c'est l'artefact qu'il éprouve.
 *
 * Les chemins publiés sont ceux de `LEGAL_DOCUMENTS` (@cmv/shared) : le plugin ne les importe pas
 * — la config Vite est chargée par Node, sans les alias de l'app —, `legal-pages.test.ts` vérifie
 * que les fichiers présents et la table partagée disent la même chose.
 */

export type LegalSource = { locale: string; document: string; fragment: string };

const SOURCE_DIR = path.resolve(import.meta.dirname, "legal");
const EXTENSION = ".html";

/**
 * Le titre de l'onglet, lu dans le `<h1>` du fragment : le texte se nomme lui-même, dans sa langue.
 * Un fragment sans `<h1>` est une erreur d'écriture, pas un document sans titre : le build échoue.
 *
 * Des `indexOf` et non une regex : `<h1…>(…)</h1>` comme `<[^>]+>` reviennent sur leurs pas
 * (S8786). Le fragment est écrit par nous, sa forme est connue : un `<h1>` de texte seul, que
 * l'onglet affiche tel quel — une balise dedans y apparaîtrait en clair, d'où le refus.
 */
export function legalTitle(source: LegalSource): string {
  const fragment = source.fragment.trimStart();
  const file = `legal/${source.locale}/${source.document}.html`;
  const start = fragment.startsWith("<h1") ? fragment.indexOf(">") + 1 : 0;
  const end = start === 0 ? -1 : fragment.indexOf("</h1>", start);
  if (end === -1) throw new Error(`${file} doit commencer par son <h1>`);
  const title = fragment.slice(start, end).trim();
  if (title.includes("<")) throw new Error(`le <h1> de ${file} ne porte que du texte`);
  return title;
}

/** Le style des pages, depuis la palette : aucune couleur écrite ici. */
function legalStyle(): string {
  return [
    "*{box-sizing:border-box}",
    `body{margin:0;background:${palette.bg[0]};color:${palette.text.mid};font:15px/25px system-ui,sans-serif}`,
    "main{max-width:760px;margin:0 auto;padding:48px 16px 64px}",
    `h1,h2,h3,strong{color:${palette.text.hi}}`,
    "h1{font-size:32px;line-height:38px;margin:0 0 8px}",
    "h2{font-size:20px;line-height:26px;margin:40px 0 12px}",
    "h3{font-size:16px;line-height:21px;margin:24px 0 8px}",
    `a{color:${palette.accent.on}}`,
    `table{width:100%;border-collapse:collapse;margin:16px 0}`,
    `th,td{border:1px solid ${palette.border.DEFAULT};padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}`,
    `th{background:${palette.surface.DEFAULT};color:${palette.text.hi}}`,
    `.updated{color:${palette.text.lo};margin:0 0 32px}`,
  ].join("");
}

/** La page complète d'un document : gabarit, style, fragment. */
export function renderLegalPage(source: LegalSource): string {
  return `<!doctype html>
<html lang="${source.locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>${legalTitle(source)}</title>
    <style>${legalStyle()}</style>
  </head>
  <body>
    <main>
${source.fragment.trim()}
    </main>
  </body>
</html>
`;
}

/** Tous les fragments présents sous `dir`, rangés par langue puis par document. */
export function readLegalSources(dir: string = SOURCE_DIR): LegalSource[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: locale }) =>
      readdirSync(path.join(dir, locale))
        .filter((file) => file.endsWith(EXTENSION))
        .map((file) => ({
          locale,
          document: file.slice(0, -EXTENSION.length),
          fragment: readFileSync(path.join(dir, locale, file), "utf8"),
        })),
    )
    .sort((a, b) => `${a.locale}/${a.document}`.localeCompare(`${b.locale}/${b.document}`));
}

/**
 * Le seul chemin servi sous `/legal` : `/<langue>/<document>`, en minuscules. Tout le reste — `..`,
 * `%2F`, une majuscule, une extension — répond 404, jamais la SPA : une page absente qui renverrait
 * `index.html` chargerait l'app, que Cloudflare Access garde. Même forme que le `map` de nginx.
 */
const LEGAL_PATH = /^\/([a-z]{2})\/([a-z-]+)$/;

/** `/fr/privacy` → la langue et le document ; `null` pour tout chemin hors de la forme permise. */
export function legalPathOf(url: string | undefined): { locale: string; document: string } | null {
  const match = LEGAL_PATH.exec(url?.split("?")[0] ?? "");
  if (match?.[1] == null || match[2] == null) return null;
  return { locale: match[1], document: match[2] };
}

/** Le contenu d'un fichier, `null` s'il n'existe pas. */
function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function send(res: ServerResponse, page: string | null): void {
  if (page == null) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(page);
}

/** Dev, monté sous `/legal` : `/fr/privacy` rend `legal/fr/privacy.html` à la volée. */
export function legalMiddleware(dir: string = SOURCE_DIR): Connect.NextHandleFunction {
  return (req, res) => {
    const target = legalPathOf(req.url);
    const fragment =
      target == null
        ? null
        : readIfExists(path.join(dir, target.locale, `${target.document}${EXTENSION}`));
    send(res, target == null || fragment == null ? null : renderLegalPage({ ...target, fragment }));
  };
}

/** `vite preview`, monté sous `/legal` : sert `dist/legal/fr/privacy.html` tel que le build l'a émis. */
export function builtLegalMiddleware(outDir: string): Connect.NextHandleFunction {
  return (req, res) => {
    const target = legalPathOf(req.url);
    send(
      res,
      target == null
        ? null
        : readIfExists(path.join(outDir, "legal", target.locale, `${target.document}${EXTENSION}`)),
    );
  };
}

export function legalPagesPlugin(dir: string = SOURCE_DIR): Plugin {
  return {
    name: "cmv-legal-pages",
    configureServer(server) {
      server.middlewares.use("/legal", legalMiddleware(dir));
    },
    configurePreviewServer(server) {
      const outDir = path.resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use("/legal", builtLegalMiddleware(outDir));
    },
    generateBundle() {
      for (const source of readLegalSources(dir)) {
        this.emitFile({
          type: "asset",
          fileName: `legal/${source.locale}/${source.document}.html`,
          source: renderLegalPage(source),
        });
      }
    },
  };
}
