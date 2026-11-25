import { Text, token, View, type JSX } from "nsh";
import type { IconName } from "../theme/icons";
import { Icon } from "./Icon";
import { IconTile, StatusDot } from "./List";
import { Pressable } from "./Pressable";

interface TileInfo {
  label: string;
  value: string;
  testID?: string;
}

export interface TileGridItem {
  id: string;
  wide?: boolean;
}

function tileRows(items: readonly TileGridItem[]) {
  const rows: [TileGridItem, ...TileGridItem[]][] = [];
  let pair: (typeof rows)[number] | undefined;
  for (const item of items) {
    if (item.wide) {
      rows.push([item]);
      pair = undefined;
    } else if (pair) {
      pair.push(item);
      pair = undefined;
    } else {
      pair = [item];
      rows.push(pair);
    }
  }
  return rows;
}

/** Row-major grid. Cards and the final empty cell use the same flex sizing. */
export function TileGrid(props: {
  items: readonly TileGridItem[];
  renderItem: (id: string) => JSX.Element;
  testID?: string;
}) {
  const cell = "min-w-0 flex-1 flex-row";
  return (
    <View class="gap-2.5" testID={props.testID}>
      <Each of={tileRows(props.items)} key={row => row[0].id}>{(row, index) =>
        <View class="flex-row gap-2.5" testID={props.testID ? `${props.testID}-row-${index()}` : undefined}>
          <Each of={row()} key={item => item.id}>{item =>
            <View class={cell}>{props.renderItem(item().id)}</View>
          }</Each>
          {row().length === 1 && !row()[0].wide
            ? <View class={cell} testID={props.testID ? `${props.testID}-placeholder` : undefined} />
            : null}
        </View>
      }</Each>
    </View>
  );
}

const tileSize = "min-h-[148px] min-w-0 flex-1";

export function TileCard(props: {
  icon: IconName;
  title: string;
  subtitle: string;
  status: { online: boolean; label: string };
  description?: string | undefined;
  info?: readonly TileInfo[] | undefined;
  children?: JSX.Element;
  actions?: JSX.Element;
  footerNote?: string | undefined;
  testID?: string;
}) {
  return (
    <View class={`${tileSize} gap-3 rounded-card border border-border bg-card p-4`} testID={props.testID}>
      <View class="flex-row items-center gap-3">
        <IconTile icon={props.icon} iconSize={20} />
        <View class="min-w-0 flex-1">
          <Text class="line-clamp-1 text-body font-semibold text-foreground">{props.title}</Text>
          <Text class="line-clamp-1 text-caption text-muted-foreground">{props.subtitle}</Text>
        </View>
        <View class="shrink-0 flex-row items-center gap-1.5 self-start">
          <StatusDot online={props.status.online} />
          <Text class="text-caption text-muted-foreground">{props.status.label}</Text>
        </View>
      </View>
      {props.description ? <Text class="line-clamp-2 text-label text-muted-foreground">{props.description}</Text> : null}
      {props.info?.length ? <View class="gap-1">
        <Each of={props.info} key={info => info.label}>{info =>
          <View class="flex-row justify-between gap-2" testID={info().testID}>
            <Text class="shrink-0 line-clamp-1 text-caption text-muted-foreground">{info().label}</Text>
            <Text class="min-w-0 shrink line-clamp-1 text-right text-caption text-foreground">{info().value}</Text>
          </View>
        }</Each>
      </View> : null}
      {props.children}
      {props.actions ? <View class="mt-auto flex-row items-center justify-end gap-2">
        {props.footerNote ? <Text class="min-w-0 flex-1 text-caption text-muted-foreground">{props.footerNote}</Text> : null}
        {props.actions}
      </View> : null}
    </View>
  );
}

export function AddTileCard(props: {
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  tooltip?: string | undefined;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      class={`${tileSize} items-center justify-center gap-2 rounded-card border border-dashed border-input p-4 hover:bg-secondary active:bg-chip`}
      onPress={props.onPress}
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      tooltip={props.tooltip}
    >
      <View class="size-9 items-center justify-center rounded-full bg-chip">
        <Icon name="plus" size={20} color={token("icon-foreground")} />
      </View>
      <Text class="text-body text-foreground">{props.title}</Text>
      <Text class="text-caption text-muted-foreground">{props.subtitle}</Text>
    </Pressable>
  );
}
