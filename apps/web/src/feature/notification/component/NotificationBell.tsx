import type { NotificationCategoryType } from "@cmv/shared";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IoContractOutline, IoExpandOutline, IoNotificationsOutline } from "react-icons/io5";
import { NotificationCenter } from "@/feature/notification/component/NotificationCenter";
import { useNotificationPanelLayout } from "@/feature/notification/hook/useNotificationPanelLayout";
import { useUnreadNotificationCount } from "@/feature/notification/hook/useNotifications";
import { CmvPanel, CmvResizeHandle } from "@/shared/component";
import { useAnchoredPosition } from "@/shared/hook/useAnchoredPosition";
import { useViewportSize } from "@/shared/hook/useViewportSize";
import { cn } from "@/shared/util/cn.util";
import { clampSize, type Size } from "@/shared/util/resize.util";

// Au-delà, le chiffre exact n'apporte plus rien et déforme la pastille.
const BADGE_MAX = 99;

// La taille d'origine du panneau déroulant (`w-80 max-h-96`) : il ne descend jamais en dessous.
const POPOVER_MIN: Size = { width: 320, height: 384 };
// L'écart gardé avec les bords de la fenêtre : le panneau grandit jusqu'à elle, pas au-delà.
const VIEWPORT_GUTTER = 16;
// La largeur `md` du slide-over, tant qu'aucune n'a été réglée.
const SIDE_DEFAULT_WIDTH = 576;

/**
 * Cloche + badge + centre de notifications (#49). Posée dans `CmvAppShell`, donc visible de tous
 * les écrans : c'est la condition pour qu'une notification serve à quelque chose.
 *
 * Deux conteneurs pour un même contenu (#695) : le panneau déroulant, redimensionnable par son coin
 * bas-gauche, ou un `CmvPanel` pleine hauteur, dont seule la largeur se règle. Le mode et les
 * tailles sont retenus par ce navigateur. Les deux restent modaux — fond cliquable, refermés au
 * clic sur une notification.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * Le filtre du centre (#694), `null` = « Toutes ». NON mémorisé : il revient à « Toutes » à chaque
   * ouverture. Le badge compte toutes les catégories — un filtre retenu afficherait « 3 » sur la
   * cloche et une liste vide à l'ouverture. Il survit en revanche au changement de conteneur.
   */
  const [category, setCategory] = useState<NotificationCategoryType | null>(null);
  const { layout, update } = useNotificationPanelLayout();
  const anchorRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  /**
   * La bascule vit dans le conteneur qu'elle remplace : un clic la démonte, et le focus clavier
   * retomberait sur la page. Celle du nouveau conteneur le reprend à son montage.
   */
  const focusToggle = useRef(false);
  const side = layout.mode === "side";

  const { data: unreadCount } = useUnreadNotificationCount();

  // Échap ferme le panneau déroulant. Le latéral passe par la pile de `CmvPanel`, qui ne ferme que
  // le panneau du dessus : deux écouteurs le refermeraient deux fois.
  useEffect(() => {
    if (!open || side) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      bellRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, side]);

  // Le focus revient à la cloche : le panneau, sorti par un portail, l'emporterait sinon avec lui.
  const close = () => {
    setOpen(false);
    bellRef.current?.focus();
  };
  const hasUnread = unreadCount != null && unreadCount > 0;
  const toggleLabel = t(side ? "notification.layout.popover" : "notification.layout.side");

  const center = (
    <NotificationCenter
      category={category}
      onCategoryChange={setCategory}
      onClose={close}
      hasUnread={hasUnread}
      showTitle={!side}
      layoutToggle={
        <button
          type="button"
          ref={(node) => {
            if (node == null || !focusToggle.current) return;
            focusToggle.current = false;
            node.focus();
          }}
          onClick={() => {
            focusToggle.current = true;
            update({ mode: side ? "popover" : "side" });
          }}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="rounded-cmv-md p-cmv-xs text-cmv-text-mid transition-colors hover:bg-cmv-surface-hi hover:text-cmv-text-hi"
        >
          {side ? <IoContractOutline aria-hidden /> : <IoExpandOutline aria-hidden />}
        </button>
      }
    />
  );

  return (
    <div ref={anchorRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => {
          setCategory(null);
          setOpen((wasOpen) => !wasOpen);
        }}
        aria-label={t("notification.open")}
        aria-expanded={open}
        className="relative rounded-cmv-md p-cmv-sm text-cmv-text-mid transition-colors hover:bg-cmv-surface-hi hover:text-cmv-text-hi"
      >
        <IoNotificationsOutline size={20} />
        {hasUnread ? (
          <span className="-right-0.5 -top-0.5 absolute min-w-4 rounded-cmv-pill bg-cmv-accent px-1 text-cmv-caption text-cmv-text-hi leading-4">
            {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
          </span>
        ) : null}
      </button>

      {/* Les deux conteneurs vivent hors du bandeau, par un portail : `sticky z-20`, il plafonne
          tout ce qu'il contient à z-20, et un en-tête de tableau collant plus bas dans la page
          passerait par-dessus. */}
      {open && !side
        ? createPortal(
            <>
              {/* Fond cliquable : ferme au clic en dehors, comme le slide-over du design system. */}
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={close}
                className="fixed inset-0 z-40 cursor-default"
              />
              <NotificationPopover
                anchorRef={anchorRef}
                size={layout.popover}
                onSizeChange={(popover) => update({ popover })}
              >
                {center}
              </NotificationPopover>
            </>,
            document.body,
          )
        : null}
      {createPortal(
        <CmvPanel
          open={open && side}
          title={t("notification.title")}
          onClose={close}
          width={layout.sideWidth ?? SIDE_DEFAULT_WIDTH}
          onWidthChange={(sideWidth) => update({ sideWidth })}
          flush
        >
          {center}
        </CmvPanel>,
        document.body,
      )}
    </div>
  );
}

type NotificationPopoverProps = {
  /** La cloche, sous laquelle le panneau s'ouvre, aligné à sa droite. */
  anchorRef: RefObject<HTMLDivElement | null>;
  /** `null` = jamais redimensionné : il suit son contenu jusqu'à sa hauteur d'origine. */
  size: Size | null;
  /** La taille retenue, à la fin d'un geste. */
  onSizeChange: (size: Size) => void;
  children: ReactNode;
};

function NotificationPopover({
  anchorRef,
  size,
  onSizeChange,
  children,
}: Readonly<NotificationPopoverProps>) {
  const { t } = useTranslation();
  const viewport = useViewportSize();
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * En `fixed` sous la cloche, aligné à sa droite, et recalé au défilement comme au
   * redimensionnement (`useAnchoredPosition`) : sorti du bandeau par le portail, il ne la suit plus
   * de lui-même.
   */
  const position = useAnchoredPosition(anchorRef, true, "end");
  /**
   * La taille pendant un glisser : seul le panneau se re-rend, la cloche — et la liste, qu'elle
   * passe telle quelle en `children` — n'apprennent la taille qu'au relâchement.
   */
  const [draft, setDraft] = useState<Size | null>(null);
  /**
   * Le portail le pose en fin de page : sans ça, Tab depuis la cloche parcourrait tout l'écran avant
   * de l'atteindre. Le focus y entre dès qu'il est placé — sauf s'il y est déjà, rendu à la
   * bascule depuis le panneau latéral.
   */
  const placed = position != null;
  useEffect(() => {
    const panel = panelRef.current;
    if (!placed || panel == null || panel.contains(document.activeElement)) return;
    panel.focus();
  }, [placed]);
  // Mesuré au premier effet : rien à montrer avant, plutôt qu'un panneau à la mauvaise place.
  if (position == null || !("right" in position)) return null;

  // Ancré à droite et ouvert sous la cloche : il grandit jusqu'au bord gauche et au bas de la fenêtre.
  const max: Size = {
    width: document.documentElement.clientWidth - position.right - VIEWPORT_GUTTER,
    height: viewport.height - position.top - VIEWPORT_GUTTER,
  };
  const current = draft ?? size;
  // Une taille enregistrée sur un grand écran se ramène ici à celui-ci, sans être réécrite.
  const shown = current == null ? null : clampSize(current, POPOVER_MIN, max);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("notification.title")}
      tabIndex={-1}
      className={cn(
        "fixed z-50 flex flex-col rounded-cmv-lg border border-cmv-border bg-cmv-bg-1 shadow-xl focus:outline-none",
        shown == null && "max-h-96 w-80",
      )}
      style={{ ...position, ...shown }}
    >
      {children}
      <CmvResizeHandle
        axis="xy"
        size={shown ?? POPOVER_MIN}
        min={POPOVER_MIN}
        max={max}
        onResize={setDraft}
        onResizeEnd={(end) => {
          setDraft(null);
          onSizeChange(end);
        }}
        className="absolute bottom-0 left-0 z-10"
      />
    </div>
  );
}
