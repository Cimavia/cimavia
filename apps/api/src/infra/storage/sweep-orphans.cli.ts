import "../../instrument";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { explainSweepFailure, parseSweepArgs, runSweep } from "./orphan-sweep.report";
import { OrphanSweepService } from "./orphan-sweep.service";

/**
 * Balayer les objets du bucket qu'aucune ligne ne cite (#72) — à la main, dans le conteneur de
 * l'API, sous l'identité ROOT du stockage : lister le bucket est un droit que la clé d'API n'a pas
 * (« Tranché en #267 »). Simulation par défaut ; `--delete` pour supprimer. Procédure :
 * `deploy/preview/README.md`, « Balayer les objets orphelins ».
 *
 *   node dist/infra/storage/sweep-orphans.cli [--delete] [--prefix <préfixe>]
 */
async function main(): Promise<void> {
  const args = parseSweepArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await runSweep(app.get(OrphanSweepService), args, new Date(), console.log);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(explainSweepFailure(error) ?? error);
  process.exitCode = 1;
});
