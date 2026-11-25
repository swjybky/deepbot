import { context, Text, token, View, type JSX } from "nsh";
import { Pressable } from "./Pressable";
import type { IconName } from "../theme/icons";
import { Icon } from "./Icon";

type Density = "compact" | "regular";
const DensityContext = context<Density>("regular");

const rowPadding: Record<Density, string> = {
  compact: "px-3.5 py-2.5",
  regular: "px-[18px] py-2.5",
};

/** The caption above a group: 13pt, muted. Constraints: design/components/list.md */
export function SectionLabel(props: { title: string; first?: boolean }) {
  return (
    <Text class={`px-0.5 text-label text-muted-foreground ${props.first ? "" : "pt-2"}`} role="header">
      {props.title}
    </Text>
  );
}

/**
 * A bordered group of rows (settings, panel sections). compact: 14pt row insets, for the 320pt
 * bot info panel; regular: 18pt, for settings. Constraints: design/components/list.md
 */
export function Group(props: { density?: Density; children?: JSX.Element }) {
  return (
    <DensityContext.Provider value={props.density ?? "regular"}>
      <View class={`rounded-card border border-border ${props.density === "compact" ? "py-1" : "py-1.5"}`}>
        {props.children}
      </View>
    </DensityContext.Provider>
  );
}

export interface ListRowProps {
  title: string;
  /** 12pt muted line under the title: a status, an explanation of the setting. */
  description?: string;
  /** An icon on the left. */
  icon?: IconName;
  /** Any element on the left: an icon tile, an avatar. */
  leading?: JSX.Element;
  /** The control on the right: a Switch, a SelectField, a Button, a status dot. */
  trailing?: JSX.Element;
  /** Inset is already supplied by the containing card. */
  flush?: boolean;
  testID?: string;
}

/** One row of a Group: [leading] title / description … trailing. */
export function ListRow(props: ListRowProps) {
  const density = DensityContext();
  return (
    <View testID={props.testID} class={`flex-row items-center gap-3 ${props.flush ? "py-2.5" : rowPadding[density]}`}>
      {props.icon ? <Icon name={props.icon} size={density === "compact" ? 16 : 20} color={token("muted-foreground")} /> : null}
      {props.leading}
      <View class="flex-1 gap-0.5">
        <Text class="line-clamp-1 text-body text-foreground">{props.title}</Text>
        {props.description ? <Text class="text-caption text-muted-foreground">{props.description}</Text> : null}
      </View>
      {props.trailing}
    </View>
  );
}

/**
 * A whole-row button in its own card with a text label.
 * Constraints: design/components/list.md
 */
export function ActionRow(props: { title: string; onPress?: () => void; testID?: string; accessibilityLabel?: string; tooltip?: string }) {
  return (
    <Pressable
      onPress={props.onPress}
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      tooltip={props.tooltip}
      class="rounded-card border border-border bg-card px-3.5 py-[13px] hover:bg-secondary active:bg-chip"
    >
      <Text class="line-clamp-1 text-body text-foreground">{props.title}</Text>
    </Pressable>
  );
}

/** A dashed box saying a list is empty and what will show up in it. */
export function EmptyState(props: { text: string }) {
  return (
    <View class="rounded-card border border-dashed border-input px-3 py-10">
      <Text class="text-center text-label text-muted-foreground">{props.text}</Text>
    </View>
  );
}

/** A square tile for an icon at the start of a row (保险库, 资料库). */
export function IconTile(props: { icon: IconName; size?: number; iconSize?: number }) {
  const size = () => props.size ?? 36;
  return (
    <View class="items-center justify-center rounded-control bg-chip" style={{ width: size(), height: size() }}>
      <Icon name={props.icon} size={props.iconSize ?? size() / 2} color={token("icon-foreground")} />
    </View>
  );
}

/** An 8pt online / offline dot. */
export function StatusDot(props: { online: boolean }) {
  return <View class={`size-2 rounded-full ${props.online ? "bg-online" : "bg-offline"}`} />;
}

/** A bordered block with 18pt padding, for content that is not rows (账户, 套餐, 用量). */
export function Card(props: { row?: boolean; children?: JSX.Element }) {
  return (
    <View class={`rounded-card border border-border p-[18px] ${props.row ? "flex-row items-center gap-3.5" : "gap-2.5"}`}>
      {props.children}
    </View>
  );
}
