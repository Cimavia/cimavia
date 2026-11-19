import { useSessionTimer } from "@/feature/session"; // ✗ noFeatureImportInShared
import { cn } from "@/shared/util/cn.util";

export const used = [useSessionTimer, cn] as const;
