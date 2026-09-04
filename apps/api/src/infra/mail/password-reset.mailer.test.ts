import { Locale, RESET_PASSWORD_TOKEN_TTL_HOURS } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { en } from "./locale/en";
import { fr } from "./locale/fr";
import type { MailMessage, MailService } from "./mail.service";
import { PasswordResetMailer } from "./password-reset.mailer";

const URL = "https://app.cimavia.fr/reset-password?token=abc&callbackURL=%2F";

// `MailService` ne lève jamais (c'est son contrat, éprouvé par son propre test) : le double se
// contente donc de rendre le booléen d'envoi, sans cas de rejet — le simuler ferait affirmer ce
// test sur une défense que le mailer n'a pas à porter.
function mailerWithSpy(sent = true) {
  const send = vi.fn<(message: MailMessage) => Promise<boolean>>(() => Promise.resolve(sent));
  return { mailer: new PasswordResetMailer({ send } as unknown as MailService), send };
}

describe("PasswordResetMailer", () => {
  it("compose le message dans la langue du compte", async () => {
    const { mailer, send } = mailerWithSpy();
    await mailer.send({ to: "coach@example.com", locale: Locale.EN, url: URL });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "coach@example.com", subject: en.resetPassword.subject }),
    );
  });

  // `User.locale` est un `String` en base, pas un enum Prisma : le service reçoit ce que la base
  // contient, y compris une valeur qu'aucune version du produit n'a jamais posée.
  it.each([[null], ["es"]])("replie sur le français pour la langue %p", async (locale) => {
    const { mailer, send } = mailerWithSpy();
    await mailer.send({ to: "coach@example.com", locale, url: URL });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: fr.resetPassword.subject }),
    );
  });

  // La durée annoncée doit être celle que Better Auth applique vraiment — d'où la constante
  // partagée, lue des deux côtés plutôt que réécrite dans le texte.
  it("annonce la durée de validité réellement configurée", async () => {
    const { mailer, send } = mailerWithSpy();
    await mailer.send({ to: "coach@example.com", locale: Locale.FR, url: URL });

    const message = send.mock.calls[0]?.[0];
    expect(message?.text).toContain(fr.resetPassword.expiry(RESET_PASSWORD_TOKEN_TTL_HOURS));
  });

  it("porte le lien dans les deux corps", async () => {
    const { mailer, send } = mailerWithSpy();
    await mailer.send({ to: "coach@example.com", locale: Locale.FR, url: URL });

    const message = send.mock.calls[0]?.[0];
    expect(message?.text).toContain(URL);
    expect(message?.html).toContain("token=abc&amp;callbackURL");
  });

  /**
   * Le contrat qui compte : un envoi impossible ne remonte jamais à Better Auth. Sans quoi la
   * demande de réinitialisation deviendrait un 500 — et sa réponse, différente de celle d'une
   * adresse inconnue, révélerait l'existence du compte.
   */
  it("reste muet quand le smtp n'est pas configuré", async () => {
    const { mailer } = mailerWithSpy(false);
    await expect(
      mailer.send({ to: "coach@example.com", locale: Locale.FR, url: URL }),
    ).resolves.toBeUndefined();
  });
});
