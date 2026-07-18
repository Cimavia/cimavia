import { useState } from "react";
import { useTranslation } from "react-i18next";

type ImageMessageProps = {
  // URL GET signée (bucket privé).
  url: string;
  alt: string;
};

/**
 * Image d'un message : vignette dans la bulle, ouverte en plein écran au clic (lightbox in-app).
 * Le fond est un `<button>` (et non un `<div>` cliquable) pour rester accessible au clavier —
 * Entrée/Espace ferment, comme le clic.
 */
export function ImageMessage({ url, alt }: Readonly<ImageMessageProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block">
        <img src={url} alt={alt} className="max-h-80 rounded-cmv-md" />
      </button>

      {open ? (
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-cmv-bg-0 p-cmv-xl"
        >
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-cmv-md" />
        </button>
      ) : null}
    </>
  );
}
