import { Tabs } from "expo-router";

const BADGE_MAX = 99; // ✗ noLogicInLayout

function badgeOf(count: number) { // ✗ noLogicInLayout
  return count > BADGE_MAX ? `${BADGE_MAX}+` : count;
}

export type Props = { count: number }; // ✗ noLogicInLayout

export default function GroupLayout({ count }: Props) {
  return <Tabs screenOptions={{ tabBarBadge: badgeOf(count) }} />;
}
