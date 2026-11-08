import type request from "supertest";
import { expect } from "vitest";
import type { MailMessage } from "../../src/infra/mail/mail.service";
import { required } from "./required";

// Le jeton du lien que Better Auth construit : `<api>/verify-email?token=<jwt>&callbackURL=…`.
const VERIFY_LINK = /verify-email\?token=([^&\s"]+)/;

/**
 * Le jeton du dernier e-mail de vérification parti vers cette adresse — et l'e-mail retiré de la
 * liste.
 *
 * Le retrait n'est pas une coquetterie : plusieurs suites vident `sentMails`, inscrivent quelqu'un
 * puis affirment qu'AUCUN e-mail n'est parti. L'inscription vérifiée (#270) en envoie un, que ces
 * suites ne regardent pas ; le consommer ici garde leur affirmation vraie, et vraie pour la bonne
 * raison.
 */
export function takeVerificationToken(mails: MailMessage[], email: string): string {
  const to = email.toLowerCase();
  const index = mails.findLastIndex((mail) => mail.to === to && VERIFY_LINK.test(mail.text));
  const mail = required(mails[index], `e-mail de vérification de ${email}`);
  mails.splice(index, 1);
  return required(VERIFY_LINK.exec(mail.text)?.[1], "jeton du lien de vérification");
}

/**
 * Le parcours de l'inscrit après le formulaire : il ouvre le lien reçu, puis se connecte. Depuis
 * #270, c'est la connexion — et non l'inscription — qui donne sa session à l'agent.
 */
export async function verifyAndSignIn(
  agent: ReturnType<typeof request.agent>,
  mails: MailMessage[],
  email: string,
  password: string,
): Promise<void> {
  const token = takeVerificationToken(mails, email);
  const verified = await agent.get(`/api/auth/verify-email?token=${token}`);
  expect(verified.status).toBe(200);
  const signedIn = await agent.post("/api/auth/sign-in/email").send({ email, password });
  expect(signedIn.status).toBe(200);
}
