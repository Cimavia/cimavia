import {
  InvoiceStatus,
  type NotificationEntityType,
  type Prisma,
  type ReminderEntityType,
} from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type ErasureFootprint = {
  /** Factures émises d'un autre Coach : elles restent chez lui, nom figé. */
  retainedInvoiceIds: string[];
  directConversationIds: string[];
  groupConversationIds: string[];
  invitationIds: string[];
  /** Candidates seulement : une clé partagée reste citée ailleurs. */
  objectKeys: string[];
  /** Un `Record` et non une liste : une nouvelle entité ne compile pas sans dire ce qu'il en advient. */
  notices: Record<NotificationEntityType, string[]>;
  reminders: Record<ReminderEntityType, string[]>;
};

const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

const ID_ONLY = { id: true } as const;
const PATH_ONLY = { storagePath: true } as const;
const FILED = { storagePath: { not: null } } as const;

/**
 * Ce que l'effacement doit viser par identifiant : ce qu'aucune cascade n'atteint (notifications,
 * rappels, objets stockés) et ce dont le sort dépend d'une règle (factures, conversations).
 *
 * Une requête par capacité, jamais un `OR` entre elles (règle n°1) : un compte qui est à la fois
 * coach et athlète a deux empreintes, qui s'additionnent.
 */
export async function readErasureFootprint(
  tx: Tx,
  userId: string,
  email: string,
): Promise<ErasureFootprint> {
  const plans = [
    ...(await tx.plan.findMany({ where: { coachId: userId }, select: ID_ONLY })),
    ...(await tx.plan.findMany({ where: { athleteId: userId }, select: ID_ONLY })),
  ];
  const planIds = idsOf(plans);
  const sessions = await tx.scheduledSession.findMany({
    where: { planId: { in: planIds } },
    select: ID_ONLY,
  });
  const invoices = await readInvoices(tx, userId);
  const conversations = await readConversations(tx, userId);
  const invitationIds = await readInvitationIds(tx, userId, email);
  const invoiceIds = [...invoices.leaving.map((invoice) => invoice.id), ...invoices.retainedIds];

  return {
    retainedInvoiceIds: invoices.retainedIds,
    directConversationIds: conversations.direct,
    groupConversationIds: conversations.group,
    invitationIds,
    objectKeys: await readObjectKeys(tx, userId, conversations.direct, invoices.leaving),
    notices: {
      PLAN: planIds,
      SCHEDULED_SESSION: idsOf(sessions),
      INVOICE: invoiceIds,
      // Les groupes aussi : un aperçu y porte le nom de l'expéditeur, et rien d'autre ne l'identifie.
      CONVERSATION: [...conversations.direct, ...conversations.group],
      INVITATION: invitationIds,
    },
    reminders: { PLAN: planIds, INVOICE: invoiceIds },
  };
}

async function readInvoices(tx: Tx, userId: string) {
  const select = { id: true, documentPath: true } as const;
  const leaving = [
    ...(await tx.invoice.findMany({ where: { coachId: userId }, select })),
    ...(await tx.invoice.findMany({
      where: { athleteId: userId, status: InvoiceStatus.DRAFT, coachId: { not: userId } },
      select,
    })),
  ];
  const retained = await tx.invoice.findMany({
    where: { athleteId: userId, status: { not: InvoiceStatus.DRAFT }, coachId: { not: userId } },
    select: ID_ONLY,
  });
  return { leaving, retainedIds: idsOf(retained) };
}

async function readConversations(tx: Tx, userId: string) {
  const participations = await tx.conversationParticipant.findMany({
    where: { userId },
    select: { conversation: { select: { id: true, kind: true } } },
  });
  const ofKind = (kind: "DIRECT" | "GROUP") =>
    participations
      .filter((participation) => participation.conversation.kind === kind)
      .map((participation) => participation.conversation.id);
  return { direct: ofKind("DIRECT"), group: ofKind("GROUP") };
}

async function readInvitationIds(tx: Tx, userId: string, email: string): Promise<string[]> {
  const owned: Prisma.InvitationWhereInput[] = [
    { coachId: userId },
    { organizationId: userId },
    { acceptedById: userId },
  ];
  const ids = new Set<string>();
  for (const where of owned) {
    for (const { id } of await tx.invitation.findMany({ where, select: ID_ONLY })) ids.add(id);
  }
  // Celles adressées à ce compte, reliées par la seule adresse. Recomparées ici : `insensitive`
  // devient un ILIKE, où le `_` d'une adresse est un joker qui viserait l'invitation d'un autre.
  const addressed = await tx.invitation.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const expected = email.toLowerCase();
  for (const row of addressed) if (row.email.toLowerCase() === expected) ids.add(row.id);
  return [...ids];
}

/**
 * Lues depuis les lignes, jamais par préfixe : une clé partagée vit sous le préfixe d'un autre
 * compte, et un préfixe emporterait le fichier d'un Coach qui l'affiche encore.
 */
async function readObjectKeys(
  tx: Tx,
  userId: string,
  directConversationIds: readonly string[],
  leavingInvoices: readonly { documentPath: string | null }[],
): Promise<string[]> {
  const asCoach = { coachId: userId };
  const asAthlete = { athleteId: userId };
  const rows = [
    ...(await tx.exerciseDocument.findMany({ where: { ...asCoach, ...FILED }, select: PATH_ONLY })),
    ...(await tx.scheduledSessionExerciseDocument.findMany({
      where: { ...asCoach, ...FILED },
      select: PATH_ONLY,
    })),
    ...(await tx.scheduledSessionExerciseDocument.findMany({
      where: { ...asAthlete, ...FILED },
      select: PATH_ONLY,
    })),
    ...(await tx.feedbackMedia.findMany({ where: asCoach, select: PATH_ONLY })),
    ...(await tx.feedbackMedia.findMany({ where: asAthlete, select: PATH_ONLY })),
    ...(await tx.message.findMany({
      where: { conversationId: { in: [...directConversationIds] }, ...FILED },
      select: PATH_ONLY,
    })),
    ...(await tx.message.findMany({ where: { senderId: userId, ...FILED }, select: PATH_ONLY })),
  ];
  const paths = [
    ...rows.map((row) => row.storagePath),
    ...leavingInvoices.map((invoice) => invoice.documentPath),
  ];
  return [...new Set(paths.filter((path) => path != null))];
}
