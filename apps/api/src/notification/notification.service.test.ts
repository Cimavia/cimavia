import { NotificationType } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { Expo, type ExpoPushTicket } from "expo-server-sdk";
import type { ClsService } from "nestjs-cls";
import type { PinoLogger } from "nestjs-pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationMailer } from "../infra/mail/notification.mailer";
import type { PrismaService } from "../infra/prisma/prisma.service";
import { NotificationService } from "./notification.service";

/**
 * Ce que les e2e ne peuvent pas montrer : ils tournent sans appareil enregistré (le push s'arrête
 * à « aucun token ») et sur une base qui répond. Ici, Expo est intercepté au niveau du SDK — son
 * découpage en lots reste le vrai — et chaque dépendance peut tomber séparément, pour vérifier la
 * règle du service : aucun canal n'empêche les autres, aucun n'empêche l'action métier.
 */

const VALID = "ExponentPushToken[appareil-valide]";
const OTHER = "ExponentPushToken[autre-appareil]";

type Setup = {
  tokens?: { id: string; token: string }[];
  tickets?: ExpoPushTicket[];
  userName?: string | null;
  failing?: { persist?: boolean; userName?: boolean; push?: boolean; mail?: boolean };
  emailWanted?: boolean;
  recipient?: { email: string; locale: string } | null;
};

function serviceWith(setup: Setup = {}) {
  const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const failing = setup.failing ?? {};
  const create = vi.fn(() =>
    failing.persist ? Promise.reject(new Error("base injoignable")) : Promise.resolve({}),
  );
  const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const findUnique = vi.fn((args: { select: Record<string, boolean> }) => {
    if (args.select.name) {
      if (failing.userName) return Promise.reject(new Error("lecture impossible"));
      return Promise.resolve(setup.userName === null ? null : { name: setup.userName ?? "Noa" });
    }
    return Promise.resolve(setup.recipient === undefined ? null : setup.recipient);
  });
  const prisma = {
    notification: { create },
    pushToken: {
      findMany: () => Promise.resolve(setup.tokens ?? []),
      deleteMany,
    },
    user: { findUnique },
    notificationEmailPreference: {
      findFirst: () => Promise.resolve(setup.emailWanted ? { id: "pref_1" } : null),
    },
  } as unknown as PrismaService;
  const send = vi.fn(() =>
    failing.mail ? Promise.reject(new Error("smtp injoignable")) : Promise.resolve(true),
  );
  const sendPush = vi
    .spyOn(Expo.prototype, "sendPushNotificationsAsync")
    .mockImplementation((chunk) =>
      failing.push
        ? Promise.reject(new Error("exp.host injoignable"))
        : Promise.resolve(setup.tickets ?? chunk.map(() => ({ status: "ok", id: "tkt" }) as const)),
    );

  const service = new NotificationService(
    logger as unknown as PinoLogger,
    prisma,
    { get: () => undefined } as unknown as ClsService,
    { send } as unknown as NotificationMailer,
    { get: () => undefined } as unknown as ConfigService<never, true>,
  );
  return { service, logger, create, deleteMany, send, sendPush };
}

const FEEDBACK = {
  coachId: "coach_1",
  athleteId: "ath_1",
  scheduledSessionId: "ss_1",
  sessionTitle: "Bloc force",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotificationService — push", () => {
  it("pousse aux seuls tokens Expo valides, avec le contenu et la route d'ouverture", async () => {
    const { service, sendPush } = serviceWith({
      tokens: [
        { id: "tok_1", token: VALID },
        { id: "tok_2", token: "pas-un-token-expo" },
      ],
    });

    await service.notifyFeedbackReceived(FEEDBACK);

    expect(sendPush).toHaveBeenCalledExactlyOnceWith([
      {
        to: VALID,
        sound: "default",
        title: "Nouveau débrief",
        body: "Noa a débriefé « Bloc force ».",
        data: { type: NotificationType.FEEDBACK_RECEIVED, scheduledSessionId: "ss_1" },
      },
    ]);
  });

  // Compte web-only, ou tokens tous périmés : rien à livrer, et surtout pas un appel à Expo.
  it("n'appelle pas Expo quand aucun token n'est valide", async () => {
    const { service, sendPush, create } = serviceWith({
      tokens: [{ id: "tok_1", token: "invalide" }],
    });

    await service.notifyFeedbackReceived(FEEDBACK);

    expect(sendPush).not.toHaveBeenCalled();
    // La trace, elle, est écrite : c'est le cas même qu'elle rattrape.
    expect(create).toHaveBeenCalledTimes(1);
  });

  /**
   * Expo demande de cesser d'écrire à un appareil désinscrit : on purge sa ligne. Les autres
   * refus (message trop gros, credentials FCM absentes) se journalisent sans purge — l'appareil
   * existe, c'est l'envoi qui a échoué.
   */
  it("purge le seul token désinscrit, journalise tous les refus par id", async () => {
    const { service, deleteMany, logger } = serviceWith({
      tokens: [
        { id: "tok_gone", token: VALID },
        { id: "tok_big", token: OTHER },
      ],
      tickets: [
        { status: "error", message: "désinscrit", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "trop gros", details: { error: "MessageTooBig" } },
      ],
    });

    await service.notifyReminderDue({ coachId: "coach_1", reminderId: "rem_1", label: "Relancer" });

    expect(deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ["tok_gone"] } } });
    expect(logger.error).toHaveBeenCalledWith(
      {
        userId: "coach_1",
        failures: [
          { tokenId: "tok_gone", error: "DeviceNotRegistered", message: "désinscrit" },
          { tokenId: "tok_big", error: "MessageTooBig", message: "trop gros" },
        ],
      },
      "Notifications push refusées par Expo",
    );
    // L'adresse de l'appareil ne part pas dans les logs : l'id suffit.
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(VALID);
  });

  it("journalise un refus sans détail, sans rien purger", async () => {
    const { service, deleteMany, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      tickets: [{ status: "error", message: "refusé" }],
    });

    await service.notifyReminderDue({ coachId: "coach_1", reminderId: "rem_1", label: "Relancer" });

    expect(logger.error).toHaveBeenCalledWith(
      { userId: "coach_1", failures: [{ tokenId: "tok_1", error: null, message: "refusé" }] },
      "Notifications push refusées par Expo",
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("ne journalise ni ne purge rien quand Expo accepte tout", async () => {
    const { service, deleteMany, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
    });

    await service.notifyReminderDue({ coachId: "coach_1", reminderId: "rem_1", label: "Relancer" });

    expect(logger.error).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  /**
   * Le rappel dû est poussé SANS ligne en base : elle ferait apparaître le rappel deux fois dans
   * le centre, qui le calcule déjà depuis la table `reminder` (#51).
   */
  it("pousse un rappel dû sans écrire de notification", async () => {
    const { service, sendPush, create } = serviceWith({ tokens: [{ id: "tok_1", token: VALID }] });

    await service.notifyReminderDue({ coachId: "coach_1", reminderId: "rem_1", label: "Relancer" });

    expect(create).not.toHaveBeenCalled();
    expect(sendPush).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        title: "Rappel",
        body: "Relancer",
        data: { type: NotificationType.REMINDER_DUE, reminderId: "rem_1" },
      }),
    ]);
  });
});

describe("NotificationService — chaque canal dégrade seul", () => {
  it("Expo injoignable : la trace et l'e-mail partent quand même, rien ne remonte", async () => {
    const { service, create, send, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      failing: { push: true },
      emailWanted: true,
      recipient: { email: "coach@cmv.test", locale: "fr" },
    });

    await expect(service.notifyFeedbackReceived(FEEDBACK)).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "coach_1" }),
      "Échec d'envoi de la notification push",
    );
  });

  it("écriture impossible : le push part quand même, rien ne remonte", async () => {
    const { service, sendPush, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      failing: { persist: true },
    });

    await expect(service.notifyFeedbackReceived(FEEDBACK)).resolves.toBeUndefined();

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "coach_1", type: NotificationType.FEEDBACK_RECEIVED }),
      "Échec d'enregistrement de la notification",
    );
  });

  // Dernier canal : son échec n'a plus rien à empêcher, mais il ne doit ni remonter ni se taire.
  it("envoi d'e-mail impossible : journalisé, la trace et le push sont déjà partis", async () => {
    const { service, create, sendPush, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      failing: { mail: true },
      emailWanted: true,
      recipient: { email: "coach@cmv.test", locale: "fr" },
    });

    await expect(service.notifyFeedbackReceived(FEEDBACK)).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        recipientId: "coach_1",
        type: NotificationType.FEEDBACK_RECEIVED,
      }),
      "Échec de l'envoi de la notification par e-mail",
    );
  });

  // Le destinataire a pu être supprimé entre-temps : pas d'adresse, pas d'e-mail — et pas d'erreur.
  it("n'envoie pas d'e-mail à un destinataire introuvable", async () => {
    const { service, send, logger } = serviceWith({ emailWanted: true, recipient: null });

    await service.notifyFeedbackReceived(FEEDBACK);

    expect(send).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

/**
 * Le nom de l'acteur manque (compte supprimé, lecture en échec) : le push garde une formule
 * générique au lieu de « null a débriefé », et la trace le dit `null` — le centre traduira sa
 * propre formule. La lecture en échec est journalisée, et n'empêche rien.
 */
describe("NotificationService — acteur sans nom", () => {
  const cases = [
    {
      name: "débrief reçu",
      emit: (service: NotificationService) => service.notifyFeedbackReceived(FEEDBACK),
      title: "Nouveau débrief",
      body: "Un de tes athlètes a débriefé « Bloc force ».",
    },
    {
      name: "message reçu",
      emit: (service: NotificationService) =>
        service.notifyMessageReceived({
          recipientId: "coach_1",
          senderId: "ath_1",
          conversationId: "conv_1",
        }),
      title: "Nouveau message",
      body: "Tu as reçu un nouveau message.",
    },
    {
      name: "invitation reçue",
      emit: (service: NotificationService) =>
        service.notifyInvitationReceived({
          athleteId: "coach_1",
          coachId: "other",
          invitationId: "inv_1",
        }),
      title: "Invitation",
      body: "Un coach t'invite à rejoindre son espace.",
    },
    {
      name: "invitation acceptée",
      emit: (service: NotificationService) =>
        service.notifyInvitationAccepted({
          coachId: "coach_1",
          athleteId: "ath_1",
          invitationId: "inv_1",
        }),
      title: "Invitation acceptée",
      body: "Un athlète a rejoint ton espace.",
    },
    {
      name: "invitation refusée",
      emit: (service: NotificationService) =>
        service.notifyInvitationDeclined({
          coachId: "coach_1",
          athleteId: "ath_1",
          invitationId: "inv_1",
        }),
      title: "Invitation refusée",
      body: "Un athlète a refusé ton invitation.",
    },
  ];

  it.each(cases)("$name : formule générique quand le compte est introuvable", async (c) => {
    const { service, sendPush, create } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      userName: null,
    });

    await c.emit(service);

    expect(sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ title: c.title, body: c.body }),
    ]);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorName: null }) });
  });

  it("lecture du nom en échec : journalisée, et la notification part quand même", async () => {
    const { service, sendPush, logger } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      failing: { userName: true },
    });

    await service.notifyFeedbackReceived(FEEDBACK);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "ath_1" }),
      "Résolution du nom de l'acteur impossible",
    );
    expect(sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ body: "Un de tes athlètes a débriefé « Bloc force »." }),
    ]);
  });
});
