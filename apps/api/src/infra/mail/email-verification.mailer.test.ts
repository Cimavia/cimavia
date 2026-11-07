import type { EnvSchema } from "@cmv/shared";
import { EMAIL_VERIFICATION_TOKEN_TTL_HOURS, Locale } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { EmailVerificationMailer } from "./email-verification.mailer";
import { en } from "./locale/en";
import { fr } from "./locale/fr";
import { mailCatalog } from "./mail.catalog";
import type { MailMessage, MailService } from "./mail.service";

// Le lien tel que Better Auth le construit, `callbackURL` par défaut compris : une page de l'API.
const BETTER_AUTH_URL =
  "https://api.cimavia.fr/api/auth/verify-email?token=abc.def&callbackURL=%2F";

function mailerWith(webUrl?: string, sent = true) {
  const send = vi.fn<(message: MailMessage) => Promise<boolean>>(() => Promise.resolve(sent));
  const config = { get: () => webUrl } as unknown as ConfigService<EnvSchema, true>;
  return { mailer: new EmailVerificationMailer({ send } as unknown as MailService, config), send };
}

describe("EmailVerificationMailer — lien de vérification", () => {
  /**
   * Le jeton reste intact, seule la page d'arrivée change : celle que l'API désigne, pas celle
   * qu'un client a envoyée. Barre finale de `WEB_URL` retirée, comme pour l'invitation.
   */
  it("ramène le lien sur la page web de vérification, jeton intact", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr/");

    await mailer.sendVerification({
      to: "lea@example.com",
      locale: Locale.FR,
      url: BETTER_AUTH_URL,
    });

    const link = new URL(
      "https://api.cimavia.fr/api/auth/verify-email?token=abc.def&callbackURL=https%3A%2F%2Fapp.cimavia.fr%2Fverify-email",
    ).toString();
    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: "lea@example.com",
      ...mailCatalog(Locale.FR).verifyEmail({
        url: link,
        expiresInHours: EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
      }),
    });
  });

  // Sans WEB_URL, le lien vérifie quand même l'adresse : seule la page d'arrivée manque.
  it("garde le lien de Better Auth quand WEB_URL n'est pas configurée", async () => {
    const { mailer, send } = mailerWith(undefined);

    await mailer.sendVerification({ to: "lea@example.com", locale: null, url: BETTER_AUTH_URL });

    const message = send.mock.calls[0]?.[0];
    expect(message?.subject).toBe(fr.verifyEmail.subject);
    expect(message?.text).toContain(BETTER_AUTH_URL);
  });

  it("écrit dans la langue du compte et annonce la durée réellement configurée", async () => {
    const { mailer, send } = mailerWith(undefined);

    await mailer.sendVerification({
      to: "lea@example.com",
      locale: Locale.EN,
      url: BETTER_AUTH_URL,
    });

    const message = send.mock.calls[0]?.[0];
    expect(message?.subject).toBe(en.verifyEmail.subject);
    expect(message?.text).toContain(en.common.linkExpiry(EMAIL_VERIFICATION_TOKEN_TTL_HOURS));
  });

  // Le contrat qui compte : un envoi impossible ne transforme pas l'inscription en 500.
  it("reste muet quand le smtp n'est pas configuré", async () => {
    const { mailer } = mailerWith(undefined, false);
    await expect(
      mailer.sendVerification({ to: "lea@example.com", locale: null, url: BETTER_AUTH_URL }),
    ).resolves.toBeUndefined();
  });
});

describe("EmailVerificationMailer — adresse déjà inscrite", () => {
  it("prévient le propriétaire, avec le lien de connexion tiré de WEB_URL", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr");

    await mailer.sendExistingAccount({
      to: "lea@example.com",
      locale: Locale.FR,
      verified: true,
    });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: "lea@example.com",
      ...mailCatalog(Locale.FR).existingAccount({ loginUrl: "https://app.cimavia.fr/login" }),
    });
  });

  it("envoie la consigne sans lien quand WEB_URL n'est pas configurée", async () => {
    const { mailer, send } = mailerWith(undefined);

    await mailer.sendExistingAccount({
      to: "lea@example.com",
      locale: Locale.EN,
      verified: true,
    });

    const message = send.mock.calls[0]?.[0];
    expect(message?.subject).toBe(en.existingAccount.subject);
    expect(message?.text).toContain(en.existingAccount.hint);
    expect(message?.html).not.toContain("<a ");
  });

  /**
   * Compte jamais confirmé : son mot de passe vient d'être effacé, « connecte-toi » serait faux.
   * Le propriétaire est mené au choix d'un mot de passe, qui confirmera l'adresse.
   */
  it("mène au choix d'un mot de passe quand le compte n'a jamais été confirmé", async () => {
    const { mailer, send } = mailerWith("https://app.cimavia.fr/");

    await mailer.sendExistingAccount({ to: "lea@example.com", locale: Locale.FR, verified: false });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: "lea@example.com",
      ...mailCatalog(Locale.FR).pendingAccount({
        forgotPasswordUrl: "https://app.cimavia.fr/forgot-password",
      }),
    });
  });
});
