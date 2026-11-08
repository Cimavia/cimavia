import "../instrument";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AccountErasureService } from "./service/account-erasure.service";

/**
 * Supprimer un compte depuis le serveur (#256) : une demande reçue par e-mail, ou les suppressions
 * à rejouer après une restauration de sauvegarde (`--no-mail`, la personne a déjà été prévenue).
 *
 *   node dist/erasure/erase-account.cli <userId> [--no-mail]
 */
async function main(): Promise<void> {
  const [userId, flag] = process.argv.slice(2);
  if (userId == null || (flag != null && flag !== "--no-mail")) {
    throw new Error("usage : erase-account.cli <userId> [--no-mail]");
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(AccountErasureService).erase(userId, { notify: flag == null });
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
