import {
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  ReminderEntityType,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";
import { ScheduleReminderButton } from "@/feature/reminder";
import { CmvButton, CmvConfirmButton, CmvText } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Le détail d'une facture, et les gestes qu'on peut poser dessus (#224, maquette frames 3 à 7).
 *
 * Il existe parce qu'une LIGNE ne peut pas tout porter : la note du coach, le cycle facturé et le
 * justificatif ne tiennent pas dans une ligne d'historique, et les actions encore moins. C'est le
 * même contenu qu'affichait la carte, rangé — le pendant mobile d'`InvoiceDetailPanel`.
 *
 * Un `Modal` plein écran, et non une feuille qui monte du bas : un vrai bottom sheet demanderait
 * `react-native-gesture-handler` et `reanimated`, absents du projet, et son balayage de fermeture
 * ne serait pas observable par le harnais de rendu (`react-native-web`, dette Q-6). L'app a déjà ce
 * motif — `ScheduleReminderButton`, `CmvImageViewer` — et il se teste.
 *
 * Servi aux deux titres, comme l'écran : l'athlète y lit sa facture et son PDF, le coach y agit.
 * `canManage` gouverne le pied, et lui seul — la lecture est identique des deux côtés.
 */

type InvoiceDetailProps = {
  invoice: InvoiceDto;
  /**
   * Le coach pilote, l'athlète consulte. Un booléen plutôt que le rôle : le détail n'a pas à savoir
   * QUI regarde, seulement ce qui lui est permis.
   */
  canManage: boolean;
  onClose: () => void;
};

export function InvoiceDetail({ invoice, canManage, onClose }: Readonly<InvoiceDetailProps>) {
  const { t } = useTranslation();
  // Les gestes vivent avec les boutons qui les portent. La racine du cache est invalidée par les
  // deux mutations : le tableau de bord tire ses tuiles de facturation de la même liste.
  const updateStatus = useUpdateInvoiceStatus();
  const cancel = useCancelInvoice();
  // Une mutation en cours éteint TOUS les gestes : confirmer deux fois enverrait deux requêtes,
  // dont la seconde échouerait sur une facture qui a déjà changé d'état.
  const busy = updateStatus.isPending || cancel.isPending;
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : aucune action, et le montant barré —
  // plus personne ne doit rien.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore : c'est l'information qui appelle une action.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  /**
   * Le titre nomme l'AUTRE partie : le coach suit N athlètes, l'athlète n'a qu'un coach — d'où le
   * préfixe « De », qui dit d'où vient la facture plutôt que de répéter son propre nom.
   */
  const counterpart = canManage
    ? invoice.athleteName
    : t("invoice.byCoach", { name: invoice.coachName });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-cmv-bg-1">
        <View className="flex-row items-center gap-3 border-cmv-border border-b px-4 pt-14 pb-3">
          <Pressable
            onPress={onClose}
            accessibilityLabel={t("common.close")}
            className="rounded-lg border border-cmv-border bg-cmv-surface p-2"
          >
            <Ionicons name="chevron-back" size={18} color={cmvColors.text.hi} />
          </Pressable>
          <CmvText className="flex-1 font-cmv-display text-cmv-text-hi" numberOfLines={1}>
            {`${counterpart} · ${formatPeriod(invoice.period)}`}
          </CmvText>
        </View>

        <ScrollView contentContainerClassName="px-4 pb-6">
          <View className="flex-row items-center gap-3 py-4">
            <CmvText
              className={
                isCancelled
                  ? "font-cmv-display text-3xl text-cmv-text-lo line-through"
                  : "font-cmv-display text-3xl text-cmv-text-hi"
              }
            >
              {formatMoney(invoice.amountCents, invoice.currency)}
            </CmvText>
            <InvoiceStatusBadge invoice={invoice} />
          </View>

          <Field
            label={t("invoice.panel.dueDate")}
            value={formatDate(invoice.dueDate)}
            valueClassName={isOverdue ? "text-cmv-error-on" : "text-cmv-text-hi"}
          />

          {/* `paidAt` reste null tant qu'impayée : la ligne DISPARAÎT, au lieu d'un « — » qui
              annoncerait un règlement introuvable. Un instant tronqué en date civile — le détail
              parle d'un jour, comme partout ailleurs. */}
          {isPaid && invoice.paidAt != null ? (
            <Field
              label={t("invoice.panel.paidAt")}
              value={t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}
              valueClassName="text-cmv-success-on"
            />
          ) : null}

          {/* Le cycle facturé — cœur du lien facture ↔ planification (tranché en P6). Nullable au
              DTO pour rester ouvert à une facture hors-cycle ; en MVP toujours renseigné. */}
          {invoice.planTitle == null ? null : (
            <Field label={t("invoice.panel.plan")} value={invoice.planTitle} />
          )}

          {/* La note est une phrase, pas une valeur : elle passe SOUS son intitulé, où elle a la
              largeur de l'écran, plutôt qu'à droite où elle s'enroulerait sur trois lignes. */}
          {invoice.note == null ? null : (
            <Stacked label={t("invoice.panel.note")}>
              <CmvText className="text-cmv-text-mid text-sm">{invoice.note}</CmvText>
            </Stacked>
          )}

          {/* URL GET signée, régénérée à chaque lecture, ouverte par le lecteur du téléphone. Le nom
              d'origine accompagne le bouton : c'est lui que le coach reconnaît. */}
          {invoice.documentUrl == null ? null : (
            <Stacked label={t("invoice.panel.document")}>
              <Pressable
                onPress={() => {
                  const url = invoice.documentUrl;
                  if (url != null) void Linking.openURL(url);
                }}
                className="flex-row items-center gap-2 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3"
              >
                <Ionicons name="document-text-outline" size={16} color={cmvColors.text.mid} />
                <CmvText className="text-cmv-text-hi text-sm">{t("invoice.viewDocument")}</CmvText>
                {invoice.documentFileName == null ? null : (
                  <CmvText className="flex-1 text-cmv-text-lo text-xs" numberOfLines={1}>
                    {invoice.documentFileName}
                  </CmvText>
                )}
              </Pressable>
            </Stacked>
          )}
        </ScrollView>

        <InvoiceActions
          invoice={invoice}
          canManage={canManage}
          busy={busy}
          onMarkPaid={() => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PAID })}
          onReopen={() => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PENDING })}
          onCancel={() => cancel.mutate(invoice.id)}
        />
      </View>
    </Modal>
  );
}

/** Intitulé à gauche, valeur à droite : un détail se PARCOURT du regard, ligne à ligne. */
function Field({
  label,
  value,
  valueClassName = "text-cmv-text-hi",
}: Readonly<{ label: string; value: string; valueClassName?: string }>) {
  return (
    <View className="flex-row items-center justify-between gap-4 border-cmv-border border-b py-3">
      <CmvText className="text-cmv-text-lo text-sm">{label}</CmvText>
      <CmvText className={`flex-1 text-right text-sm ${valueClassName}`}>{value}</CmvText>
    </View>
  );
}

/** Même ligne, mais la valeur passe dessous : pour ce qui a besoin de toute la largeur. */
function Stacked({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <View className="gap-2 border-cmv-border border-b py-3">
      <CmvText className="text-cmv-text-lo text-sm">{label}</CmvText>
      {children}
    </View>
  );
}

type InvoiceActionsProps = {
  invoice: InvoiceDto;
  canManage: boolean;
  busy: boolean;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

/**
 * Le pied. Rien pour l'athlète, rien non plus sur une facture annulée : un pied vide vaut mieux
 * qu'un bouton éteint, qui laisse chercher ce qui le rallumerait.
 *
 * Les gestes sont réservés au coach, et pas par politesse : `PATCH /invoices/:id/status` et
 * `POST /invoices/:id/cancel` sont gardées `@Roles([COACH])`, et `ScheduleReminderButton` touche
 * `Reminder` — la seule entité scopée `coachId` SEUL. Un athlète qui l'atteindrait prendrait une
 * erreur, pas un 403.
 */
function InvoiceActions({
  invoice,
  canManage,
  busy,
  onMarkPaid,
  onReopen,
  onCancel,
}: Readonly<InvoiceActionsProps>) {
  const { t } = useTranslation();
  if (!canManage || invoice.status === InvoiceStatus.CANCELLED) return null;

  // Payée : un seul geste, le retour arrière. Poser un paiement à tort se corrige, mais pas à la
  // légère — d'où la confirmation en deux temps. `secondary` et non `danger` : rouvrir une facture
  // ne détruit rien, l'API repose simplement `paidAt` à null.
  if (invoice.status === InvoiceStatus.PAID) {
    return (
      <View className="gap-3 border-cmv-border border-t bg-cmv-bg-1 px-4 pt-4 pb-8">
        <CmvConfirmButton
          variant="secondary"
          label={t("invoice.coach.reopen")}
          confirmLabel={t("invoice.coach.reopenConfirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={onReopen}
          disabled={busy}
        />
      </View>
    );
  }

  return (
    <View className="gap-3 border-cmv-border border-t bg-cmv-bg-1 px-4 pt-4 pb-8">
      <CmvButton label={t("invoice.coach.markPaid")} onPress={onMarkPaid} disabled={busy} />
      {/* Rappel contextuel (#46), offert sur les factures qui restent à régler SEULEMENT : se
          rappeler de relancer une facture payée ou annulée n'a aucun sens. La période nomme la
          cible, comme dans la liste des rappels. */}
      <ScheduleReminderButton
        entityType={ReminderEntityType.INVOICE}
        entityId={invoice.id}
        targetLabel={formatPeriod(invoice.period)}
      />
      {/* Tertiaire, et discret AU REPOS : sous « Marquer payée », un bouton rouge crierait plus
          fort que l'action qu'on vient chercher ici neuf fois sur dix. Sa gravité apparaît à
          l'armement — d'où `ghost`, et d'où l'avertissement, que le retour arrière n'a pas :
          celui-ci se défait, l'annulation est refusée en 409 dès qu'elle est posée. */}
      <View className="pt-1">
        <CmvConfirmButton
          variant="ghost"
          label={t("invoice.coach.cancel")}
          confirmLabel={t("invoice.coach.cancelConfirm")}
          cancelLabel={t("common.cancel")}
          confirmHint={t("invoice.coach.cancelHint")}
          onConfirm={onCancel}
          disabled={busy}
        />
      </View>
    </View>
  );
}
