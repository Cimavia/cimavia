import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/component/CmvToast";
import { createTestI18n } from "../../../test/i18n";
import { useCheckedSave } from "./useCheckedSave";

function setup<Saved>(
  blocker: () => string | null,
  submit: () => Promise<Saved>,
  onError?: (error: unknown) => void,
) {
  const i18n = createTestI18n();
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>{children}</ToastProvider>
    </I18nextProvider>
  );
  return renderHook(() => useCheckedSave(blocker, submit, onError), { wrapper }).result;
}

/** Un envoi que le test laisse en vol, puis termine. */
function pendingSubmit() {
  let finish: (saved: string) => void = () => undefined;
  const submit = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  return { submit, finish: (saved: string) => finish(saved) };
}

describe("useCheckedSave", () => {
  it("envoie, et rend ce qui est enregistré", async () => {
    const save = setup(
      () => null,
      async () => "saved",
    );

    await expect(save.current()).resolves.toBe("saved");
  });

  it("n'envoie rien quand la saisie est retenue, et dit pourquoi", async () => {
    const submit = vi.fn(async () => "saved");
    const save = setup(() => "plan.header.titleRequired", submit);

    await act(async () => {
      await expect(save.current()).resolves.toBeNull();
    });

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("plan.header.titleRequired")).toBeInTheDocument();
  });

  it("rend null sur un échec, et le confie à `onError`", async () => {
    const failure = new Error("réseau");
    const onError = vi.fn();
    const save = setup(
      () => null,
      () => Promise.reject(failure),
      onError,
    );

    await expect(save.current()).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  // Repris à son compte, le résultat de l'envoi en vol tairait ce qui a été saisi depuis.
  it("fait attendre un second geste pendant l'envoi, sans renvoyer ni partir", async () => {
    const { submit, finish } = pendingSubmit();
    const save = setup(() => null, submit);

    const first = save.current();
    const second = save.current();
    finish("saved");

    await expect(first).resolves.toBe("saved");
    await expect(second).resolves.toBeNull();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("renvoie une fois l'envoi précédent terminé, même en échec", async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce("saved");
    const save = setup(() => null, submit);

    await expect(save.current()).resolves.toBeNull();
    await expect(save.current()).resolves.toBe("saved");
    expect(submit).toHaveBeenCalledTimes(2);
  });
});
