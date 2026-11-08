import { describe, expect, it, vi } from "vitest";
import { AccountErasedMailer } from "./account-erased.mailer";
import type { MailService } from "./mail.service";

function mailerWith() {
  const send = vi.fn().mockResolvedValue(true);
  return { mailer: new AccountErasedMailer({ send } as unknown as MailService), send };
}

describe("AccountErasedMailer", () => {
  it("écrit à l'adresse passée, dans la langue du compte", async () => {
    const { mailer, send } = mailerWith();
    await mailer.send({ to: "a@cmv.test", locale: "en" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@cmv.test",
        subject: "Your Cimavia account has been deleted",
      }),
    );
  });

  it("dit quoi faire si ce n'était pas le titulaire, et replie sur le français", async () => {
    const { mailer, send } = mailerWith();
    await mailer.send({ to: "a@cmv.test", locale: null });
    const message = send.mock.calls[0]?.[0] as { subject: string; text: string };
    expect(message.subject).toBe("Ton compte Cimavia a été supprimé");
    expect(message.text).toContain("contact@cimavia.fr");
  });
});
