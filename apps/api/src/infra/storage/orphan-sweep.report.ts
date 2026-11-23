import { type ObjectFamily, ORPHAN_GRACE_MS, summarizeOrphans } from "./orphan-sweep";
import {
  emptySweepReport,
  type OrphanSweepService,
  type SweepReport,
} from "./orphan-sweep.service";

export const SWEEP_USAGE = "usage : sweep-orphans.cli [--delete] [--prefix <préfixe>]";

export type SweepArgs = { remove: boolean; prefix?: string };

/**
 * Simulation sauf `--delete` explicite : la première exécution rapporte, elle ne supprime pas. Un
 * préfixe qui ressemble à un drapeau est refusé — `--prefix --delete` avalerait la suppression.
 */
export function parseSweepArgs(argv: readonly string[]): SweepArgs {
  const args: SweepArgs = { remove: false };
  const rest = [...argv];
  for (let arg = rest.shift(); arg != null; arg = rest.shift()) {
    const prefix = arg === "--prefix" ? rest.shift() : undefined;
    if (arg === "--delete") {
      args.remove = true;
    } else if (prefix != null && prefix !== "" && !prefix.startsWith("--")) {
      args.prefix = prefix;
    } else {
      throw new Error(SWEEP_USAGE);
    }
  }
  return args;
}

const FAMILY_LABELS: Record<ObjectFamily, string> = {
  exercise: "documents d'exercice",
  feedback: "médias de débrief",
  invoice: "justificatifs de facture",
  conversation: "médias de messagerie",
};

const GRACE_DAYS = ORPHAN_GRACE_MS / (24 * 60 * 60 * 1000);
const bytes = new Intl.NumberFormat("fr-FR");

const keyList = (title: string, keys: readonly string[]) =>
  keys.length === 0 ? [] : [title, ...keys.map((key) => `  ${key}`)];

/**
 * Le rapport, pour le terminal de l'opérateur — jamais pour les logs. Il nomme chaque clé : celles
 * qui partiraient en simulation (ce qu'on relit avant `--delete`), celles qui sont parties ou ont
 * résisté sinon. Une clé porte le nom du fichier ; elle n'apparaît qu'ici, ni dans Pino ni dans
 * Axiom.
 */
export function formatSweepReport(report: SweepReport, args: SweepArgs): string[] {
  const scope = args.prefix == null ? "tout le bucket" : `préfixe ${args.prefix}`;
  const lines = [
    args.remove
      ? "Balayage des objets orphelins — SUPPRESSION"
      : "Balayage des objets orphelins — SIMULATION (rien n'est supprimé ; --delete pour supprimer)",
    `Objets lus : ${report.scanned} (${scope})`,
    `  cités en base ou déjà en file de retrait : ${report.referenced}`,
    `  récents (moins de ${GRACE_DAYS} jours) ou sans date : ${report.recent}`,
    `  de forme inconnue, jamais supprimés : ${report.unknown.length}`,
    `Orphelins : ${report.orphans.length}`,
  ];
  for (const [family, { count, bytes: weight }] of Object.entries(
    summarizeOrphans(report.orphans),
  )) {
    const size = weight == null ? "poids inconnu" : `${bytes.format(weight)} octets`;
    lines.push(`  ${FAMILY_LABELS[family as ObjectFamily]} : ${count} (${size})`);
  }
  if (args.remove) {
    lines.push(
      `Supprimés : ${report.deleted.length} · échecs : ${report.failed.length}`,
      ...keyList("Clés supprimées :", report.deleted),
      ...keyList("Clés en échec, restées au bucket (relancer le balayage) :", report.failed),
    );
  } else {
    lines.push(
      ...keyList(
        "Clés qui seraient supprimées :",
        report.orphans.map((orphan) => orphan.key),
      ),
    );
  }
  lines.push(...keyList("Clés de forme inconnue (laissées) :", report.unknown));
  return lines;
}

/**
 * Les échecs attendus, dits sans pile : des arguments mal formés (l'usage), ou la commande lancée
 * sous la clé d'API, qui ne liste pas le bucket (« Tranché en #267 »). `null` pour toute autre
 * erreur, dont la pile sert alors au diagnostic.
 */
export function explainSweepFailure(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message === SWEEP_USAGE) return SWEEP_USAGE;
  if (error.name !== "AccessDenied") return null;
  return [
    "Le stockage refuse de lister le bucket : la commande tourne sous la clé d'API, qui n'en a pas",
    "le droit (#267). Relancer avec l'identité root du stockage, passée pour cet appel seulement :",
    "  -e S3_ACCESS_KEY_ID=<root> -e S3_SECRET_ACCESS_KEY=<mot de passe root>",
  ].join("\n");
}

/**
 * Balaye et imprime le rapport. Si le balayage échoue en route, ce qu'il a déjà lu — et supprimé —
 * s'imprime avant que l'erreur remonte : un `--delete` interrompu ne doit pas laisser l'opérateur
 * ignorer ce qui est parti.
 */
export async function runSweep(
  sweeper: Pick<OrphanSweepService, "sweep">,
  args: SweepArgs,
  now: Date,
  print: (text: string) => void,
): Promise<void> {
  const report = emptySweepReport();
  try {
    await sweeper.sweep({ now, ...args }, report);
  } catch (error) {
    if (report.scanned > 0) {
      print(formatSweepReport(report, args).join("\n"));
      print("Balayage INTERROMPU : ce rapport ne couvre que les pages lues avant l'erreur.");
    }
    throw error;
  }
  print(formatSweepReport(report, args).join("\n"));
}
