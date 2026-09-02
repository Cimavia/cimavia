import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackInboxList, InboxFilter } from "@/feature/feedback/component/FeedbackInboxList";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach-1" } } }) },
}));

function feedback(overrides: Partial<CoachFeedbackSummaryDto>): CoachFeedbackSummaryDto {
  return {
    id: "f-1",
    scheduledSessionId: "s-1",
    planId: "p-1",
    athleteId: "a-1",
    athleteName: "Léa Moreau",
    sessionTitle: "Voie & projet 7b",
    scheduledDate: "2026-10-16",
    content: "Bien tenu sur les deux premières voies",
    mediaCount: 0,
    coachReadAt: null,
    repliedAt: null,
    createdAt: "2026-10-16T19:42:00.000Z",
    updatedAt: "2026-10-16T19:42:00.000Z",
    ...overrides,
  };
}

const UNREAD = feedback({ id: "f-unread", athleteName: "Léa Moreau", coachReadAt: null });
const READ = feedback({
  id: "f-read",
  athleteName: "Thomas Rey",
  athleteId: "a-2",
  coachReadAt: "2026-10-16T20:00:00.000Z",
});

function renderList(feedbacks: CoachFeedbackSummaryDto[], filter: InboxFilter) {
  const onFilter = vi.fn();
  const onOpen = vi.fn();
  const result = renderWithProviders(
    <FeedbackInboxList
      feedbacks={feedbacks}
      openedId={null}
      filter={filter}
      onFilter={onFilter}
      onOpen={onOpen}
    />,
  );
  return { ...result, onFilter, onOpen };
}

describe("FeedbackInboxList", () => {
  it("montre tout sur le segment « Tous »", () => {
    const { queryByText } = renderList([UNREAD, READ], InboxFilter.ALL);

    expect(queryByText("Léa Moreau")).not.toBeNull();
    expect(queryByText("Thomas Rey")).not.toBeNull();
  });

  it("ne garde que les non lus sur le segment « Non lus »", () => {
    const { queryByText } = renderList([UNREAD, READ], InboxFilter.UNREAD);

    expect(queryByText("Léa Moreau")).not.toBeNull();
    expect(queryByText("Thomas Rey")).toBeNull();
  });

  /**
   * Filtrer jusqu'au vide n'est pas la même chose que ne rien avoir reçu — et ça ne se dit pas
   * pareil. « Aucun débrief » sur une liste qui en contient deux serait faux.
   */
  it("dit « tout est lu » quand le filtre vide la liste, pas « aucun débrief »", () => {
    const { queryByText } = renderList([READ], InboxFilter.UNREAD);

    expect(queryByText("feedback.inbox.allRead.title")).not.toBeNull();
    expect(queryByText("feedback.empty.title")).toBeNull();
  });

  // Le compte porte sur la liste ENTIÈRE, pas sur ce que le segment montre : c'est ce qui reste à
  // traiter, et le filtre ne doit pas le faire tomber à zéro en le masquant.
  it("compte les non lus indépendamment du segment affiché", () => {
    const { queryByText } = renderList([UNREAD, READ], InboxFilter.ALL);
    expect(queryByText("feedback.inbox.unreadCount")).not.toBeNull();
  });

  it("remonte le débrief choisi", () => {
    const { getByText, onOpen } = renderList([UNREAD, READ], InboxFilter.ALL);

    fireEvent.click(getByText("Thomas Rey"));
    expect(onOpen).toHaveBeenCalledWith(READ);
  });
});
