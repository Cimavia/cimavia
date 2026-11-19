import { NotificationBell } from "@/feature/notification"; // ✗ noFeatureImportInShared
import type { PlanDto } from "@/feature/plan/type"; // ✗ noFeatureImportInShared
import { clearPlanClipboard } from "../../feature/plan/hook/usePlanClipboard"; // ✗ noFeatureImportInShared
import "@/feature/auth/side-effect"; // ✗ noFeatureImportInShared
import { cn } from "@/shared/util/cn.util";
import { featureFlag } from "./featureFlag";

export { ReauthOverlay } from "@/feature/auth"; // ✗ noFeatureImportInShared
export { formatDate } from "@/shared/util/date.util";

export const lazy = () => import("@/feature/message"); // ✗ noFeatureImportInShared
export const lazyTemplate = () => import(`@/feature/message`); // ✗ noFeatureImportInShared
export const lazyShared = () => import("@/shared/lib/nav");

// Une chaîne qui ressemble à un chemin n'est pas un import.
export const label = "@/feature/notification";
export const used = [NotificationBell, clearPlanClipboard, cn, featureFlag] as const;
export type Used = PlanDto;
