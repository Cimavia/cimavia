import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, TextInput, View } from "react-native";
import { CmvText } from "@/shared/component";

type ComposerProps = {
  onSend: (text: string) => void;
  sending: boolean;
};

// Barre d'envoi de message texte. Les pièces jointes (audio/photo/vidéo) s'ajouteront ici avec
// l'enregistreur (commit 7) — la barre est déjà pensée pour les accueillir.
export function Composer({ onSend, sending }: Readonly<ComposerProps>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View className="flex-row items-end gap-2 border-cmv-border border-t bg-cmv-bg-1 p-3">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t("messages.placeholder")}
        multiline
        textAlignVertical="center"
        className="max-h-32 flex-1 rounded-2xl border border-cmv-border bg-cmv-surface px-4 py-2 text-cmv-text-hi"
      />
      <Pressable
        onPress={submit}
        disabled={!canSend}
        className={`rounded-full bg-cmv-accent px-4 py-3 ${canSend ? "" : "opacity-50"}`}
      >
        <CmvText className="text-cmv-text-hi">{t("messages.send")}</CmvText>
      </Pressable>
    </View>
  );
}
