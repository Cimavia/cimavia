import { createFileRoute } from "@tanstack/react-router";
import { LibraryScreen } from "@/feature/library";

export const Route = createFileRoute("/library")({
  component: LibraryScreen,
});
