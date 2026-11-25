import { Text, token, View } from "nsh";
import { Pressable } from "./Pressable";
import type { IconName } from "../theme/icons";
import { Icon } from "./Icon";

/** Group heading; its contents live directly below it. */
export function DisclosureRow(props: { title: string; detail?: string; icon?: IconName; verticalChevron?: boolean; open: boolean; onPress: () => void; testID?: string }) {
  const chevron = () => props.verticalChevron
    ? (props.open ? "chevronUp" : "chevronDown")
    : (props.open ? "chevronDown" : "chevronRight");
  return <Pressable selected={props.open} onPress={props.onPress} accessibilityLabel={`${props.open ? "收起" : "展开"}${props.title}`} testID={props.testID} class={`flex-row items-center gap-3 rounded-control px-2 py-3 hover:bg-secondary active:bg-chip selected:bg-chip ${props.icon ? "min-h-14" : ""}`}>
    {props.icon ? <View class="size-8 items-center justify-center rounded-control border border-border bg-secondary"><Icon name={props.icon} size={16} color={token("muted-foreground")} /></View> : null}
    <Text class="min-w-0 flex-1 text-body font-medium text-foreground">{props.title}</Text>
    {props.detail ? <Text class="text-caption text-faint-foreground">{props.detail}</Text> : null}
    <Icon name={chevron()} size={12} color={token("faint-foreground")} />
  </Pressable>;
}
