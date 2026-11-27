import type { PersistedNotificationType } from "@cmv/shared";
import { NotificationEntityType, NotificationType } from "@cmv/shared";
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
  /** Un nom par compte, quand il faut distinguer l'acteur du sujet ; sinon `userName` pour tous. */
  names?: Record<string, string>;
  failing?: { persist?: boolean; userName?: boolean; push?: boolean; mail?: boolean };
  emailWanted?: boolean;
  recipient?: { email: string; locale: string } | null;
  /** L'acteur de la requête, quand il y en a un — pour la garde anti-auto-notification. */
  actorId?: string;
};

function serviceWith(setup: Setup = {}) {
  const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const failing = setup.failing ?? {};
  const create = vi.fn(() =>
    failing.persist ? Promise.reject(new Error("base injoignable")) : Promise.resolve({}),
  );
  const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const findUnique = vi.fn((args: { where: { id: string }; select: Record<string, boolean> }) => {
    if (args.select.name) {
      if (failing.userName) return Promise.reject(new Error("lecture impossible"));
      if (setup.names) return Promise.resolve({ name: setup.names[args.where.id] ?? null });
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
    {
      get: () => (setup.actorId === undefined ? undefined : { userId: setup.actorId }),
    } as unknown as ClsService,
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
    await service.settled();

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
    await service.settled();

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

/**
 * Ce que chaque émetteur écrit, au caractère près : la ligne du centre et le push. Les deux portent
 * le même `type` et la même cible, écrits une seule fois (#351) — et la clé d'id du push est
 * HISTORIQUE : une app déjà installée lit `planId` ou `scheduledSessionId`, la renommer casserait
 * sa navigation. Un `null` en trace : l'émetteur pousse sans laisser de ligne.
 */
describe("NotificationService — ce que chaque émetteur écrit", () => {
  const NAMES = { ath_1: "Noa", coach_2: "Camille", org_1: "Club Altitude" };
  const PLAN_SESSION = { athleteId: "ath_1", planId: "plan_1", sessionTitle: "Bloc force" };
  const INVITATION = { coachId: "coach_2", athleteId: "ath_1", invitationId: "inv_1" };
  const toAthlete = (type: PersistedNotificationType, subjectLabel: string | null) => ({
    recipientId: "ath_1",
    type,
    entityType: NotificationEntityType.PLAN,
    entityId: "plan_1",
    actorName: null,
    subjectLabel,
  });
  const invitationTo = (
    recipientId: string,
    type: PersistedNotificationType,
    actorName: string,
    subjectLabel: string | null = null,
  ) => ({
    recipientId,
    type,
    entityType: NotificationEntityType.INVITATION,
    entityId: "inv_1",
    actorName,
    subjectLabel,
  });

  const cases: {
    name: string;
    emit: (service: NotificationService) => Promise<void>;
    trace: Record<string, unknown> | null;
    push: { title: string; body: string; data: Record<string, string> };
  }[] = [
    {
      name: "cycle diffusé",
      emit: (s) =>
        s.notifyPlanPublished({ athleteId: "ath_1", planId: "plan_1", planTitle: "Cycle hiver" }),
      trace: toAthlete(NotificationType.PLAN_PUBLISHED, "Cycle hiver"),
      push: {
        title: "Nouvelle planification",
        body: "Ton coach a diffusé « Cycle hiver ».",
        data: { type: NotificationType.PLAN_PUBLISHED, planId: "plan_1" },
      },
    },
    {
      name: "séance modifiée",
      emit: (s) => s.notifyPlanUpdated(PLAN_SESSION),
      trace: toAthlete(NotificationType.PLAN_UPDATED, "Bloc force"),
      push: {
        title: "Séance modifiée",
        body: "Ton coach a ajusté « Bloc force ».",
        data: { type: NotificationType.PLAN_UPDATED, planId: "plan_1" },
      },
    },
    {
      name: "journée réordonnée",
      emit: (s) =>
        s.notifyPlanSessionsReordered({
          athleteId: "ath_1",
          planId: "plan_1",
          isoDate: "2026-11-19",
        }),
      trace: toAthlete(NotificationType.PLAN_SESSIONS_REORDERED, "2026-11-19"),
      push: {
        title: "Séances réordonnées",
        body: "Ton coach a changé l'ordre de tes séances de la journée.",
        data: { type: NotificationType.PLAN_SESSIONS_REORDERED, planId: "plan_1" },
      },
    },
    {
      name: "séance ajoutée",
      emit: (s) => s.notifyPlanSessionAdded(PLAN_SESSION),
      trace: toAthlete(NotificationType.PLAN_SESSION_ADDED, "Bloc force"),
      push: {
        title: "Séance ajoutée",
        body: "Ton coach a ajouté « Bloc force » à ton cycle.",
        data: { type: NotificationType.PLAN_SESSION_ADDED, planId: "plan_1" },
      },
    },
    {
      name: "séance retirée",
      emit: (s) => s.notifyPlanSessionRemoved(PLAN_SESSION),
      trace: toAthlete(NotificationType.PLAN_SESSION_REMOVED, "Bloc force"),
      push: {
        title: "Séance retirée",
        body: "Ton coach a retiré « Bloc force » de ton cycle.",
        data: { type: NotificationType.PLAN_SESSION_REMOVED, planId: "plan_1" },
      },
    },
    {
      name: "débrief reçu",
      emit: (s) => s.notifyFeedbackReceived(FEEDBACK),
      trace: {
        recipientId: "coach_1",
        type: NotificationType.FEEDBACK_RECEIVED,
        entityType: NotificationEntityType.SCHEDULED_SESSION,
        entityId: "ss_1",
        actorName: "Noa",
        subjectLabel: "Bloc force",
      },
      push: {
        title: "Nouveau débrief",
        body: "Noa a débriefé « Bloc force ».",
        data: { type: NotificationType.FEEDBACK_RECEIVED, scheduledSessionId: "ss_1" },
      },
    },
    {
      name: "débrief complété",
      emit: (s) => s.notifyFeedbackCompleted(FEEDBACK),
      trace: null,
      push: {
        title: "Débrief complété",
        body: "Noa a complété son débrief de « Bloc force ».",
        data: { type: NotificationType.FEEDBACK_RECEIVED, scheduledSessionId: "ss_1" },
      },
    },
    {
      name: "message reçu",
      emit: (s) =>
        s.notifyMessageReceived(
          { recipientId: "coach_1", senderId: "ath_1", conversationId: "conv_1" },
          { push: true, trace: true },
        ),
      trace: {
        recipientId: "coach_1",
        type: NotificationType.MESSAGE_RECEIVED,
        entityType: NotificationEntityType.CONVERSATION,
        entityId: "conv_1",
        actorName: "Noa",
        subjectLabel: null,
      },
      push: {
        title: "Noa",
        body: "Tu as reçu un nouveau message.",
        data: { type: NotificationType.MESSAGE_RECEIVED, conversationId: "conv_1" },
      },
    },
    {
      name: "facture émise",
      emit: (s) => s.notifyInvoiceIssued({ athleteId: "ath_1", invoiceId: "invoice_1" }),
      trace: {
        recipientId: "ath_1",
        type: NotificationType.INVOICE_ISSUED,
        entityType: NotificationEntityType.INVOICE,
        entityId: "invoice_1",
        actorName: null,
        subjectLabel: null,
      },
      push: {
        title: "Nouvelle facture",
        body: "Ton coach t'a émis une facture.",
        data: { type: NotificationType.INVOICE_ISSUED, invoiceId: "invoice_1" },
      },
    },
    {
      name: "invitation reçue",
      emit: (s) =>
        s.notifyInvitationReceived({
          athleteId: "ath_1",
          inviterId: "coach_2",
          invitationId: "inv_1",
        }),
      trace: invitationTo("ath_1", NotificationType.INVITATION_RECEIVED, "Camille"),
      push: {
        title: "Invitation",
        body: "Camille t'invite à rejoindre son espace.",
        data: { type: NotificationType.INVITATION_RECEIVED, invitationId: "inv_1" },
      },
    },
    {
      name: "invitation d'une entreprise",
      emit: (s) =>
        s.notifyOrganizationInvitationReceived({
          coachId: "coach_2",
          organizationId: "org_1",
          invitationId: "inv_1",
        }),
      trace: invitationTo(
        "coach_2",
        NotificationType.ORGANIZATION_INVITATION_RECEIVED,
        "Club Altitude",
      ),
      push: {
        title: "Invitation",
        body: "Club Altitude t'invite à rejoindre son équipe.",
        data: { type: NotificationType.ORGANIZATION_INVITATION_RECEIVED, invitationId: "inv_1" },
      },
    },
    {
      name: "coach arrivé par l'entreprise",
      emit: (s) =>
        s.notifyOrganizationCoachJoined({
          athleteId: "ath_1",
          coachId: "coach_2",
          organizationId: "org_1",
          invitationId: "inv_1",
        }),
      trace: invitationTo(
        "ath_1",
        NotificationType.ORGANIZATION_COACH_JOINED,
        "Camille",
        "Club Altitude",
      ),
      push: {
        title: "Nouveau coach",
        body: "Camille te suit désormais, via Club Altitude.",
        data: { type: NotificationType.ORGANIZATION_COACH_JOINED, invitationId: "inv_1" },
      },
    },
    {
      name: "suivi terminé par le coach",
      emit: (s) =>
        s.notifyRelationEnded({
          relationId: "rel_1",
          coachId: "coach_2",
          athleteId: "ath_1",
          endedBy: "coach",
        }),
      trace: {
        recipientId: "ath_1",
        type: NotificationType.RELATION_ENDED_BY_COACH,
        entityType: NotificationEntityType.COACH_ATHLETE,
        entityId: "rel_1",
        actorName: "Camille",
        subjectLabel: null,
      },
      push: {
        title: "Suivi terminé",
        body: "Camille a mis fin à ton suivi.",
        data: { type: NotificationType.RELATION_ENDED_BY_COACH, relationId: "rel_1" },
      },
    },
    {
      name: "suivi quitté par l'athlète",
      emit: (s) =>
        s.notifyRelationEnded({
          relationId: "rel_1",
          coachId: "coach_2",
          athleteId: "ath_1",
          endedBy: "athlete",
        }),
      trace: {
        recipientId: "coach_2",
        type: NotificationType.RELATION_ENDED_BY_ATHLETE,
        entityType: NotificationEntityType.COACH_ATHLETE,
        entityId: "rel_1",
        actorName: "Noa",
        subjectLabel: null,
      },
      push: {
        title: "Suivi terminé",
        body: "Noa a quitté ton espace.",
        data: { type: NotificationType.RELATION_ENDED_BY_ATHLETE, relationId: "rel_1" },
      },
    },
    {
      name: "invitation acceptée",
      emit: (s) => s.notifyInvitationAccepted(INVITATION),
      trace: invitationTo("coach_2", NotificationType.INVITATION_ACCEPTED, "Noa"),
      push: {
        title: "Invitation acceptée",
        body: "Noa a rejoint ton espace.",
        data: { type: NotificationType.INVITATION_ACCEPTED, invitationId: "inv_1" },
      },
    },
    {
      name: "invitation refusée",
      emit: (s) => s.notifyInvitationDeclined(INVITATION),
      trace: invitationTo("coach_2", NotificationType.INVITATION_DECLINED, "Noa"),
      push: {
        title: "Invitation refusée",
        body: "Noa a refusé ton invitation.",
        data: { type: NotificationType.INVITATION_DECLINED, invitationId: "inv_1" },
      },
    },
    {
      name: "rappel dû",
      emit: (s) =>
        s.notifyReminderDue({ coachId: "coach_1", reminderId: "rem_1", label: "Relancer" }),
      trace: null,
      push: {
        title: "Rappel",
        body: "Relancer",
        data: { type: NotificationType.REMINDER_DUE, reminderId: "rem_1" },
      },
    },
  ];

  it.each(cases)("$name : la trace et le push, exacts", async (c) => {
    const { service, create, sendPush } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      names: NAMES,
    });

    await c.emit(service);
    await service.settled();

    if (c.trace == null) expect(create).not.toHaveBeenCalled();
    else expect(create).toHaveBeenCalledExactlyOnceWith({ data: c.trace });
    expect(sendPush).toHaveBeenCalledExactlyOnceWith([{ to: VALID, sound: "default", ...c.push }]);
  });
});

/**
 * Le push et la trace ne suivent pas le même rythme (#537) : un push par envoi, une entrée de
 * centre et un e-mail par série. Ce qui est vérifié ici, c'est qu'un canal retenu l'est vraiment —
 * et que la garde anti-auto-notification passe avant tous.
 */
describe("NotificationService — canaux", () => {
  const MESSAGE = { recipientId: "coach_1", senderId: "ath_1", conversationId: "conv_1" };

  function withEverything(actorId?: string) {
    return serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      emailWanted: true,
      recipient: { email: "coach@cmv.test", locale: "fr" },
      ...(actorId === undefined ? {} : { actorId }),
    });
  }

  it("pousse sans trace : ni entrée de centre, ni e-mail", async () => {
    const { service, create, send, sendPush } = withEverything();

    await service.notifyMessageReceived(MESSAGE, { push: true, trace: false });
    await service.settled();

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  // La suite d'un lot de médias qui ouvre pourtant une série : la trace part, le téléphone se tait.
  it("laisse une trace sans pousser", async () => {
    const { service, create, send, sendPush } = withEverything();

    await service.notifyMessageReceived(MESSAGE, { push: false, trace: true });
    await service.settled();

    expect(sendPush).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("notifie un complément de débrief par push seul, vers la même destination", async () => {
    const { service, create, send, sendPush } = withEverything();

    await service.notifyFeedbackCompleted(FEEDBACK);
    await service.settled();

    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(sendPush).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        title: "Débrief complété",
        body: "Noa a complété son débrief de « Bloc force ».",
        data: { type: NotificationType.FEEDBACK_RECEIVED, scheduledSessionId: "ss_1" },
      }),
    ]);
  });

  // #14 : en auto-coaching, le coach complète son propre débrief — le push seul ne l'en dispense pas.
  it("ne pousse pas vers soi-même, même sans trace", async () => {
    const { service, sendPush } = withEverything("coach_1");

    await service.notifyFeedbackCompleted(FEEDBACK);
    await service.settled();

    expect(sendPush).not.toHaveBeenCalled();
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
    await service.settled();

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
    await service.settled();

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
    await service.settled();

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
    await service.settled();

    expect(send).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

/** Une réponse qu'Expo ou le serveur SMTP ne donne que quand le test le décide. */
function pending<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * La requête métier n'attend que la trace (#350). Un fournisseur qui ne répond plus tenait la
 * requête des minutes durant : le message était enregistré, le client voyait une erreur et le
 * renvoyait. Ici Expo et le serveur SMTP ne répondent qu'à la demande du test.
 */
describe("NotificationService — la requête n'attend que la trace", () => {
  function withSilentProviders() {
    const setup = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      emailWanted: true,
      recipient: { email: "coach@cmv.test", locale: "fr" },
    });
    const expo = pending<ExpoPushTicket[]>();
    const smtp = pending<boolean>();
    setup.sendPush.mockReturnValue(expo.promise);
    setup.send.mockReturnValue(smtp.promise);
    const answer = () => {
      expo.resolve([{ status: "ok", id: "tkt" }]);
      smtp.resolve(true);
    };
    return { ...setup, answer };
  }

  it("rend la main la trace écrite, push et e-mail encore en route", async () => {
    const { service, create, send, sendPush, answer } = withSilentProviders();

    await service.notifyFeedbackReceived(FEEDBACK);

    expect(create).toHaveBeenCalledTimes(1);
    // Partis tous les deux, aucun n'a répondu : c'est la requête qu'on n'a pas fait attendre.
    await vi.waitFor(() => expect(sendPush).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    answer();
    await service.settled();
  });

  // Un redémarrage de l'API ne coupe pas ce qui est en route : l'arrêt attend la fin des envois.
  it("l'arrêt du module attend les envois encore en route", async () => {
    const { service, send, answer } = withSilentProviders();
    await service.notifyFeedbackReceived(FEEDBACK);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    let stopped = false;
    const stopping = service.onModuleDestroy().then(() => {
      stopped = true;
    });
    // Un tour complet de la boucle d'événements : un arrêt qui n'attendrait rien aurait abouti.
    await new Promise((tick) => setImmediate(tick));
    expect(stopped).toBe(false);

    answer();
    await stopping;
    expect(stopped).toBe(true);
  });

  /**
   * Plus personne n'attend un envoi parti après la réponse : s'il lève malgré son `try`, le rejet
   * deviendrait une `unhandledRejection`. Provoqué ici par le journal lui-même, qui casse dans le
   * `catch` de l'e-mail — le seul endroit de ce canal qui ne soit pas déjà sous garde.
   */
  it("un envoi qui lève malgré tout est journalisé, et l'attente aboutit", async () => {
    const { service, logger } = serviceWith({
      failing: { mail: true },
      emailWanted: true,
      recipient: { email: "coach@cmv.test", locale: "fr" },
    });
    logger.error.mockImplementationOnce(() => {
      throw new Error("journal indisponible");
    });

    await service.notifyFeedbackReceived(FEEDBACK);
    await expect(service.settled()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenLastCalledWith(
      { err: expect.objectContaining({ message: "journal indisponible" }) },
      "Échec d'une notification partie après la réponse",
    );
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
        service.notifyMessageReceived(
          {
            recipientId: "coach_1",
            senderId: "ath_1",
            conversationId: "conv_1",
          },
          { push: true, trace: true },
        ),
      title: "Nouveau message",
      body: "Tu as reçu un nouveau message.",
    },
    {
      name: "invitation reçue",
      emit: (service: NotificationService) =>
        service.notifyInvitationReceived({
          athleteId: "coach_1",
          inviterId: "other",
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
    {
      name: "invitation d'une entreprise",
      emit: (service: NotificationService) =>
        service.notifyOrganizationInvitationReceived({
          coachId: "coach_1",
          organizationId: "org_1",
          invitationId: "inv_1",
        }),
      title: "Invitation",
      body: "Une entreprise t'invite à rejoindre son équipe.",
    },
    {
      name: "coach arrivé par l'entreprise",
      emit: (service: NotificationService) =>
        service.notifyOrganizationCoachJoined({
          athleteId: "coach_1",
          coachId: "other",
          organizationId: "org_1",
          invitationId: "inv_1",
        }),
      title: "Nouveau coach",
      body: "Un coach te suit désormais, via ton entreprise.",
    },
    {
      name: "suivi terminé par le coach",
      emit: (service: NotificationService) =>
        service.notifyRelationEnded({
          relationId: "rel_1",
          coachId: "other",
          athleteId: "coach_1",
          endedBy: "coach",
        }),
      title: "Suivi terminé",
      body: "Ton coach a mis fin à ton suivi.",
    },
    {
      name: "suivi quitté par l'athlète",
      emit: (service: NotificationService) =>
        service.notifyRelationEnded({
          relationId: "rel_1",
          coachId: "coach_1",
          athleteId: "other",
          endedBy: "athlete",
        }),
      title: "Suivi terminé",
      body: "Un athlète a quitté ton espace.",
    },
  ];

  it.each(cases)("$name : formule générique quand le compte est introuvable", async (c) => {
    const { service, sendPush, create } = serviceWith({
      tokens: [{ id: "tok_1", token: VALID }],
      userName: null,
    });

    await c.emit(service);
    await service.settled();

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
    await service.settled();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "ath_1" }),
      "Résolution du nom de l'acteur impossible",
    );
    expect(sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ body: "Un de tes athlètes a débriefé « Bloc force »." }),
    ]);
  });
});
