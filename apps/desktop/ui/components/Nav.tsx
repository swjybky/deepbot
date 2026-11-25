import { Text, token, View, type JSX } from "nsh";
import { Pressable } from "./Pressable";
import type { IconName } from "../theme/icons";
import { Icon } from "./Icon";

/** A vertical list of navigation items (设置分类). Constraints: design/components/list.md */
export function NavList(props: { children?: JSX.Element }) {
  return <View class="gap-0.5">{props.children}</View>;
}

export interface NavItemProps {
  label: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/** One item of a NavList: 38pt, icon + label, filled while selected. */
export function NavItem(props: NavItemProps) {
  return (
    <Pressable
      selected={props.selected}
      onPress={props.onPress}
      testID={props.testID}
      class="h-[38px] flex-row items-center gap-2.5 rounded-field px-3 hover:bg-chip selected:bg-nav-active"
    >
      <Icon name={props.icon} size={17} strokeWidth={1.7} color={token("icon-foreground")} />
      <Text class="text-body text-foreground">{props.label}</Text>
    </Pressable>
  );
}
