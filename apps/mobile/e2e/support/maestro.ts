import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TestInfo } from "@playwright/test";
import { APP_ID, FLOWS_DIR } from "./env";

const execFileAsync = promisify(execFile);

/**
 * Maestro : `MAESTRO_BIN` quand il est posé, sinon celui de l'installeur officiel
 * (`~/.maestro/bin`), sinon celui du `PATH`.
 */
function maestroPath(): string {
  const fromEnv = process.env.MAESTRO_BIN;
  if (fromEnv) return fromEnv;
  const installed = join(homedir(), ".maestro", "bin", "maestro");
  return existsSync(installed) ? installed : "maestro";
}

/**
 * Joue un flux Maestro (`e2e/flows/<flow>`) sur l'appareil. `vars` lui passe les comptes du seed
 * et les libellés du catalogue : un flux n'écrit aucun texte en dur.
 *
 * Les captures et la hiérarchie de l'écran fautif vont dans le dossier du test, que la CI publie
 * sur échec. La sortie de Maestro accompagne l'erreur : sans elle, un échec ne dirait pas à quelle
 * étape du flux il est survenu.
 *
 * `signal` arrête Maestro avec son test : les specs passent par la fixture `flow`, qui le pose.
 */
export async function runFlow(
  testInfo: TestInfo,
  flow: string,
  vars: Record<string, string>,
  signal: AbortSignal,
): Promise<void> {
  const args = [
    "--no-ansi",
    "test",
    `--debug-output=${testInfo.outputPath("maestro")}`,
    "--flatten-debug-output",
    ...Object.entries({ APP_ID, ...vars }).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    join(FLOWS_DIR, flow),
  ];
  try {
    await execFileAsync(maestroPath(), args, {
      maxBuffer: 16 * 1024 * 1024,
      signal,
      // Ni télémétrie, ni invite à la couper : la suite ne parle qu'à l'appareil.
      env: {
        ...process.env,
        MAESTRO_CLI_NO_ANALYTICS: "1",
        MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
      },
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(`Maestro — ${flow} :\n${stdout ?? ""}\n${stderr ?? ""}`);
  }
}
