import {
  isInstructionImageMime,
  linkHrefSchema,
  MAX_DOCUMENT_SIZE_BYTES,
  type RichDocument,
} from "@cmv/shared";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IoAttach,
  IoCheckmark,
  IoClose,
  IoImageOutline,
  IoInformationCircleOutline,
  IoList,
  IoText,
} from "react-icons/io5";
import { CalloutExtension } from "@/feature/library/component/CalloutExtension";
import { ImageExtension } from "@/feature/library/component/ImageExtension";
import { useInstructionMediaContext } from "@/feature/library/component/InstructionMediaContext";
import { INSTRUCTION_IMAGE_ACCEPT } from "@/feature/library/constant";
import {
  CALLOUT_NODE,
  HEADING_LEVEL,
  IMAGE_NODE,
  toRichDocument,
  toTipTapDocument,
} from "@/feature/library/util/tiptap-document.util";
import { cn } from "@/shared/util/cn.util";

type InstructionsEditorProps = {
  /** Document initial. NON repoussé dans l'éditeur ensuite : le remonter déplacerait le curseur. */
  initialValue: RichDocument | null;
  onChange: (blocks: RichDocument) => void;
};

export function InstructionsEditor({ initialValue, onChange }: Readonly<InstructionsEditorProps>) {
  const { t } = useTranslation();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Un seul niveau : une consigne d'exercice ne se hiérarchise pas davantage.
        heading: { levels: [HEADING_LEVEL] },
        // Coupés parce que le modèle ne les porte PAS. Les laisser actifs produirait des blocs
        // que la conversion jetterait en silence — le coach verrait son texte disparaître à
        // l'enregistrement sans jamais savoir pourquoi.
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: false, protocols: ["http", "https"] },
      }),
      CalloutExtension,
      ImageExtension,
    ],
    content: toTipTapDocument(initialValue),
    onUpdate: ({ editor: current }) => onChange(toRichDocument(current.getJSON())),
    editorProps: {
      attributes: {
        class:
          "min-h-40 bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-body text-cmv-text-hi outline-none [&_h3]:text-cmv-subtitle [&_h3]:text-cmv-text-hi [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-cmv-lg [&_ol]:pl-cmv-lg",
      },
    },
  });

  if (editor == null) return null;

  return (
    <div className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.instructions")}
      </span>
      {/* `overflow-hidden` : la barre d'outils et la zone de saisie ont un fond plein qui, sans
          lui, déborde des angles arrondis du cadre — c'est le cadre qui découpe, pas chaque
          enfant qui devine quels angles arrondir. */}
      <div className="overflow-hidden rounded-cmv-md border border-cmv-border focus-within:border-cmv-accent">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ── Barre d'outils ──────────────────────────────────────────────────────────────────────────

type ToolButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolButton({ label, active, onClick, children }: Readonly<ToolButtonProps>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // `onMouseDown` + `preventDefault` : un clic ordinaire ferait perdre le focus à l'éditeur,
      // donc la sélection, et la marque s'appliquerait à un curseur vide.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded-cmv-sm px-cmv-sm py-cmv-xs text-cmv-body transition-colors",
        active
          ? "bg-cmv-accent-soft text-cmv-accent-on"
          : "text-cmv-text-mid hover:text-cmv-text-hi",
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: Readonly<{ editor: Editor }>) {
  const { t } = useTranslation();
  const media = useInstructionMediaContext();
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  /**
   * `useEditorState` plutôt que `editor.isActive()` lu au rendu : sans lui, React ne se redessine
   * pas quand la SÉLECTION bouge, et les boutons resteraient allumés au mauvais endroit.
   */
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      heading: current.isActive("heading", { level: HEADING_LEVEL }),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      callout: current.isActive(CALLOUT_NODE),
      link: current.isActive("link"),
    }),
  });

  function onLinkClick() {
    if (state.link) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    setLinkDraft("https://");
  }

  /**
   * Les MÊMES contraintes que le serveur, appliquées avant de toucher au réseau : le coach voit
   * son refus tout de suite, et pas après une barre de progression pour rien.
   */
  function onPickImage(file: File) {
    setFileError(null);
    if (!isInstructionImageMime(file.type)) {
      setFileError(t("library.builder.image.errorType"));
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setFileError(t("library.builder.image.errorSize"));
      return;
    }
    const mediaId = media.register(file, file.type);
    editor
      .chain()
      .focus()
      .insertContent({ type: IMAGE_NODE, attrs: { mediaId, caption: "" } })
      .run();
  }

  function applyLink(href: string) {
    // Le MÊME schéma que le serveur : `z.url()` accepte `javascript:alert(1)`, qui est une URL
    // syntaxiquement valide. Sans ce garde, un lien de consigne devient un vecteur XSS.
    if (!linkHrefSchema.safeParse(href).success) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
  }

  return (
    <div className="flex flex-col gap-cmv-xs border-cmv-border border-b bg-cmv-bg-1 p-cmv-xs">
      <div className="flex flex-wrap items-center gap-cmv-xs">
        <ToolButton
          label={t("library.builder.tool.bold")}
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton
          label={t("library.builder.tool.italic")}
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolButton>
        <ToolButton
          label={t("library.builder.tool.underline")}
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolButton>

        <Separator />

        <ToolButton
          label={t("library.builder.tool.heading")}
          active={state.heading}
          onClick={() => editor.chain().focus().toggleHeading({ level: HEADING_LEVEL }).run()}
        >
          <IoText />
        </ToolButton>

        <Separator />

        <ToolButton
          label={t("library.builder.tool.bulletList")}
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <IoList />
        </ToolButton>
        <ToolButton
          label={t("library.builder.tool.orderedList")}
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <span className="text-cmv-caption">1.</span>
        </ToolButton>

        <Separator />

        <ToolButton
          label={t("library.builder.tool.callout")}
          active={state.callout}
          onClick={() => editor.chain().focus().toggleNode(CALLOUT_NODE, "paragraph").run()}
        >
          <IoInformationCircleOutline />
        </ToolButton>
        <ImageToolButton onPick={onPickImage} />
        <ToolButton
          label={t("library.builder.tool.link")}
          active={state.link}
          onClick={onLinkClick}
        >
          <IoAttach />
        </ToolButton>
      </div>

      {fileError == null ? null : <p className="text-cmv-caption text-cmv-error">{fileError}</p>}

      {linkDraft == null ? null : (
        <LinkField
          value={linkDraft}
          onChange={setLinkDraft}
          onSubmit={() => applyLink(linkDraft)}
          onCancel={() => setLinkDraft(null)}
        />
      )}
    </div>
  );
}

/**
 * Un `<label>` et non un bouton : l'input fichier natif ouvre le sélecteur sans qu'on ait à
 * simuler un clic sur une ref, et reste accessible au clavier.
 */
function ImageToolButton({ onPick }: Readonly<{ onPick: (file: File) => void }>) {
  const { t } = useTranslation();
  return (
    <label
      title={t("library.builder.tool.image")}
      className="cursor-pointer rounded-cmv-sm px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-mid transition-colors hover:text-cmv-text-hi"
    >
      <IoImageOutline aria-label={t("library.builder.tool.image")} />
      <input
        type="file"
        accept={INSTRUCTION_IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Remis à zéro : sans ça, re-choisir le MÊME fichier ne déclenche aucun `change`.
          event.target.value = "";
          if (file != null) onPick(file);
        }}
      />
    </label>
  );
}

function Separator() {
  return <span className="mx-cmv-xs h-4 w-px bg-cmv-border" aria-hidden="true" />;
}

type LinkFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function LinkField({ value, onChange, onSubmit, onCancel }: Readonly<LinkFieldProps>) {
  const { t } = useTranslation();
  const isValid = linkHrefSchema.safeParse(value).success;

  return (
    <div className="flex items-center gap-cmv-xs">
      <input
        // biome-ignore lint/a11y/noAutofocus: champ ouvert par un clic délibéré sur le bouton lien — sans focus, il faudrait un second clic pour taper l'URL
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
          if (event.key === "Escape") onCancel();
        }}
        aria-label={t("library.builder.tool.linkUrl")}
        placeholder="https://"
        className="flex-1 rounded-cmv-sm border border-cmv-border bg-cmv-surface px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-hi outline-none focus:border-cmv-accent"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSubmit}
        disabled={!isValid}
        aria-label={t("library.builder.tool.linkApply")}
        className="rounded-cmv-sm px-cmv-sm py-cmv-xs text-cmv-accent disabled:text-cmv-text-lo"
      >
        <IoCheckmark />
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCancel}
        aria-label={t("library.builder.tool.linkCancel")}
        className="rounded-cmv-sm px-cmv-sm py-cmv-xs text-cmv-text-mid"
      >
        <IoClose />
      </button>
    </div>
  );
}
