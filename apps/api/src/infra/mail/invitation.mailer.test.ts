import type { EnvSchema } from "@cmv/shared";
import { Locale } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { InvitationMailer } from "./invitation.mailer";
import { mailCatalog } from "./mail.catalog";
import type { MailMessage, MailService } from "./mail.service";

function mailerWith(webUrl?: string) {
  const send = vi.fn<(message: MailMessage) => Promise<boolean>>(() => Promise.resolve(true));
  const config = { get: () => webUrl } as unknown as ConfigService<EnvSchema, true>;
  return { mailer: new InvitationMailer({ send } as unknown as MailService, config), send };
}

const PARAMS = { to: "invite@example.com", coachName: "Marc Keller", code: "7QK4M2XZ9" };

describe("InvitationMailer", () => {
  /**
   * Le lien pointe sur la route d'inscription du web, barre finale de `WEB_URL` retirée : un
   * `https://app.cimavia.fr//register` passe chez certains serveurs et pas chez d'autres.
   */
  it("envoie le gabarit français, avec le lien d'inscription tiré de WEB_URL", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr/");

    await mailer.send({ ...PARAMS, expiresInDays: 7 });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: "invite@example.com",
      ...mailCatalog(Locale.FR).invitation({
        coachName: "Marc Keller",
        code: "7QK4M2XZ9",
        expiresInDays: 7,
        registerUrl: "https://app.cimavia.fr/register",
      }),
    });
  });

  // Sans WEB_URL, le message part quand même : le code EST le contenu, le lien un raccourci.
  it("envoie le code sans lien quand WEB_URL n'est pas configurée", async () => {
    const { mailer, send } = mailerWith(undefined);

    await mailer.send({ ...PARAMS, coachName: null, expiresInDays: 3 });

    const message = send.mock.calls[0]?.[0];
    expect(message).toEqual({
      to: "invite@example.com",
      ...mailCatalog(Locale.FR).invitation({
        coachName: null,
        code: "7QK4M2XZ9",
        expiresInDays: 3,
        registerUrl: null,
      }),
    });
    expect(message?.html).not.toContain("<a href");
  });
});
