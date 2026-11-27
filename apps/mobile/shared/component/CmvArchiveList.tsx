import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { CmvAvatar } from "./CmvAvatar";
import { CmvText } from "./CmvText";

/** Ce qui se fait encore d'une ligne d'archive : relire, jamais écrire. */
export type CmvArchiveAction = { label: string; onPress: () => void };

export type CmvArchiveItem = {
  id: string;
  name: string;
  /** Ce que l'archive dit de la ligne, déjà traduit : « Suivi terminé le 20 nov. 2026 ». */
  detail: string;
  actions: readonly CmvArchiveAction[];
};

type CmvArchiveListProps = {
  /** L'intitulé du repli, compte compris : « Suivis terminés (2) ». */
  title: string;
  items: readonly CmvArchiveItem[];
  /**
   * Ce qui se dit en tête de l'archive dépliée, au-dessus des lignes : la panne d'une lecture dont
   * dépendent leurs actions. Sans elle, une action absente ne se distingue pas d'un fil jamais écrit.
   */
  notice?: ReactNode;
};

/**
 * Les suivis terminés (#909, #911), rangés sous ceux en cours : une archive à relire, repliée par
 * défaut — le pendant du `CmvArchiveList` web (#910). Elle ne disparaît pas — l'historique du couple
 * reste à chacun (tranché en #213) — mais ne prend pas la place du travail en cours, qu'on ouvre
 * l'écran pour faire.
 *
 * Les actions sont des boutons discrets, sous l'identité : posés à côté du nom, ils l'écraseraient
 * sur un écran de téléphone. Rien sans ligne : une archive vide n'a rien à annoncer.
 */
export function CmvArchiveList({ title, items, notice }: Readonly<CmvArchiveListProps>) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-1 self-start py-1"
      >
        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={14}
          color={cmvColors.text.mid}
        />
        <CmvText className="text-cmv-text-mid text-xs uppercase">{title}</CmvText>
      </Pressable>

      {open ? (
        <View className="gap-3">
          {notice}
          {items.map((item) => (
            <View
              key={item.id}
              className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
            >
              <View className="flex-row items-center gap-3">
                <CmvAvatar name={item.name} />
                <View className="flex-1 gap-1">
                  <CmvText className="text-cmv-text-mid" numberOfLines={1}>
                    {item.name}
                  </CmvText>
                  <CmvText className="text-cmv-text-lo text-xs">{item.detail}</CmvText>
                </View>
              </View>
              {item.actions.length === 0 ? null : (
                <View className="flex-row flex-wrap gap-2">
                  {item.actions.map((action) => (
                    <Pressable
                      key={action.label}
                      accessibilityRole="button"
                      onPress={action.onPress}
                      className="rounded-lg border border-cmv-border px-4 py-2"
                    >
                      <CmvText className="text-cmv-text-mid text-sm">{action.label}</CmvText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
