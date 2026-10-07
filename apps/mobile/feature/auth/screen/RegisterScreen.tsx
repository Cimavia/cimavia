import type { AccountType, TrainingCapability } from "@cmv/shared";
import {
  ACCOUNT_TYPES,
  SELECTABLE_CAPABILITIES,
  signUpCapabilities,
  signUpErrorKey,
  toggledCapability,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvText } from "@/shared/component/CmvText";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { landingTab } from "@/shared/lib/tabs";

const TYPE_ICONS: Record<AccountType, ComponentProps<typeof Ionicons>["name"]> = {
  training: "person-outline",
  company: "business-outline",
};

const CHOICE_ON = "border-cmv-accent bg-cmv-accent-soft";
const CHOICE_OFF = "border-cmv-border bg-cmv-surface";

export function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const capabilities = useCapabilities();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Aucun type au départ (#595) : le choix est exclusif et engage le compte pour de bon — une
  // entreprise ne deviendra jamais coach —, il ne se présélectionne donc pas.
  const [type, setType] = useState<AccountType | null>(null);
  const [selected, setSelected] = useState<Set<TrainingCapability>>(new Set(["athlete"]));
  // À part de `error` : la maquette le place sous les cases, et il s'efface dès qu'on en coche une.
  const [noCapability, setNoCapability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session != null) {
    // Destination DÉRIVÉE de la capacité, comme sur l'écran d'entrée : `/planning` en dur
    // envoyait un coach sur `GET /me/plans`, qui est `@Roles([ATHLETE])`.
    return <Redirect href={landingTab(capabilities)} />;
  }

  const chosen = ACCOUNT_TYPES.find((option) => option.type === type);

  async function onSubmit() {
    if (type == null) return;
    // Garde côté client EN PLUS de celle de l'API (400) : un compte sans capacité se retrouverait
    // devant une application vide, et le dire ici évite un aller-retour pour l'apprendre.
    const signUp = signUpCapabilities(type, selected);
    if (signUp == null) {
      setNoCapability(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        ...signUp,
      });
      if (signUpError != null) {
        setError(t(signUpErrorKey(signUpError.status)));
        return;
      }
      // Le seul point de passage OBLIGÉ d'un changement de compte : une session expirée ramène
      // ici sans qu'aucune déconnexion soit passée, et le cache du précédent serait resservi.
      await resetAccountData();
      // AUCUNE navigation ici : c'est la garde de session en tête de ce composant qui aiguille,
      // une fois la session RÉSOLUE, vers l'onglet que la capacité autorise. Un `replace` en dur
      // partait avant elle et sur une route athlète — un compte dont la session n'avait pas encore
      // repris se voyait alors refuser `/planning` par `redirectForPath`, qui le déposait sur le
      // premier onglet sans capacité (Messages) avec une barre amputée de la moitié de ses
      // entrées. Le commentaire de la garde disait déjà pourquoi `/planning` en dur est faux.
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  const capabilityBoxes = (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {SELECTABLE_CAPABILITIES.map(({ name: capability, labelKey }) => {
          const checked = selected.has(capability);
          return (
            <Pressable
              key={capability}
              onPress={() => {
                setSelected(toggledCapability(selected, capability));
                setNoCapability(false);
              }}
              // Case à cocher et non bouton : ce sont deux choix INDÉPENDANTS, et VoiceOver doit
              // l'annoncer ainsi — sans quoi rien ne dit qu'on peut cocher les deux.
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={t(labelKey)}
              className={`flex-1 flex-row items-center gap-2 rounded-lg border px-3 py-3 ${checked ? CHOICE_ON : CHOICE_OFF}`}
            >
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={18}
                color={checked ? cmvColors.accent.DEFAULT : cmvColors.border.hi}
              />
              <CmvText className={checked ? "text-cmv-text-hi" : "text-cmv-text-mid"}>
                {t(labelKey)}
              </CmvText>
            </Pressable>
          );
        })}
      </View>
      {noCapability && (
        <CmvText className="text-cmv-error text-sm">{t("auth.errors.noCapability")}</CmvText>
      )}
    </View>
  );

  return (
    <ScrollView
      className="flex-1 bg-cmv-bg-0"
      contentContainerClassName="grow justify-center gap-4 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-2 gap-1">
        <CmvText className="font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("auth.register.title")}
        </CmvText>
        <CmvText className="text-cmv-text-lo">{t("auth.register.lead")}</CmvText>
      </View>
      {ACCOUNT_TYPES.map((option) => {
        const checked = option.type === type;
        return (
          <View key={option.type} className="gap-3">
            <Pressable
              onPress={() => setType(option.type)}
              // Bouton radio : les deux cartes sont EXCLUSIVES, ce que des cases ne diraient pas.
              // Le titre nomme la carte, l'explication la décrit — lus d'un seul tenant sinon.
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={t(option.labelKey)}
              accessibilityHint={t(option.hintKey)}
              className={`flex-row items-start gap-3 rounded-xl border p-4 ${checked ? CHOICE_ON : CHOICE_OFF}`}
            >
              <Ionicons
                name={TYPE_ICONS[option.type]}
                size={24}
                color={checked ? cmvColors.accent.on : cmvColors.text.lo}
              />
              <View className="flex-1 gap-1">
                <CmvText className="font-cmv-heading text-cmv-subtitle text-cmv-text-hi">
                  {t(option.labelKey)}
                </CmvText>
                <CmvText className="text-cmv-text-mid text-xs">{t(option.hintKey)}</CmvText>
              </View>
              <Ionicons
                name={checked ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={checked ? cmvColors.accent.DEFAULT : cmvColors.border.hi}
              />
            </Pressable>
            {/* Sur mobile, les cases s'insèrent sous la carte choisie, avant « Entreprise ». */}
            {checked && option.type === "training" && capabilityBoxes}
          </View>
        );
      })}
      {/* Le reste n'apparaît qu'une fois le type choisi : c'est lui qui nomme le champ « nom ».
          Les valeurs vivent dans l'écran, pas dans les champs : changer de carte les garde. */}
      {chosen != null && (
        <>
          <CmvTextField
            label={t(chosen.nameLabelKey)}
            value={name}
            onChangeText={setName}
            autoComplete={chosen.type === "training" ? "name" : undefined}
          />
          <CmvTextField
            label={t("common.email")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <CmvTextField
            label={t("common.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          {error != null && <CmvText className="text-cmv-error">{error}</CmvText>}
          <CmvButton
            label={submitting ? t("auth.register.submitting") : t("auth.register.submit")}
            onPress={onSubmit}
            disabled={submitting}
          />
        </>
      )}
      <Pressable onPress={() => router.push("/login")} className="items-center py-2">
        <CmvText className="font-semibold text-cmv-accent">{t("auth.register.toLogin")}</CmvText>
      </Pressable>
    </ScrollView>
  );
}
