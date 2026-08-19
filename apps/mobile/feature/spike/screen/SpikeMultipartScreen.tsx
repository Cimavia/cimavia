import { isAllowedFeedbackVideoMime, MediaType } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { athletePlanApi } from "@/feature/plan/api";
import {
  PROBE_PART_SIZE_BYTES,
  type ProbeStrategy,
  partCountOf,
  partRange,
  uploadPart,
} from "@/feature/spike/util/multipart-probe.util";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
// Pas réexporté par l'index des composants — le spike le prend à la source.
import { CmvTextField } from "@/shared/component/CmvTextField";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * SPIKE JETABLE — écran de mesure, à supprimer avec tout `feature/spike` une fois la stratégie
 * tranchée. Atteignable par `cimavia://spike` uniquement (aucun lien depuis l'app).
 *
 * Deux entorses ASSUMÉES aux règles dures, parce que ce code n'a pas vocation à être livré :
 * les libellés sont en dur (pas d'i18n), et l'écran n'a pas de design.
 *
 * Ce qu'il mesure : pour chacune des deux stratégies de découpage, on demande une URL signée par
 * part puis on la pousse. Aucun `attachMedia` n'est appelé — donc AUCUNE ligne en base, aucun
 * débrief créé, aucune séance passée en DONE. Seuls des objets orphelins restent dans le bucket
 * du tier dev (données synthétiques, purgeables).
 */
export function SpikeMultipartScreen() {
  const [sessionId, setSessionId] = useState("");
  const [partCount, setPartCount] = useState("3");
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  // Entrées identifiées plutôt que de simples chaînes : deux lignes de log peuvent être
  // rigoureusement identiques (« ── SLICE ── » à chaque relance), et se marcheraient dessus en clé.
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [running, setRunning] = useState(false);

  // Une séance publiée quelconque de l'athlète : l'URL signée est délivrée par une route scopée à
  // la séance, il en faut donc une valide. Le champ reste éditable si l'auto-détection ne convient pas.
  const { data: plan } = useQuery({
    queryKey: ["spike", "plan"],
    queryFn: () => athletePlanApi.current(),
  });
  const detectedSessionId = plan?.weeks.flatMap((week) => week.sessions).at(0)?.id ?? null;
  const effectiveSessionId = sessionId.trim() === "" ? (detectedSessionId ?? "") : sessionId.trim();

  function append(text: string) {
    setLog((previous) => [...previous, { id: previous.length, text }]);
  }

  async function onPick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      append("✗ permission médiathèque refusée");
      return;
    }
    // Aucune borne de durée ici, contrairement à la production : le spike veut le fichier le plus
    // LOURD possible, c'est tout son intérêt.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] });
    if (result.canceled) return;

    const picked = result.assets.at(0) ?? null;
    setAsset(picked);
    if (picked != null) {
      const size = new File(picked.uri).size;
      append(
        `→ vidéo ${megabytes(size)} Mo · ${partCountOf(size)} parts de ${megabytes(PROBE_PART_SIZE_BYTES)} Mo · ${picked.mimeType ?? "mime inconnu"}`,
      );
    }
  }

  async function onRun(strategy: ProbeStrategy) {
    if (asset == null || effectiveSessionId === "") {
      append("✗ choisis une vidéo et renseigne un id de séance");
      return;
    }
    setRunning(true);
    append(`── ${strategy} ──`);
    try {
      await runProbe(strategy, asset, effectiveSessionId, Number(partCount), append);
    } catch (error) {
      append(`✗ ${describe(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <CmvScreen>
      <View className="flex-1 gap-3 p-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          Spike — upload multipart
        </CmvText>

        <CmvTextField
          label={`Séance${detectedSessionId != null ? " (détectée)" : ""}`}
          value={effectiveSessionId}
          onChangeText={setSessionId}
          autoCapitalize="none"
          placeholder="id de séance"
        />
        <CmvTextField
          label="Nombre de parts à envoyer"
          value={partCount}
          onChangeText={setPartCount}
          keyboardType="number-pad"
        />

        <CmvButton label="1 · Choisir une vidéo" onPress={onPick} disabled={running} />
        <CmvButton
          label="2 · Tester slice + fetch"
          onPress={() => onRun("SLICE")}
          disabled={running || asset == null}
        />
        <CmvButton
          label="3 · Tester handle + upload natif"
          onPress={() => onRun("HANDLE")}
          disabled={running || asset == null}
        />

        <ScrollView className="flex-1 rounded-lg bg-cmv-surface p-3">
          {log.map((entry) => (
            <CmvText key={entry.id} className="text-cmv-text-mid text-xs">
              {entry.text}
            </CmvText>
          ))}
        </ScrollView>
      </View>
    </CmvScreen>
  );
}

/**
 * Envoie `requested` parts SÉQUENTIELLEMENT : c'est le pire cas côté durée, mais le seul qui
 * isole la mémoire d'une part à la fois — or c'est précisément ce qu'on cherche à savoir.
 */
async function runProbe(
  strategy: ProbeStrategy,
  asset: ImagePicker.ImagePickerAsset,
  sessionId: string,
  requested: number,
  append: (line: string) => void,
): Promise<void> {
  const source = new File(asset.uri);
  const totalBytes = source.size;
  const mimeType =
    asset.mimeType != null && isAllowedFeedbackVideoMime(asset.mimeType)
      ? asset.mimeType
      : "video/mp4";
  const count = Math.min(
    Math.max(Number.isFinite(requested) ? requested : 1, 1),
    partCountOf(totalBytes),
  );

  for (let partNumber = 1; partNumber <= count; partNumber += 1) {
    const { length } = partRange(partNumber, totalBytes);
    // Une URL signée par part, chacune portant le `ContentLength` de SA part : c'est ce qui rend
    // le 200 probant. La vraie implémentation signera les parts d'un seul upload multipart.
    const signed = await athleteFeedbackApi.requestMediaUploadUrl(sessionId, {
      type: MediaType.VIDEO,
      fileName: `spike-${strategy}-${Date.now()}-${partNumber}.mp4`,
      mimeType,
      size: length,
      durationSeconds: 1,
    });

    const outcome = await uploadPart(
      strategy,
      source,
      partNumber,
      totalBytes,
      signed.uploadUrl,
      mimeType,
    );
    const throughput = (outcome.bytes / 1024 / 1024 / (outcome.elapsedMs / 1000)).toFixed(1);
    append(
      `${outcome.status === 200 ? "✓" : "✗"} part ${partNumber}/${count} · ${megabytes(outcome.bytes)} Mo · HTTP ${outcome.status} · ${outcome.elapsedMs} ms · ${throughput} Mo/s`,
    );
    if (outcome.status !== 200) return;
  }
  append("✓ terminé");
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function describe(error: unknown): string {
  return apiErrorMessage(error) ?? String(error);
}
