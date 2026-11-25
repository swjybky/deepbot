import { computed, effect, Scroll, signal, Text, untracked, View, type ScrollRef } from "nsh";
import { titleBar } from "nsh/desktop";
import { avatarHover, BotAvatar, Button, EmptyState, FloatingHeader, Pressable, ThinkingIndicator } from "../../components";
import { conversationItems, currentBot } from "../../state/bots";
import { infoPanelOpen, setInfoPanel } from "../../state/ui";
import { connectAgent, connected, conversationActivity, hydrated, runtime } from "../../state/runtime";
import { AttentionCard } from "./AttentionCard";
import { Composer, type PendingImageSends } from "./Composer";
import { MessageBubble } from "./MessageBubble";

const activityLabels = {
  processing: "正在处理",
  thinking: "正在思考",
  tool: "正在使用工具",
  dispatch: "正在安排事项",
  reply: "正在组织回复",
};

/** Middle column: the bot pill (opens the info panel), the conversation and the composer. */
export function ChatPane() {
  const activityLabel = computed(() => {
    const activity = conversationActivity(currentBot().threadId ?? "");
    return activity ? activityLabels[activity] : "";
  });
  const replyPending = computed(() => !!activityLabel());
  const pendingImages: PendingImageSends = signal({});
  const onImageSettled = (messageId: string, index: number) => {
    const botId = currentBot().id;
    const pending = pendingImages();
    const sent = pending[botId];
    if (!sent || sent.settled.includes(index)) return;
    if (!runtime().messages.some(message => message.id === messageId && message.requestId === sent.id)) return;
    pendingImages.set({ ...pending, [botId]: { ...sent, settled: [...sent.settled, index] } });
  };
  // While the info panel is closed, the window's own controls sit over this pane's top right corner.
  let scroll: ScrollRef | undefined;
  let followBottom = true;
  let lastBotId = "";
  let scrollGeometry = "";
  effect(() => { const id = currentBot().id; if (id !== lastBotId) { lastBotId = id; followBottom = true; } });
  const shareInset = () => (infoPanelOpen() ? 16 : titleBar().right + 16);
  return (
    <View class="min-w-0 flex-1 bg-background">
      <Scroll ref={(node) => { scroll = node; }} testID="chat-scroll" onScroll={(e) => {
        const geometry = `${e.size.width}:${e.size.height}:${e.contentSize.height}`;
        if (geometry !== scrollGeometry) {
          scrollGeometry = geometry;
          // Reflow is not a user scroll away from the bottom.
          if (followBottom) scroll?.scrollToEnd({ animated: false });
          return;
        }
        followBottom = e.contentSize.height - e.offset.y - e.size.height < 80;
      }} class="flex-1" contentClass="px-6 pb-4 pt-[76px]">
        <View selectable onLayout={() => { if (followBottom) scroll?.scrollToEnd({ animated: false }); }} class="w-full min-w-0 max-w-[960px] gap-2.5 self-center">
          {!hydrated() ? <EmptyState text="正在连接本机服务" /> : null}
          {hydrated() && currentBot().messages.length === 0 ? <EmptyState text="开始聊天，或把一件事交给 Bot" /> : null}
          <Each of={conversationItems()} key={(item) => item.id}>
            {(item) => {
              // The row key includes its kind. Keep the bubble mounted as snapshots update its props.
              if (untracked(() => !!item().attention)) return <AttentionCard attention={item().attention!} />;
              return <MessageBubble message={item().message!} onImageSettled={onImageSettled} />;
            }}
          </Each>
          {replyPending() ? <ThinkingIndicator color={currentBot().color} label={activityLabel()} /> : null}
        </View>
      </Scroll>

      <Composer pending={pendingImages} />
      <FloatingHeader>
        <BotPill />
        <View class="absolute top-3.5" style={{ right: shareInset() }}>
          {!connected() ? <Button label="重连" size="sm" onPress={connectAgent} testID="agent-reconnect" /> : null}
        </View>
      </FloatingHeader>
    </View>
  );
}

function BotPill() {
  const hover = avatarHover();
  return (
    <View {...hover.handlers}>
      <Pressable
        onPress={() => setInfoPanel(!infoPanelOpen())}
        selected={infoPanelOpen()}
        accessibilityLabel={`查看 ${currentBot().name} 的信息`}
        testID="bot-pill"
        class="h-10 flex-row items-center gap-2 rounded-full border border-edge bg-card pl-2 pr-4 shadow-float hover:bg-secondary active:bg-chip"
      >
        <BotAvatar shape={currentBot().shape} color={currentBot().color} size={30} hover={hover} />
        <Text class="text-body font-medium text-foreground">{currentBot().name}</Text>
      </Pressable>
    </View>
  );
}
