import { type InvitationRole, InvitationStatus, normalizeEmail } from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from "@nestjs/common";
import type { Invitation, Prisma } from "@prisma/client";

/**
 * Le cycle de vie d'une invitation, commun à ses deux émetteurs (#601) : un Coach qui invite un
 * athlète (`InvitationService`), une entreprise qui invite un Coach (`OrganizationService`).
 *
 * Écrit une fois parce que les règles sont les mêmes des deux côtés — l'adresse qui fait le verrou
 * (#390), la révocation qui est une transition et pas une suppression (#524), le refus seul qu'on
 * efface (#146). Seuls changent l'émetteur, le rôle proposé et ce que crée l'acceptation.
 */

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/** Durée annoncée dans l'e-mail : dérivée de la constante, jamais réécrite (#20). */
export const INVITATION_TTL_DAYS = INVITATION_TTL_MS / (24 * 60 * 60 * 1000);

/** L'échéance d'une invitation émise maintenant. */
export function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

/**
 * Ce qui attend une adresse dans un rôle : en cours, non expiré. Les mêmes trois critères que
 * `SignupPolicy`, plus le rôle — un athlète ne se voit jamais proposer de devenir Coach, et
 * l'inverse.
 */
export function pendingFor(email: string, role: InvitationRole): Prisma.InvitationWhereInput {
  return {
    email: normalizeEmail(email),
    role,
    status: InvitationStatus.PENDING,
    expiresAt: { gt: new Date() },
  };
}

/**
 * L'invitation que désigne `id`, si elle peut encore être acceptée ou refusée par CETTE session,
 * dans CE rôle.
 *
 * **L'adresse et le rôle se vérifient en premier, et leur échec ne se distingue pas d'un `id`
 * inconnu** (#390). L'`id` n'est pas un secret — il circule dans la carte, dans les notifications
 * —, c'est l'adresse de la session qui fait le verrou. Répondre « expirée » ou « déjà utilisée » à
 * quelqu'un d'autre que le destinataire lui apprendrait le sort d'une invitation qui ne le regarde
 * pas. Le rôle compte comme l'adresse : accepter « en athlète » une invitation de Coach créerait
 * un lien sans Coach.
 *
 * Une invitation RETIRÉE par son émetteur (#524) le dit, et seulement à son destinataire. 410 et
 * non 404 — elle a existé, et elle ne reviendra pas.
 */
export function assertActionable(
  invitation: Invitation | null,
  recipient: { email: string; role: InvitationRole; revokedMessage: string },
): Invitation {
  if (invitation?.email !== normalizeEmail(recipient.email) || invitation.role !== recipient.role) {
    throw new NotFoundException("Invitation introuvable");
  }
  if (invitation.status === InvitationStatus.REVOKED) {
    throw new GoneException(recipient.revokedMessage);
  }
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new NotFoundException("Invitation introuvable ou déjà utilisée");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new BadRequestException("Invitation expirée");
  }
  return invitation;
}

/**
 * Les gestes de l'émetteur, sur le délégué SCOPÉ à lui (client tenant) : l'invitation d'un autre
 * émetteur y est invisible, d'où un 404 et non un 403 — on ne confirme pas l'existence de ce qu'on
 * n'a pas le droit de voir.
 */
type IssuerInvitations = {
  findFirst(args: { where: { id: string } }): Promise<{ status: InvitationStatus } | null>;
  updateMany(args: {
    where: { id: string; status: InvitationStatus };
    data: { status: InvitationStatus };
  }): Promise<{ count: number }>;
  delete(args: { where: { id: string } }): Promise<unknown>;
};

async function findIssued(invitations: IssuerInvitations, id: string) {
  const invitation = await invitations.findFirst({ where: { id } });
  if (invitation == null) {
    throw new NotFoundException("Invitation introuvable");
  }
  return invitation;
}

/**
 * Retire une invitation EN ATTENTE (#524). Une transition et non une suppression : la ligne reste
 * pour que le destinataire qui tenterait encore de l'accepter lise « retirée ». Une invitation
 * EXPIRÉE reste révocable — l'expiration est une date, pas un statut.
 *
 * La condition `status: PENDING` est dans l'écriture elle-même : une acceptation qui passerait
 * entre la lecture et l'écriture ne serait pas réécrite en révocation.
 */
export async function revokePending(invitations: IssuerInvitations, id: string): Promise<void> {
  await findIssued(invitations, id);
  const { count } = await invitations.updateMany({
    where: { id, status: InvitationStatus.PENDING },
    data: { status: InvitationStatus.REVOKED },
  });
  if (count === 0) {
    throw new ConflictException("Seule une invitation en attente peut être retirée");
  }
}

/**
 * Efface une invitation REFUSÉE (#146) — le seul état qui s'efface. Une invitation en attente se
 * révoque, une acceptée est la trace d'un lien, une révoquée doit encore dire « retirée » à son
 * destinataire.
 */
export async function removeDeclined(invitations: IssuerInvitations, id: string): Promise<void> {
  const invitation = await findIssued(invitations, id);
  if (invitation.status !== InvitationStatus.DECLINED) {
    throw new ConflictException("Seule une invitation refusée peut être effacée");
  }
  await invitations.delete({ where: { id } });
}
