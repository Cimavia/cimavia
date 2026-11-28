import { copyTitle, PLAN_TITLE_MAX_LENGTH, required } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDuplicatePlan } from "@/feature/plan/hook/usePlans";
import { CmvButton } from "@/shared/component";

type DuplicatePlanButtonProps = {
  plan: { id: string; title: string };
  /**
   * L'en-tête, la facturation ou le panneau d'une séance montre une saisie que l'API n'a pas
   * (#326). La copie part de l'ENREGISTRÉ : dupliquer maintenant copierait un autre cycle que celui
   * qu'on voit, puis la garde de navigation (#327) demanderait quoi faire de la saisie — après coup.
   */
  isUnsaved: boolean;
  /** Une écriture du builder est en vol : la copie lirait un état qui va changer. */
  isBusy: boolean;
};

/**
 * « Dupliquer » (#5) : un clic crée la copie et ouvre son constructeur. Ni boîte de dialogue ni
 * formulaire — titre, athlète et début se corrigent dans l'en-tête, comme sur tout brouillon
 * (#207). Offert dans TOUS les modes, Lecture et suivi terminé compris : lire suffit à copier, et
 * « reprendre le cycle d'un athlète parti » est le cas d'usage même.
 */
export function DuplicatePlanButton({
  plan,
  isUnsaved,
  isBusy,
}: Readonly<DuplicatePlanButtonProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const duplicate = useDuplicatePlan(plan.id);

  function onDuplicate() {
    // Le suffixe tient toujours dans la borne : seul le titre se raccourcit.
    const title = required(
      copyTitle(plan.title, t("plan.duplicate.suffix"), PLAN_TITLE_MAX_LENGTH),
      "titre de la copie",
    );
    duplicate.mutate(
      { title },
      {
        // Propre à CE montage : parti vers un autre cycle entre-temps, le coach y reste — le
        // builder se remonte par cycle, et TanStack Query oublie le rappel d'un bouton démonté. Le
        // toast du hook lui dit, lui, que la copie existe.
        onSuccess: (copy) => void navigate({ to: "/plans/$planId", params: { planId: copy.id } }),
      },
    );
  }

  // Info-bulle sur un span : un bouton désactivé ne déclenche pas toujours le `title` natif.
  return (
    <span title={t(isUnsaved ? "plan.duplicate.unsaved" : "plan.duplicate.hint")}>
      <CmvButton
        variant="secondary"
        onClick={onDuplicate}
        disabled={isUnsaved || isBusy || duplicate.isPending}
      >
        {duplicate.isPending ? t("plan.duplicate.pending") : t("plan.duplicate.action")}
      </CmvButton>
    </span>
  );
}
