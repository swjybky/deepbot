import { computed, effect, Image, signal, Text, untracked, View } from "nsh";
import type { ChatImage } from "../../../../../packages/agent/src/protocol";
import { Button } from "../../components";
import { connected, readMessageImage } from "../../state/runtime";

export function MessageImage(props: { messageId: string; image: ChatImage; onSettled: () => void }) {
  const source = signal("");
  const failed = signal(false);
  const attempt = signal(0);
  const imageId = computed(() => props.image.id);
  const messageId = computed(() => props.messageId);
  const showRetry = () => {
    failed.set(true);
    props.onSettled();
  };
  effect(() => {
    const ready = connected();
    const message = messageId();
    const image = imageId();
    attempt();
    if (!ready || untracked(source)) return;
    let active = true;
    failed.set(false);
    void readMessageImage(message, image).then(
      (image) => { if (active) source.set(image); },
      () => { if (active) showRetry(); },
    );
    return () => { active = false; };
  });
  return <View class="h-48 w-full items-center justify-center overflow-hidden rounded-control bg-card">
    {failed() ? <Button label="重试加载" variant="ghost" size="sm" disabled={!connected()} onPress={() => {
      source.set("");
      attempt.set(attempt() + 1);
    }} /> : source() ? <Image src={source()} class="h-full w-full object-contain"
      accessibilityLabel={props.image.name} testID={`chat-image-${props.messageId}`} onLoad={() => props.onSettled()} onError={showRetry} />
      : <Text class="text-caption text-muted-foreground">{connected() ? "正在加载图片" : "等待连接后加载图片"}</Text>}
  </View>;
}
