import { type CoachAthleteDto, directConversationWith, splitFollows } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { accountApi } from "@/feature/coach/api";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useMyCoaches, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { useConversations } from "@/feature/message/hook/useMessages";
import { AppShell } from "@/feature/shell";
import {
  CMV_TABLE,
  CmvArchiveList,
  CmvAvatar,
  CmvCard,
  CmvConfirmButton,
  CmvErrorState,
} from "@/shared/component";
import { useEndFollow } from "@/shared/hook/useEndFollow";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { authClient } from "@/shared/lib/auth";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values coach.table.columns: COACH_COLUMNS

const COACH_COLUMNS = ["coach", "origin", "since"] as const;

/**
 * L'en-tête et les lignes partagent leur grille — sinon les intitulés se décalent du contenu. Deux
 * colonnes d'action, le fil puis le départ : armé, le départ passe sur sa propre rangée, en pleine
 * largeur, pour dire ce qu'il engage (#910).
 */
const GRID = "grid grid-cols-[2fr_2fr_1fr_auto_auto] items-center gap-cmv-lg";

/**
 * « Mes coachs » côté web (#28, #599) — équivalent de `JoinCoachScreen` sur mobile. Un athlète est
 * suivi par 0..N coachs : une ligne par coach, chacune avec son fil ; sans coach, l'adresse à
 * laquelle un coach doit l'inviter.
 *
 * Il n'y a plus de code à saisir (#390) : une invitation vise une adresse, et n'apparaît qu'au
 * compte qui la porte. L'acceptation passe par la carte de l'invitation, et par elle seule.
 *
 * Les invitations en attente se posent AU-DESSUS (#146), coach ou pas. Elles sont toutes
 * acceptables depuis #599 : être déjà suivi n'empêche plus d'en rejoindre un autre.
 *
 * Chaque lien dit d'où il vient (#602, maquette entreprise, frame 9) : « via F » quand une
 * entreprise l'a créé, rien quand il est direct.
 *
 * L'athlète quitte un coach depuis sa ligne (#910). Les coachs quittés — ou qui ont mis fin au
 * suivi — passent dans « Anciens coachs », replié sous le tableau : leur fil se relit. Sans coach
 * en cours, la carte « pas de coach » revient, l'archive dessous.
 */
export function MyCoachesScreen() {
  const { t } = useTranslation();
  const { data: coaches, isPending, isError, refetch } = useMyCoaches();

  return (
    <AppShell title={t("coach.title")} subtitle={t("coach.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Panne réseau et « pas de coach » sont deux choses différentes : dire « aucun coach » sur
          une API injoignable inquiéterait un athlète qui en a déjà. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {coaches == null ? null : (
        <div className="flex flex-col gap-cmv-lg">
          <PendingInvitations />
          <Follows coaches={coaches} />
        </div>
      )}
    </AppShell>
  );
}

/**
 * Ce qui attend l'athlète, s'il y a quelque chose — et rien du tout sinon.
 *
 * **Une requête en échec ne s'annonce pas comme une liste vide** : dans les deux cas on ne rend
 * rien, mais on n'écrit jamais « aucune invitation » sur une API injoignable. L'absence
 * d'invitation est le cas ORDINAIRE : un bandeau d'erreur pour ça inquiéterait sans rien apprendre.
 */
function PendingInvitations() {
  const { data: invitations } = useMyInvitations();
  if (invitations == null || invitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-cmv-md">
      {invitations.map((invitation) => (
        <PendingInvitationCard key={invitation.id} invitation={invitation} />
      ))}
    </div>
  );
}

/** Les suivis en cours, puis l'archive de ceux qui ont pris fin (#910). */
function Follows({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { ongoing, ended } = splitFollows(coaches);
  return (
    <>
      {ongoing.length === 0 ? <NoCoachCard /> : <CoachTable coaches={ongoing} />}
      <FormerCoaches coaches={ended} />
    </>
  );
}

/**
 * Les anciens coachs, le plus récent d'abord : leur fil se relit par son id — la messagerie n'ouvre
 * `?coach=` que vers un coach encore suivi. Sans fil, rien à relire, pas de bouton.
 */
function FormerCoaches({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { t } = useTranslation();
  const endedText = useFollowEndedText();
  const { data: conversations } = useConversations({ poll: false });

  const items = coaches.map((coach) => {
    const thread = directConversationWith(conversations, coach.coachId, "coach");
    return {
      id: coach.id,
      name: coach.coachName,
      detail: endedText(coach.endedAt),
      actions:
        thread == null ? null : (
          <Link
            to="/messages"
            search={{
              athlete: undefined,
              coach: undefined,
              conversation: thread.id,
              as: "athlete",
              q: undefined,
            }}
            className={MESSAGE_LINK}
          >
            {t("follow.archive.thread")}
          </Link>
        ),
    };
  });

  return (
    <CmvArchiveList title={t("follow.archive.coaches", { count: coaches.length })} items={items} />
  );
}

/** Les coachs de l'athlète, chacun avec son fil (#599), et l'adresse qui en amène un autre. */
function CoachTable({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-md">
      <div className={cn(CMV_TABLE.frame, "overflow-x-auto bg-cmv-surface")}>
        <div className="min-w-[40rem]">
          <div className={cn(GRID, CMV_TABLE.head, CMV_TABLE.headBorder, "px-cmv-lg py-cmv-sm")}>
            {COACH_COLUMNS.map((column) => (
              <span key={column} className={CMV_TABLE.headLabel}>
                {t(`coach.table.columns.${column}`)}
              </span>
            ))}
            {/* Les colonnes des boutons n'ont pas d'intitulé : « Message » et « Quitter » se lisent
                sur les boutons. */}
            <span />
            <span />
          </div>

          {coaches.map((coach) => (
            <CoachRow key={coach.id} coach={coach} />
          ))}
        </div>
      </div>

      <Address description={t("coach.more.description")} />
    </div>
  );
}

function CoachRow({ coach }: Readonly<{ coach: CoachAthleteDto }>) {
  const { t } = useTranslation();
  const leave = useEndFollow("athlete", accountApi);

  return (
    <div className={cn(GRID, CMV_TABLE.row, "px-cmv-lg py-cmv-md")}>
      <span className="flex items-center gap-cmv-sm">
        <CmvAvatar name={coach.coachName} />
        <span className="text-cmv-text-hi">{coach.coachName}</span>
      </span>

      {/* `null` = lien direct, « aucune entreprise » et non une donnée manquante : la cellule reste
          vide, sans « — » (écart consigné au README des maquettes). */}
      <span className="text-cmv-text-mid">
        {coach.organizationName == null
          ? null
          : t("coach.table.via", { name: coach.organizationName })}
      </span>

      {/* `joinedAt` est nullable (la relation peut avoir été posée sans passer par une
          acceptation) : « — » plutôt qu'une date inventée. */}
      <span className="text-cmv-text-mid">
        {coach.joinedAt == null ? "—" : formatInstantDate(coach.joinedAt)}
      </span>

      <Link
        to="/messages"
        // `?coach=` : le fil avec CE coach, parmi les siens. Les autres clés sont REQUISES mais
        // peuvent valoir undefined (cf. la route). `as` : c'est un écran d'athlète, le fil s'ouvre
        // donc à ce titre.
        search={{
          athlete: undefined,
          coach: coach.coachId,
          conversation: undefined,
          as: "athlete",
          q: undefined,
        }}
        aria-label={t("coach.linked.messageTo", { name: coach.coachName })}
        className={MESSAGE_LINK}
      >
        {t("coach.linked.message")}
      </Link>

      {/* Les seuls liens à rompre : ni l'auto-coaching (absent de cette liste), ni un suivi terminé
          (rangé dans l'archive). Armé, il prend sa rangée pour dire ce qui reste et ce qui cesse. */}
      <CmvConfirmButton
        label={t("follow.end.athlete.action")}
        confirmLabel={t("follow.end.athlete.confirm")}
        cancelLabel={t("common.cancel")}
        confirmHint={t("follow.end.athlete.hint", { name: coach.coachName })}
        disabled={leave.isPending}
        onConfirm={() => leave.mutate(coach.coachId)}
        armedClassName="col-span-full justify-end"
      />
    </div>
  );
}

const MESSAGE_LINK =
  "inline-flex items-center rounded-cmv-md border border-cmv-border px-cmv-lg py-cmv-sm text-cmv-body text-cmv-text-mid transition-colors hover:border-cmv-border-hi hover:text-cmv-text-hi";

/**
 * L'athlète n'a pas de coach : on lui dit à quelle adresse son coach doit l'inviter (#390).
 *
 * C'est le seul recours qui reste à une invitation partie vers une autre adresse : sans code à
 * saisir, un compte créé avec une autre adresse ne verrait jamais la carte, et rien ne lui dirait
 * pourquoi.
 */
function NoCoachCard() {
  const { t } = useTranslation();

  return (
    <CmvCard>
      <div className="flex max-w-md flex-col gap-cmv-xs">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("coach.missing.title")}</h2>
        <Address description={t("coach.missing.description")} />
      </div>
    </CmvCard>
  );
}

/** L'adresse que l'athlète donne à un coach pour qu'il l'invite — avec ou sans coach déjà. */
function Address({ description }: Readonly<{ description: string }>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  return (
    <div className="flex flex-col gap-cmv-xs">
      <p className="text-cmv-body text-cmv-text-mid">{description}</p>
      <p className="mt-cmv-sm text-cmv-caption text-cmv-text-lo">{t("coach.missing.address")}</p>
      {/* Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5). */}
      <p className="text-cmv-body text-cmv-text-hi">{session?.user.email ?? "—"}</p>
    </div>
  );
}
