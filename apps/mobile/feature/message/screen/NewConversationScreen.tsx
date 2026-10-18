import {
  type CandidateRow,
  candidateCaption,
  candidateRows,
  coachSectionTitle,
  filterCandidates,
  isSameParticipant,
  joinNames,
  type ParticipantRef,
  type SelectionWarnings,
  selectedCandidates,
  selectionWarnings,
  singleOrganizationName,
  toggleParticipant,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  useConversationCandidates,
  useCreateConversation,
} from "@/feature/message/hook/useConversation";
import { CmvAvatar, CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";

/**
 * « Nouvelle conversation » (#612, planche M2) : cocher un ou plusieurs participants, puis créer.
 * L'API rouvre la conversation qui réunit déjà exactement ces participants — à deux comme à
 * plusieurs —, et l'écran ouvre ce qu'elle rend : il n'a pas à le deviner.
 *
 * Côté Coach, la recherche et les deux avertissements cumulables, comme au web (tranché en #598 :
 * prévenir plutôt qu'interdire). La planche ne montrait que l'athlète ; le Coach crée aussi depuis
 * son téléphone (écart tranché en #598).
 */
export function NewConversationScreen() {
  const { t } = useTranslation();
  const as = useActingCapability();
  const candidates = useConversationCandidates();
  const create = useCreateConversation();
  const [selection, setSelection] = useState<ParticipantRef[]>([]);
  const [search, setSearch] = useState("");

  const isCoach = as === "coach";
  const toggle = (ref: ParticipantRef) =>
    setSelection((current) => toggleParticipant(current, ref));
  // `replace` : revenir du fil créé ramène à la liste, pas à un sélecteur déjà servi.
  const submit = () =>
    create.mutate(
      { participants: selection },
      { onSuccess: (opened) => router.replace(`/messages/${opened.id}`) },
    );

  return (
    <CmvScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View className="flex-row items-center gap-3 border-cmv-border border-b px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            className="rounded-lg border border-cmv-border bg-cmv-surface p-2"
          >
            <Ionicons name="chevron-back" size={18} color={cmvColors.text.hi} />
          </Pressable>
          <CmvText className="flex-1 font-cmv-display text-cmv-text-hi" numberOfLines={1}>
            {t("messages.newConversation")}
          </CmvText>
        </View>

        {candidates.isPending ? <ActivityIndicator className="p-6" /> : null}
        {candidates.isError ? (
          <View className="p-4">
            <CmvErrorState onRetry={() => candidates.refetch()} />
          </View>
        ) : null}

        {candidates.data == null ? null : (
          <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
            <CmvText className="text-cmv-text-mid text-sm">
              {t(isCoach ? "messages.new.coachDescription" : "messages.new.athleteDescription")}
            </CmvText>

            {isCoach ? (
              <CmvTextField
                label={t("messages.new.searchLabel")}
                value={search}
                onChangeText={setSearch}
                placeholder={t("messages.new.searchPlaceholder")}
                autoCapitalize="none"
              />
            ) : null}

            {isCoach && selection.length > 0 ? (
              <View className="gap-2">
                <CmvText className="text-cmv-text-mid text-xs">{t("messages.new.chosen")}</CmvText>
                <View className="flex-row flex-wrap gap-2">
                  {selectedCandidates(candidates.data, selection).map((chosen) => (
                    <Pressable
                      key={`${chosen.capability}:${chosen.userId}`}
                      onPress={() => toggle(chosen)}
                      accessibilityRole="button"
                      className="flex-row items-center gap-1 rounded-full border border-cmv-accent-line bg-cmv-accent-soft px-3 py-1"
                    >
                      <CmvText className="text-cmv-accent-on text-xs">{chosen.name}</CmvText>
                      <Ionicons name="close" size={12} color={cmvColors.accent.on} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <WarningCard warnings={selectionWarnings(candidates.data, selection)} />

            <CandidateSections
              isCoach={isCoach}
              rows={candidateRows(filterCandidates(candidates.data, search))}
              organization={singleOrganizationName(candidates.data)}
              selection={selection}
              onToggle={toggle}
            />
          </ScrollView>
        )}

        <View className="gap-2 border-cmv-border border-t p-4">
          {create.isError ? (
            <CmvText className="text-cmv-error text-sm">{t("messages.new.createError")}</CmvText>
          ) : null}
          <CmvText className="text-cmv-text-lo text-xs">{t("messages.new.fixed")}</CmvText>
          <CmvButton
            label={t("messages.new.create")}
            onPress={submit}
            disabled={selection.length === 0 || create.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </CmvScreen>
  );
}

function WarningCard({ warnings }: Readonly<{ warnings: SelectionWarnings }>) {
  const { t } = useTranslation();
  if (!warnings.athletesSeeEachOther && warnings.unfollowed.length === 0) return null;

  return (
    <View className="gap-1 rounded-lg border border-cmv-warning-line bg-cmv-warning-soft p-3">
      {warnings.athletesSeeEachOther ? (
        <CmvText className="text-cmv-warning-on text-xs">
          {t("messages.new.athletesWarning")}
        </CmvText>
      ) : null}
      {warnings.unfollowed.map((warning) => (
        <CmvText key={warning.coachId} className="text-cmv-warning-on text-xs">
          {t("messages.new.unfollowedWarning", {
            count: warning.athleteNames.length,
            coach: warning.coachName,
            athletes: joinNames(warning.athleteNames, t("messages.new.nor")),
          })}
        </CmvText>
      ))}
    </View>
  );
}

function CandidateSections({
  isCoach,
  rows,
  organization,
  selection,
  onToggle,
}: Readonly<{
  isCoach: boolean;
  rows: { athletes: CandidateRow[]; coaches: CandidateRow[] };
  organization: string | null;
  selection: readonly ParticipantRef[];
  onToggle: (ref: ParticipantRef) => void;
}>) {
  const { t } = useTranslation();

  if (rows.athletes.length === 0 && rows.coaches.length === 0) {
    return <CmvText className="text-cmv-text-mid text-sm">{t("messages.new.noResult")}</CmvText>;
  }

  return (
    <>
      {[
        { title: t("messages.new.athletes"), section: rows.athletes },
        { title: coachSectionTitle(isCoach, organization, t), section: rows.coaches },
      ].map(({ title, section }) =>
        section.length === 0 ? null : (
          <View key={title} className="gap-2">
            <CmvText className="text-cmv-text-mid text-xs">{title}</CmvText>
            {section.map((row) => {
              const ref = { userId: row.userId, capability: row.capability };
              const checked = selection.some((chosen) => isSameParticipant(chosen, ref));
              return (
                <Pressable
                  key={`${row.capability}:${row.userId}`}
                  onPress={() => onToggle(ref)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? cmvColors.accent.DEFAULT : cmvColors.text.lo}
                  />
                  <CmvAvatar name={row.name} />
                  <View className="flex-1 gap-1">
                    <CmvText className="text-cmv-text-hi" numberOfLines={1}>
                      {row.name}
                    </CmvText>
                    <CmvText className="text-cmv-text-lo text-xs" numberOfLines={1}>
                      {candidateCaption(row, isCoach, t)}
                    </CmvText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ),
      )}
    </>
  );
}
