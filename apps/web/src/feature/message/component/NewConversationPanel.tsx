import {
  type CandidateRow,
  type ConversationCandidatesDto,
  candidateCaption,
  candidateRows,
  coachSectionTitle,
  filterCandidates,
  isSameParticipant,
  joinNames,
  type ParticipantRef,
  selectedCandidates,
  selectionWarnings,
  singleOrganizationName,
  type TrainingCapability,
  toggleParticipant,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateConversation } from "@/feature/message/hook/useMessages";
import {
  CmvAvatar,
  CmvButton,
  CmvCheckmark,
  CmvPanel,
  CmvTextField,
  CmvToggleChip,
} from "@/shared/component";

type NewConversationPanelProps = {
  as: TrainingCapability;
  candidates: ConversationCandidatesDto;
  onClose: () => void;
  /** La conversation créée, ou celle qui réunissait déjà ces participants (#611). */
  onOpened: (conversationId: string) => void;
};

/**
 * « Nouvelle conversation » (#612, planches A2 et B2) : cocher un ou plusieurs participants, puis
 * créer. L'API rouvre la conversation qui réunit déjà exactement ces participants — à deux comme
 * à plusieurs —, et le panneau ouvre ce qu'elle rend : il n'a pas à le deviner.
 *
 * Monté à l'ouverture et démonté à la fermeture par l'écran : la sélection repart de zéro à chaque
 * fois, sans remise à zéro à écrire.
 *
 * Côté Coach, la recherche et les deux avertissements, cumulables (tranché en #598 : prévenir
 * plutôt qu'interdire). Côté athlète, ses Coachs seuls — l'API n'en propose pas d'autre.
 */
export function NewConversationPanel({
  as,
  candidates,
  onClose,
  onOpened,
}: Readonly<NewConversationPanelProps>) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ParticipantRef[]>([]);
  const [search, setSearch] = useState("");
  const create = useCreateConversation();

  const isCoach = as === "coach";
  const shown = filterCandidates(candidates, search);
  const warnings = selectionWarnings(candidates, selection);
  const toggle = (ref: ParticipantRef) =>
    setSelection((current) => toggleParticipant(current, ref));

  const rows = candidateRows(shown);
  const captionOf = (row: CandidateRow) => candidateCaption(row, isCoach, t);

  const submit = () =>
    create.mutate({ participants: selection }, { onSuccess: (opened) => onOpened(opened.id) });

  return (
    <CmvPanel
      open
      title={t("messages.new.title")}
      description={t(isCoach ? "messages.new.coachDescription" : "messages.new.athleteDescription")}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center gap-cmv-sm">
          <p className="flex-1 text-cmv-caption text-cmv-text-lo">{t("messages.new.fixed")}</p>
          <CmvButton variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton disabled={selection.length === 0 || create.isPending} onClick={submit}>
            {t("messages.new.create")}
          </CmvButton>
        </div>
      }
    >
      <div className="flex flex-col gap-cmv-lg">
        {isCoach ? (
          <CmvTextField
            label={t("messages.new.searchLabel")}
            name="participantSearch"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("messages.new.searchPlaceholder")}
          />
        ) : null}

        {isCoach && selection.length > 0 ? (
          <section className="flex flex-col gap-cmv-xs">
            <h3 className="text-cmv-caption text-cmv-text-mid">{t("messages.new.chosen")}</h3>
            <div className="flex flex-wrap gap-cmv-xs">
              {selectedCandidates(candidates, selection).map((chosen) => (
                <CmvToggleChip
                  key={`${chosen.capability}:${chosen.userId}`}
                  pressed
                  onToggle={() => toggle(chosen)}
                >
                  {chosen.name}
                </CmvToggleChip>
              ))}
            </div>
          </section>
        ) : null}

        <SelectionWarningList warnings={warnings} />

        {rows.athletes.length === 0 && rows.coaches.length === 0 ? (
          <p className="text-cmv-caption text-cmv-text-mid">{t("messages.new.noResult")}</p>
        ) : null}

        <CandidateSection
          title={t("messages.new.athletes")}
          rows={rows.athletes}
          captionOf={captionOf}
          selection={selection}
          onToggle={toggle}
        />
        <CandidateSection
          title={coachSectionTitle(isCoach, singleOrganizationName(candidates), t)}
          rows={rows.coaches}
          captionOf={captionOf}
          selection={selection}
          onToggle={toggle}
        />
      </div>
    </CmvPanel>
  );
}

function SelectionWarningList({
  warnings,
}: Readonly<{ warnings: ReturnType<typeof selectionWarnings> }>) {
  const { t } = useTranslation();
  if (!warnings.athletesSeeEachOther && warnings.unfollowed.length === 0) return null;

  return (
    <output className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-warning-line bg-cmv-warning-soft p-cmv-md text-cmv-caption text-cmv-warning-on">
      {warnings.athletesSeeEachOther ? <p>{t("messages.new.athletesWarning")}</p> : null}
      {warnings.unfollowed.map((warning) => (
        <p key={warning.coachId}>
          {t("messages.new.unfollowedWarning", {
            count: warning.athleteNames.length,
            coach: warning.coachName,
            athletes: joinNames(warning.athleteNames, t("messages.new.nor")),
          })}
        </p>
      ))}
    </output>
  );
}

function CandidateSection({
  title,
  rows,
  captionOf,
  selection,
  onToggle,
}: Readonly<{
  title: string;
  rows: readonly CandidateRow[];
  captionOf: (row: CandidateRow) => string;
  selection: readonly ParticipantRef[];
  onToggle: (ref: ParticipantRef) => void;
}>) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-cmv-xs">
      <h3 className="text-cmv-caption text-cmv-text-mid">{title}</h3>
      {rows.map((row) => {
        const ref = { userId: row.userId, capability: row.capability };
        const checked = selection.some((chosen) => isSameParticipant(chosen, ref));
        return (
          <button
            key={`${row.capability}:${row.userId}`}
            type="button"
            aria-pressed={checked}
            onClick={() => onToggle(ref)}
            className="flex items-center gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi"
          >
            <CmvCheckmark checked={checked} />
            <CmvAvatar name={row.name} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-cmv-body text-cmv-text-hi">{row.name}</span>
              <span className="truncate text-cmv-caption text-cmv-text-lo">{captionOf(row)}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
