import type { EnvSchema } from "@cmv/shared";
import { Locale, NotificationType } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { mailCatalog } from "./mail.catalog";
import type { MailMessage, MailService } from "./mail.service";
import { NotificationMailer } from "./notification.mailer";

function mailerWith(webUrl?: string) {
  const send = vi.fn<(message: MailMessage) => Promise<boolean>>(() => Promise.resolve(true));
  const config = {
    get: () => webUrl,
  } as unknown as ConfigService<EnvSchema, true>;
  return { mailer: new NotificationMailer({ send } as unknown as MailService, config), send };
}

const RECIPIENT = { email: "athlete@example.com", locale: Locale.FR };

describe("NotificationMailer", () => {
  it("compose le message dans la langue du destinataire", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr");
    await mailer.send(
      NotificationType.PLAN_PUBLISHED,
      { ...RECIPIENT, locale: Locale.EN },
      { actorName: null, subjectLabel: "Force block" },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "athlete@example.com",
        subject: mailCatalog(Locale.EN).notification(NotificationType.PLAN_PUBLISHED, {
          actorName: null,
          subjectLabel: "Force block",
          settingsUrl: null,
        }).subject,
      }),
    );
  });

  // `User.locale` est un `String` en base : le service reçoit ce que la base contient.
  it("replie sur le français pour une langue inconnue", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr");
    await mailer.send(
      NotificationType.INVOICE_ISSUED,
      { email: "a@b.fr", locale: "es" },
      { actorName: null, subjectLabel: null },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: mailCatalog(Locale.FR).notification(NotificationType.INVOICE_ISSUED, {
          actorName: null,
          subjectLabel: null,
          settingsUrl: null,
        }).subject,
      }),
    );
  });

  /**
   * `/account` et non `/settings` : c'est la route du compte côté web, où #66 pose les réglages.
   * Le premier jet inventait `/settings`, qui n'existe pas — un lien mort qu'aucun test de ce
   * côté-ci ne pouvait voir, puisque l'API ne connaît pas le routeur du client.
   *
   * La barre oblique finale est retirée au passage : `WEB_URL` est copiée à la main, et
   * `//account` ne résoudrait pas.
   */
  it("pointe vers la page compte du web, sans doubler la barre oblique", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr/");
    await mailer.send(NotificationType.MESSAGE_RECEIVED, RECIPIENT, {
      actorName: "Léa",
      subjectLabel: null,
    });

    expect(send.mock.calls[0]?.[0].text).toContain("https://app.cimavia.fr/account");
  });

  /**
   * Sans `WEB_URL`, le message part quand même — sans pied. C'est le comportement voulu : un
   * e-mail sans porte de sortie reste préférable à pas d'e-mail, et l'absence de la variable est
   * un réglage de production oublié, pas une raison de taire une notification.
   */
  it("envoie sans pied de page quand l'url web n'est pas configurée", async () => {
    const { mailer, send } = mailerWith(undefined);
    await mailer.send(NotificationType.MESSAGE_RECEIVED, RECIPIENT, {
      actorName: "Léa",
      subjectLabel: null,
    });

    expect(send).toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].html).not.toContain("<a href");
  });
});
