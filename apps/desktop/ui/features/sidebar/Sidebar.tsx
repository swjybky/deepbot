import { Clipboard, Scroll, signal, Text, token, View, type Point, type ViewRef, type GestureResponderEvent, type Accessor, type JSX } from "nsh";
import { DragPreview, DragSource } from "../../components/DragSource";
import { AlertDialog } from "nsh/base";
import { Menu } from "nsh/desktop";
import { avatarHover, BotAvatar, Icon, IconButton, Pressable, UserAvatar } from "../../components";
import { currentBotId, deleteBot, hiddenBots, lastLine, otherBots, pinnedBots, setBotHidden, setBotPinned } from "../../state/bots";
import { notify } from "../../state/feedback";
import { isUnread, markRead, markUnread } from "../../state/unread";
import { openBot, openModal, renamingBotId } from "../../state/ui";
import type { Bot } from "../../state/types";

/** Left column: actions, pinned bots, the bot list, hidden bots and the account. Right-click a bot for its menu. */
export function Sidebar() {
  const hiddenOpen = signal(false);
  let root: ViewRef | undefined;
  let pins: ViewRef | undefined;
  let list: ViewRef | undefined;
  type Box = { pagePosition: Point; bounds: { size: { width: number; height: number } } };
  let boxes: (Box | null | undefined)[] = [];
  let preparation: Promise<void> = Promise.resolve();
  const drag = signal<{ bot: Bot; x: number; y: number } | null>(null);
  const target = signal<"pin" | "list" | null>(null);
  const contains = (box: Box | null | undefined, x: number, y: number) => !!box && x >= box.pagePosition.x && x <= box.pagePosition.x + box.bounds.size.width && y >= box.pagePosition.y && y <= box.pagePosition.y + box.bounds.size.height;
  const destination = (event: GestureResponderEvent) => {
    const zone = contains(boxes[1], event.pageX, event.pageY) ? "pin" : contains(boxes[2], event.pageX, event.pageY) ? "list" : null;
    return zone && (zone === "pin") !== !!drag()?.bot.pinned ? zone : null;
  };
  const cancel = () => { drag.set(null); target.set(null); };
  const measure = () => Promise.all([root?.measure(), pins?.measure(), list?.measure()]).then((value) => { boxes = value; });
  const source = (bot: Accessor<Bot>, child: JSX.Element) => <DragSource testID={`drag-${bot().id}`}
    onPrepare={() => { preparation = measure(); }}
    onMove={(event) => {
      if (!drag()) preparation = new Promise<void>((resolve) => requestAnimationFrame(() => { void measure().then(resolve); }));
      drag.set({ bot: bot(), x: event.pageX - (boxes[0]?.pagePosition.x ?? 0), y: event.pageY - (boxes[0]?.pagePosition.y ?? 0) }); target.set(destination(event));
      void preparation.then(() => { if (drag()) target.set(destination(event)); });
    }}
    onDrop={(event) => { void preparation.then(() => { const zone = destination(event); cancel(); if (zone && (zone === "pin") !== !!bot().pinned) setBotPinned(bot().id, zone === "pin"); }); }}
    onCancel={cancel}>{child}</DragSource>;
  return (
    <View ref={(node) => { root = node; }} class="min-w-0 flex-1 bg-sidebar">
      <View desktop={{ windowDrag: true }} class="flex-row justify-end gap-2 px-4 pb-2 pt-4">

        <IconButton icon="plus" label="创建新 Bot" onPress={() => openModal("createBot")} testID="sidebar-create" />
      </View>

      <View ref={(node) => { pins = node; }} testID="sidebar-pinned-zone" class={`overflow-hidden rounded-card ${target() === "pin" && !drag()?.bot.pinned ? "bg-sidebar-accent" : drag() ? "bg-sidebar" : ""}`}>
        <If when={pinnedBots().length > 0 || !!drag()}>
          <View class="min-h-[92px] flex-row flex-wrap justify-center gap-1 px-2.5 pb-3.5 pt-1">
            <Each of={pinnedBots()} key={(b: Bot) => b.id}>
              {(bot) => source(bot, <PinnedBot bot={bot()} dragging={drag()?.bot.id === bot().id} />)}
            </Each>
          </View>
        </If>
      </View>

      <View ref={(node) => { list = node; }} testID="sidebar-list-zone" class={`min-h-[64px] flex-1 rounded-row ${target() === "list" && drag()?.bot.pinned ? "bg-sidebar-accent/60" : ""}`}>
      <Scroll class="flex-1" contentClass="gap-0.5 px-2.5 pb-2">
        <Each of={otherBots()} key={(b: Bot) => b.id}>
          {(bot) => source(bot, <BotRow bot={bot()} dragging={drag()?.bot.id === bot().id} />)}
        </Each>
        <If when={hiddenBots().length > 0}>
          <Pressable
            onPress={() => hiddenOpen.set(!hiddenOpen())}
            selected={hiddenOpen()}
            accessibilityLabel={hiddenOpen() ? "收起已隐藏的 Bot" : "展开已隐藏的 Bot"}
            testID="sidebar-hidden-toggle"
            class="mt-2 flex-row items-center gap-1 rounded-row px-2.5 py-1.5 hover:bg-sidebar-accent/60 active:bg-sidebar-accent"
          >
            <Text class="text-label text-muted-foreground">已隐藏的 Bot</Text>
            <Icon name={hiddenOpen() ? "chevronDown" : "chevronRight"} size={12} color={token("faint-foreground")} />
          </Pressable>
          <If when={hiddenOpen()}>
            <Each of={hiddenBots()} key={(b: Bot) => b.id}>
              {(bot) => <BotRow bot={bot()} />}
            </Each>
          </If>
        </If>
      </Scroll>
      </View>

      <View class="px-2 py-3.5">
        <Pressable
          onPress={() => openModal("settings")}
          accessibilityLabel="打开我的设置"
          testID="sidebar-account"
          class="w-full flex-row items-center gap-2.5 rounded-field px-2 py-1 hover:bg-sidebar-accent/60 active:bg-sidebar-accent"
        >
          <UserAvatar name="deepbot" />
          <Text class="text-body font-semibold text-sidebar-foreground">deepbot</Text>
        </Pressable>
      </View>
      <If when={drag()}>{() => <DragPreview testID="sidebar-drag-preview" x={(drag()?.x ?? 0) - 48} y={(drag()?.y ?? 0) - 32}>
        <BotAvatar shape={drag()!.bot.shape} color={drag()!.bot.color} size={64} />
        <Text class="line-clamp-1 text-label text-sidebar-foreground">{drag()!.bot.name}</Text>
      </DragPreview>}</If>
    </View>
  );
}

/** The native context menu of a sidebar bot: 置顶, 未读, 重命名, 复制对话 ID, 隐藏, 删除. */
function showBotMenu(bot: Bot, at: Point) {
  void Menu.popup([
    { label: bot.pinned ? "取消置顶" : "置顶", onSelect: () => setBotPinned(bot.id, !bot.pinned) },
    isUnread(bot) ? { label: "标为已读", onSelect: () => markRead(bot.id) } : { label: "标为未读", onSelect: () => markUnread(bot.id) },
    { type: "separator" },
    { label: "重命名 Bot", onSelect: () => { renamingBotId.set(bot.id); openModal("renameBot"); } },
    { type: "separator" },
    { label: "复制对话 ID", onSelect: () => void copyThreadId(bot) },
    { type: "separator" },
    { label: bot.hidden ? "在侧边栏显示" : "从侧边栏隐藏", onSelect: () => setBotHidden(bot.id, !bot.hidden) },
    { label: "删除", onSelect: () => void confirmDelete(bot) },
  ], at);
}

async function copyThreadId(bot: Bot) {
  try { await Clipboard.writeText(bot.threadId ?? bot.id); notify("success", "已复制对话 ID"); }
  catch (error) { notify("error", `复制失败：${String(error)}`); }
}

async function confirmDelete(bot: Bot) {
  const result = await AlertDialog.show({
    title: "删除 Bot",
    description: `删除「${bot.name}」及它的对话、事项、例行和记忆，删除后无法恢复`,
    actions: [{ id: "cancel", label: "取消", role: "cancel" }, { id: "delete", label: "删除", role: "destructive" }],
  });
  if (result.action === "delete") deleteBot(bot.id);
}

function PinnedBot(props: { bot: Bot; dragging?: boolean }) {
  const hover = avatarHover();
  return (
    <View onContextMenu={(e) => showBotMenu(props.bot, e.pagePosition)} {...hover.handlers}>
      <Pressable
        onPress={() => openBot(props.bot.id)}
        selected={currentBotId() === props.bot.id}
        accessibilityLabel={`打开 ${props.bot.name}`}
        testID={`bot-${props.bot.id}`}
        class={`h-[92px] w-24 items-center justify-center gap-1.5 rounded-card ${props.dragging ? "" : "hover:bg-sidebar-accent/60 selected:bg-sidebar-accent"}`}
      >
        <View class="size-16">
          <BotAvatar shape={props.bot.shape} color={props.bot.color} size={64} hover={hover} />
          <View class="absolute -bottom-0.5 -right-1 size-[18px] items-center justify-center rounded-full border-2 border-card bg-pin">
            <Icon name="star" size={10} color={token("primary-foreground")} filled />
          </View>
          <If when={isUnread(props.bot)}>
            <View accessibilityLabel="未读" testID={`unread-${props.bot.id}`} class="absolute -right-0.5 top-0 size-3.5 rounded-full border-2 border-card bg-primary" />
          </If>
        </View>
        <Text class="line-clamp-1 text-label font-medium text-sidebar-foreground">{props.bot.name}</Text>
      </Pressable>
    </View>
  );
}

function BotRow(props: { bot: Bot; dragging?: boolean }) {
  const hover = avatarHover();
  return (
    <View onContextMenu={(e) => showBotMenu(props.bot, e.pagePosition)} {...hover.handlers}>
      <Pressable
        onPress={() => openBot(props.bot.id)}
        selected={currentBotId() === props.bot.id}
        testID={`bot-${props.bot.id}`}
        class={`flex-row items-center gap-3 rounded-row px-2.5 py-[9px] ${props.dragging ? "" : "hover:bg-sidebar-accent/60 selected:bg-sidebar-accent"}`}
      >
        <BotAvatar shape={props.bot.shape} color={props.bot.color} size={42} hover={hover} />
        <View class="flex-1 gap-0.5">
          <Text class="text-body font-semibold text-sidebar-foreground">{props.bot.name}</Text>
          <Text class="line-clamp-1 text-meta text-muted-foreground">
            {lastLine(props.bot)}
          </Text>
        </View>
        <If when={isUnread(props.bot)}>
          <View accessibilityLabel="未读" testID={`unread-${props.bot.id}`} class="size-2 rounded-full bg-primary" />
        </If>
      </Pressable>
    </View>
  );
}
