import type { EnvSchema } from "@cmv/shared";

type Variable = keyof EnvSchema;

/**
 * Un groupe de variables OPTIONNELLES qui active une capacité de l'API (#212).
 *
 * `required` : ce sans quoi la capacité est éteinte — la même règle que le service qui la porte,
 * et un test vérifie que les deux disent pareil. `links` : ce sans quoi elle marche, mais moins
 * bien ; ces variables ne sont regardées qu'une fois `required` complet.
 */
type ConfigGroup = {
  name: string;
  required: readonly Variable[];
  /** Ce qui se passe tant que le groupe n'est pas complet — c'est ce qu'on lit au démarrage. */
  without: string;
  links?: { variables: readonly Variable[]; without: string };
};

/**
 * Les capacités que l'API sait faire tourner sans configuration. `envSchema` les laisse toutes
 * `optional()` À DESSEIN : l'API démarre sans, et ne dit rien. Ce rapport est l'autre moitié du
 * contrat — l'absence se lit au lancement, pas au premier usage raté.
 *
 * Sentry et Axiom sont deux lignes et non une : ils s'allument chacun de leur côté.
 */
export const CONFIG_GROUPS: readonly ConfigGroup[] = [
  {
    name: "mail",
    required: ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM"],
    without: "les e-mails ne partiront pas",
    // Sans elle, `webPage` rend `null` : vérification d'adresse, invitation, réinitialisation et
    // désabonnement partent SANS leur lien.
    links: { variables: ["WEB_URL"], without: "les e-mails partiront sans aucun lien" },
  },
  {
    name: "storage",
    required: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    without: "l'envoi et la lecture des médias répondront 503",
  },
  {
    name: "push",
    required: ["EXPO_ACCESS_TOKEN"],
    without: "Expo refusera tous les push",
  },
  {
    name: "tick",
    required: ["REMINDER_TICK_SECRET"],
    without: "le déclencheur de rappels répondra 503",
  },
  {
    name: "sentry",
    required: ["SENTRY_DSN"],
    without: "les erreurs ne remonteront pas à Sentry",
  },
  {
    name: "axiom",
    required: ["AXIOM_TOKEN", "AXIOM_DATASET"],
    without: "les journaux ne partiront pas vers Axiom, seulement sur la sortie standard",
  },
];

/**
 * - `complete` : tout est là.
 * - `degraded` : la capacité marche, sans ses liens (`links`).
 * - `incomplete` : une PARTIE des variables est posée — le cas le plus suspect, une variable
 *   oubliée ou mal recopiée.
 * - `off` : aucune n'est posée, la capacité est éteinte.
 */
export type ConfigState = "complete" | "degraded" | "incomplete" | "off";

export type ConfigReportLine = {
  group: string;
  state: ConfigState;
  /** Les variables à poser pour que le groupe soit complet. */
  missing: Variable[];
  /** La phrase du journal. */
  message: string;
};

/**
 * Une chaîne vide est une absence : `ConfigService` rend la valeur BRUTE de `process.env` quand
 * le schéma a validé `""` en `undefined` (voir `webUrlOf`).
 */
function isSet(value: unknown): boolean {
  return value != null && value !== "";
}

function lineFor(group: ConfigGroup, read: (variable: Variable) => unknown): ConfigReportLine {
  const missing = group.required.filter((variable) => !isSet(read(variable)));
  if (missing.length === group.required.length) {
    return {
      group: group.name,
      state: "off",
      missing,
      message: `Configuration ${group.name} absente : ${group.without}`,
    };
  }
  if (missing.length > 0) {
    return {
      group: group.name,
      state: "incomplete",
      missing,
      message: `Configuration ${group.name} incomplète (manque ${missing.join(", ")}) : ${group.without}`,
    };
  }
  const missingLinks = (group.links?.variables ?? []).filter((variable) => !isSet(read(variable)));
  if (group.links != null && missingLinks.length > 0) {
    return {
      group: group.name,
      state: "degraded",
      missing: missingLinks,
      message: `Configuration ${group.name} sans ${missingLinks.join(", ")} : ${group.links.without}`,
    };
  }
  return {
    group: group.name,
    state: "complete",
    missing: [],
    message: `Configuration ${group.name} complète`,
  };
}

/** Une ligne par groupe, dans l'ordre de `CONFIG_GROUPS`. */
export function configReport(read: (variable: Variable) => unknown): ConfigReportLine[] {
  return CONFIG_GROUPS.map((group) => lineFor(group, read));
}
