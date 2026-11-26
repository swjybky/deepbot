import { computed, signal, Text, token, View, type JSX } from "nsh";
import { Pressable } from "./Pressable";
import { Icon } from "./Icon";
/**
 * Generic compact card. Domain commands and data remain in features/state.
 * With onPress the whole card opens a detail view.
 * statusIndicator: non-interactive status content in the title row.
 */
export function ActivityCard(props: { title: string; status?: string; statusIndicator?: JSX.Element; detail?: string; children?: JSX.Element; testID?: string; onPress?: () => void; accessibilityLabel?: string }) {
  const expanded = signal(false);
  const opensDetail = computed(() => !!props.onPress);
  const hasDetail = computed(() => !!props.detail);
  const compact = () => opensDetail() || !expanded();
  const body = () => <>
    <View class="flex-row items-center gap-2">
      <Text class={`min-w-0 flex-1 text-body font-semibold text-foreground ${compact() ? "line-clamp-1" : ""}`}>{props.title}</Text>
      {props.statusIndicator ?? (props.status ? <Text class="text-caption text-muted-foreground">{props.status}</Text> : null)}
      {!opensDetail() && hasDetail() ? <Icon name={expanded() ? "chevronDown" : "chevronRight"} size={16} color={token("faint-foreground")} /> : null}
    </View>
    {hasDetail() ? <Text testID={props.testID ? `${props.testID}-preview` : undefined} class={`text-label leading-relaxed text-muted-foreground ${compact() ? "line-clamp-2" : ""}`}>{props.detail}</Text> : null}
  </>;
  return <If when={opensDetail()} else={
    <View testID={props.testID} class="rounded-card border border-border bg-card">
      <If when={hasDetail()} else={<View class="gap-2.5 p-3.5">{body()}</View>}>
        <Pressable onPress={() => expanded.set(!expanded())} accessibilityLabel={`${expanded() ? "收起" : "展开"}${props.title}`}
          testID={props.testID ? `${props.testID}-toggle` : undefined} class="gap-2.5 rounded-card p-3.5 hover:bg-secondary active:bg-chip">{body()}</Pressable>
      </If>
      {props.children ? <View class="gap-2.5 px-3.5 pb-3.5">{props.children}</View> : null}
    </View>
  }>
    <Pressable onPress={props.onPress} accessibilityLabel={props.accessibilityLabel ?? props.title} testID={props.testID}
      class="gap-2.5 rounded-card border border-border bg-card p-3.5 hover:bg-secondary active:bg-chip">{body()}{props.children}</Pressable>
  </If>;
}
