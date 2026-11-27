import { NotificationType } from "@cmv/shared";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { type MailMessage, MailService } from "../src/infra/mail/mail.service";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { NotificationService } from "../src/notification/notification.service";
import { StartupReportService } from "../src/startup/startup-report.service";

/**
 * L'arrêt de l'API laisse finir un e-mail de notification en route, et Prisma ne se déconnecte
 * qu'ensuite (#350) : l'e-mail lit la préférence et l'adresse du destinataire avant d'envoyer.
 *
 * Une suite à part, sur sa propre app : c'est sa FERMETURE qu'on observe, et celle du harnais
 * partagé ne peut pas servir. Sur la vraie `AppModule` et pas sur une copie de ses imports : rien
 * n'impose cet ordre que Nest — les deux modules sont globaux, détruits dans l'ordre inverse de
 * leur insertion —, et un `@Global` retiré ou un import déplacé l'inverserait sans autre signal.
 */

const RECIPIENT = "arret-destinataire@cmv.test";

/** Le serveur SMTP qui ne répond qu'à la demande du test. */
let answerSmtp: () => void = () => undefined;
const sent: MailMessage[] = [];
const mailServiceDouble = {
  isConfigured: true,
  send: (message: MailMessage) =>
    new Promise<boolean>((resolve) => {
      sent.push(message);
      answerSmtp = () => resolve(true);
    }),
};

let moduleRef: TestingModule;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailServiceDouble)
    .compile();
  await moduleRef.init();
  // Le contrôle des migrations du démarrage lit la base sans être attendu (#212) : fermer avant
  // qu'il ait fini le ferait échouer sur un pool fermé, sans rapport avec ce qu'on vérifie.
  await moduleRef.get(StartupReportService).migrationCheck;
});

afterAll(async () => {
  answerSmtp();
});

describe("Arrêt de l'API — les notifications avant Prisma", () => {
  it("attend l'e-mail en route, puis seulement déconnecte la base", async () => {
    const prisma = moduleRef.get(PrismaService);
    const athlete = await prisma.user.create({
      data: { name: RECIPIENT, email: RECIPIENT, role: "ATHLETE", isAthlete: true },
    });
    await prisma.notificationEmailPreference.create({
      data: { userId: athlete.id, type: NotificationType.INVOICE_ISSUED },
    });

    // Hors contexte tenant : un déclencheur système, la garde anti-auto-notification laisse passer.
    await moduleRef
      .get(NotificationService)
      .notifyInvoiceIssued({ athleteId: athlete.id, invoiceId: "facture-arret" });
    // La préférence et l'adresse sont lues, l'envoi attend le serveur : le compte peut partir,
    // la suite ne laisse rien en base derrière elle.
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await prisma.user.delete({ where: { id: athlete.id } });

    const disconnect = vi.spyOn(prisma, "$disconnect");
    let closed = false;
    const closing = moduleRef.close().then(() => {
      closed = true;
    });
    // Un tour complet de la boucle d'événements : un arrêt qui n'attendrait pas l'e-mail aurait
    // déjà déconnecté la base.
    await new Promise((tick) => setImmediate(tick));
    expect(disconnect).not.toHaveBeenCalled();
    expect(closed).toBe(false);

    answerSmtp();
    await closing;
    expect(disconnect).toHaveBeenCalled();
  });
});
