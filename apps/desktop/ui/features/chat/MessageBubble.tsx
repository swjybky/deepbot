import { Clipboard, signal, Text, View } from "nsh";
import { Menu } from "nsh/desktop";
import { IconButton, MarkdownText } from "../../components";
import { accentColor, currentBot } from "../../state/bots";
import { notify } from "../../state/feedback";
import { botFill } from "../../theme/avatar";
import { openMessageLink, replyTarget } from "../../state/runtime";
import type { ChatMessage } from "../../state/types";
import { MessageImage } from "./MessageImage";

async function copyReply(text: string) {
  try {
    await Clipboard.writeText(text);
    notify("success", "已复制回复");
  } catch (error) {
    notify("error", `复制失败：${String(error)}`);
  }
}

export function MessageBubble(props: { message: ChatMessage; onImageSettled?: (messageId: string, index: number) => void }) {
  const hovered = signal(false);
  const mine = () => props.message.role === "user";
  const text = () => props.message.kind === "text" ? props.message.text : props.message.url;
  const images = () => props.message.kind === "text" ? props.message.images ?? [] : [];
  const workTitle = () => !mine() && props.message.kind === "text" ? props.message.workTitle?.replace(/\s+/g, " ").trim() : undefined;
  const reply = () => {
    const message = props.message;
    const workId = message.kind === "text" ? message.workId : undefined;
    replyTarget.set({
      threadId: currentBot().threadId ?? "", messageId: message.id, text: text() || (images().length ? "图片" : ""),
      ...(workId === undefined ? {} : { workId }),
    });
  };
  const showMore = () => {
    const body = text();
    void Menu.popup([{ label: "复制", onSelect: () => void copyReply(body) }]);
  };
  return <View class={`gap-1 ${mine() ? "items-end" : "items-start"}`} testID={`message-${props.message.id}`}>
    <View class={`${mine() ? "max-w-full flex-row-reverse" : "max-w-[85%] flex-row"} items-center gap-2`} onMouseEnter={() => hovered.set(true)} onMouseLeave={() => hovered.set(false)}>
      <View class={`min-w-0 max-w-[640px] shrink gap-2 rounded-[18px] px-[15px] py-2.5 ${mine() ? "" : "bg-muted"}`} style={mine() ? { backgroundColor: botFill(accentColor()) } : undefined} testID={`message-content-${props.message.id}`}>
        {workTitle() ? <Text class="min-w-0 max-w-[320px] line-clamp-1 text-caption font-semibold text-muted-foreground" testID={`message-work-title-${props.message.id}`}>{`事项 · ${workTitle()}`}</Text> : null}
        <If when={images().length}><View class="w-[360px] max-w-full min-w-0 gap-2">
          <Each of={images()} key="index">
            {(image, index) => <MessageImage messageId={props.message.id} image={image()}
              onSettled={() => props.onImageSettled?.(props.message.id, index())} />}
          </Each>
        </View></If>
        {text() || !images().length ? (mine() || props.message.kind !== "text" ? <Text class={`text-message font-medium ${mine() ? "text-primary-foreground" : "text-foreground"}`}>{text()}</Text> : <MarkdownText text={text()} onLinkPress={(url) => { void openMessageLink(props.message.id, url); }} testID={`message-markdown-${props.message.id}`} />) : null}
      </View>
      <View class={`h-8 shrink-0 flex-row gap-2 ${mine() ? "w-8" : "w-[72px]"}`}>
        {hovered() ? <IconButton icon="reply" label="回复" variant="ghost" onPress={reply} testID={`reply-${props.message.id}`} /> : null}
        {hovered() && !mine() ? <IconButton icon="more" label="更多" variant="ghost" onPress={showMore} testID={`message-more-${props.message.id}`} /> : null}
      </View>
    </View>
    {props.message.kind === "text" && props.message.reactions?.length ? <Text class="text-caption text-muted-foreground">{props.message.reactions.join(" ")}</Text> : null}
  </View>;
}
