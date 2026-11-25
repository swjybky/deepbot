import { computed, effect, Image, Picker, signal, Text, untracked, View, type Signal } from "nsh";
import { Tooltip } from "nsh/base";
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_LIMIT, CHAT_IMAGE_PIXELS, CHAT_IMAGE_TOTAL_BYTES, type ChatImageUpload } from "../../../../../packages/agent/src/protocol";
import { errorMessage } from "../../../../../packages/agent/src/wire-values";
import { Button, IconButton, MessageInput } from "../../components";
import { accentColor, currentBot } from "../../state/bots";
import { notify } from "../../state/feedback";
import { canSend, command, replyTarget, requestStatus } from "../../state/runtime";

type DraftImage = ChatImageUpload & { key: number; size: number; src: string };
type ImageSend = {
  id: string;
  text: string;
  reply: ReturnType<typeof replyTarget>;
  count: number;
  settled: readonly number[];
};
export type PendingImageSends = Signal<Record<string, ImageSend>>;
const addAttachmentLabel = "添加附件";

async function loadImage(file: File, key: number): Promise<DraftImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("当前附件仅支持 PNG、JPEG、WebP 图片");
  if (file.size > CHAT_IMAGE_BYTES) throw new Error("单张图片不能超过 6 MiB，请缩小后重试");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  const data = btoa(chunks.join(""));
  const src = `data:${file.type};base64,${data}`;
  const size = await Image.getSize(src).catch(() => { throw new Error("无法显示此图片，请重新截图或选择其他图片"); });
  if (size.width * size.height > CHAT_IMAGE_PIXELS) throw new Error("图片像素过多，请裁剪或缩小后重试");
  return { key, name: file.name || "截图", size: file.size, data, src };
}

/** IM input stays usable while any foreground or background task is running. */
export function Composer(props: { pending: PendingImageSends }) {
  const drafts = signal<Record<string, string>>({});
  const imageDrafts = signal<Record<string, readonly DraftImage[]>>({});
  const importing = signal<Record<string, boolean>>({});
  let imageKey = 0;
  const draft = () => drafts()[currentBot().id] ?? "";
  const images = () => imageDrafts()[currentBot().id] ?? [];
  const hasImages = computed(() => images().length > 0);
  const actionRow = () => hasImages() ? 2 : 1;
  const setDraft = (text: string) => drafts.set({ ...drafts(), [currentBot().id]: text });
  const setImages = (id: string, list: readonly DraftImage[]) => imageDrafts.set({ ...imageDrafts(), [id]: list });
  const reply = () => replyTarget()?.threadId === currentBot().threadId ? replyTarget() : null;
  const isBusy = () => !!importing()[currentBot().id] || !!props.pending()[currentBot().id];
  const sendable = () => canSend() && !isBusy() && (!!draft().trim() || hasImages());

  async function addImages(getFiles: () => Promise<readonly File[]>) {
    const id = currentBot().id;
    if (!id || importing()[id] || props.pending()[id]) return;
    importing.set({ ...importing(), [id]: true });
    try {
      const files = await getFiles();
      for (const file of files) {
        const current = imageDrafts()[id] ?? [];
        if (current.length >= CHAT_IMAGE_LIMIT) throw new Error(`每条消息最多添加 ${CHAT_IMAGE_LIMIT} 张图片`);
        if (current.reduce((total, image) => total + image.size, file.size) > CHAT_IMAGE_TOTAL_BYTES)
          throw new Error("一条消息的图片合计不能超过 12 MiB");
        const image = await loadImage(file, ++imageKey);
        setImages(id, [...current, image]);
      }
    } catch (error) {
      notify("error", errorMessage(error, "无法添加附件"), "composer-attachment");
    } finally {
      importing.set({ ...importing(), [id]: false });
    }
  }

  effect(() => {
    for (const [botId, sent] of Object.entries(props.pending())) {
      const status = requestStatus(sent.id);
      if (!status || status.status === "pending") continue;
      // Keep the thumbnails visible until this conversation can show the saved images.
      if (status.status === "succeeded" && currentBot().id === botId && sent.settled.length < sent.count) continue;
      untracked(() => {
        if (status.status === "succeeded") {
          if (drafts()[botId] === sent.text) drafts.set({ ...drafts(), [botId]: "" });
          setImages(botId, []);
          if (sent.reply && replyTarget() === sent.reply) replyTarget.set(null);
        }
        const next = { ...props.pending() };
        delete next[botId];
        props.pending.set(next);
      });
    }
  });

  const send = () => {
    const bot = currentBot();
    if (!bot.threadId || !sendable()) return;
    const target = reply();
    const fields = {
      botId: bot.id, threadId: bot.threadId, text: draft().trim(),
      ...(target?.messageId === undefined ? {} : { replyTo: target.messageId }),
      ...(target?.workId === undefined ? {} : { workId: target.workId }),
    };
    const attachments = images();
    if (attachments.length) {
      const id = command({ type: "message.send-images", ...fields, images: attachments.map(({ name, data }) => ({ name, data })) });
      props.pending.update(pending => ({ ...pending, [bot.id]: { id, text: draft(), reply: target, count: attachments.length, settled: [] } }));
      return;
    }
    command({ type: "message.send", ...fields });
    setDraft(""); replyTarget.set(null);
  };
  return <View class="shrink-0 gap-2 px-6 pb-5 pt-2">
    {reply() ? <View class="w-full max-w-[760px] flex-row items-center gap-2 self-center rounded-card border border-border bg-card px-3 py-2"><Text class="line-clamp-1 flex-1 text-caption text-muted-foreground">{`回复：${reply()!.text}`}</Text><Button label="取消引用" variant="ghost" size="sm" onPress={() => replyTarget.set(null)} /></View> : null}
    <View class={`min-h-12 w-full max-w-[760px] self-center rounded-[24px] border border-input bg-card px-2 shadow-composer ${hasImages() ? "pt-2 pb-1" : "py-[3px]"}`}>
      <If when={hasImages()}><View class="w-full flex-row flex-wrap gap-2" testID="composer-images">
        <Each of={images()} key={(image) => image.key}>{(image) =>
          <View class="relative overflow-hidden rounded-control border border-edge bg-card">
            <Image src={image().src} class="size-14 object-contain" accessibilityLabel={image().name} />
            <View class="absolute right-0 top-0">
              <IconButton icon="close" label={`移除 ${image().name}`} variant="soft" testID="composer-remove-image" disabled={isBusy()} onPress={() => setImages(currentBot().id, images().filter(item => item.key !== image().key))} />
            </View>
          </View>
        }</Each>
      </View></If>
      <View class="grid w-full gap-x-2.5" style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto" }}>
        <View class="h-10 justify-center self-end" style={{ gridColumn: 1, gridRow: actionRow() }} tooltip={
          <Tooltip class="rounded-control border border-edge bg-card px-2 py-1 shadow-popover">
            <Text class="text-caption text-foreground">{addAttachmentLabel}</Text>
          </Tooltip>
        }>
          <IconButton icon="plus" label={addAttachmentLabel} variant="soft" testID="composer-add-attachment" disabled={isBusy() || !currentBot().threadId || images().length >= CHAT_IMAGE_LIMIT} onPress={() => {
            void addImages(async () => (await Picker.pickImages({ multiple: true, limit: CHAT_IMAGE_LIMIT - images().length })).map(({ file }) => file));
          }} />
        </View>
        <View class="min-w-0" style={{ gridColumn: hasImages() ? "1 / 4" : 2, gridRow: 1 }}>
          <MessageInput value={draft()} onChange={setDraft} onSubmit={send} onPaste={(event) => {
            if (event.files.length) void addImages(async () => event.files);
            else if (event.uris.length) notify("info", "请用「添加附件」选择 PNG、JPEG 或 WebP 图片，或粘贴截图");
          }} placeholder={`给 ${currentBot().name} 发消息`} />
        </View>
        <View class="h-10 justify-center self-end" style={{ gridColumn: 3, gridRow: actionRow() }}>
          <Button label="发送" variant="primary" size="sm" color={accentColor()} disabled={!sendable()} onPress={send} testID="composer-send" />
        </View>
      </View>
    </View>
  </View>;
}
