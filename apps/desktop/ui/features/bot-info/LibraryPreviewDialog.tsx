import { effect, Image, Scroll, signal, Text, View, windowSize } from "nsh";
import { Button, Modal, ModalFooter, ModalHeader, TextField } from "../../components";
import { errorMessage } from "../../../../../packages/agent/src/wire-values";
import { command, openArtifact, openExternal, readArtifactPreview, type Artifact, type Memory } from "../../state/runtime";
import { closeModal, libraryPreview, modal } from "../../state/ui";

type FilePreview = Awaited<ReturnType<typeof readArtifactPreview>>;
type FileState = { kind: "loading" } | { kind: "ready"; file: FilePreview } | { kind: "error"; message: string };

export function LibraryPreviewDialog() {
  const title = () => {
    const entry = libraryPreview();
    return entry?.kind === "artifact" ? entry.item.name : "长期记忆";
  };
  const artifact = () => {
    const entry = libraryPreview();
    return entry?.kind === "artifact" ? entry.item : null;
  };
  const memory = () => {
    const entry = libraryPreview();
    return entry?.kind === "memory" ? entry.item : null;
  };
  return <Modal
    open={modal() === "libraryPreview"}
    onClose={closeModal}
    width={Math.min(760, windowSize().width - 32)}
    height={Math.min(libraryPreview()?.kind === "memory" ? 320 : 560, windowSize().height - 32)}
    testID="library-preview"
  >
    <ModalHeader title={title()} onClose={closeModal} />
    <If when={artifact()}>{(item) => <ArtifactPreview artifact={item()} />}</If>
    <If when={memory()}>{(item) => <MemoryPreview memory={item()} />}</If>
  </Modal>;
}

export function ArtifactPreview(props: { artifact: Artifact }) {
  const fileState = signal<FileState>({ kind: "loading" });
  effect(() => {
    const artifact = props.artifact;
    if (!artifact.path) return;
    let active = true;
    fileState.set({ kind: "loading" });
    void readArtifactPreview(artifact.id).then(
      (file) => { if (active) fileState.set({ kind: "ready", file }); },
      (error: unknown) => {
        if (active) fileState.set({ kind: "error", message: errorMessage(error) });
      },
    );
    return () => { active = false; };
  });
  const file = () => {
    const state = fileState();
    return state.kind === "ready" ? state.file : undefined;
  };
  const fileError = () => {
    const state = fileState();
    return state.kind === "error" ? state.message : undefined;
  };
  const image = () => { const current = file(); return current?.kind === "image" ? current.image : undefined; };
  const text = () => { const current = file(); return current?.kind === "text" ? current.text : undefined; };
  const truncated = () => { const current = file(); return current?.kind === "text" && current.truncated; };
  const needsExternalFile = () => !!props.artifact.path && (!!fileError() || truncated());
  return <>
    <Scroll class="min-h-0 flex-1" contentClass="gap-4 px-6 py-5" testID="library-preview-content">
      {props.artifact.text ? <PreviewText text={props.artifact.text} testID="library-preview-summary" /> : null}
      {props.artifact.path ? <View class="gap-3 rounded-card border border-border bg-background p-4">
        {fileState().kind === "loading" ? <Text class="text-body text-muted-foreground">正在读取文件</Text> : null}
        {fileError() ? <Text class="text-body text-muted-foreground">{fileError()}</Text> : null}
        {image() ? <Image
          src={image()}
          class="h-[360px] w-full object-contain"
          accessibilityLabel={props.artifact.name}
          testID="library-preview-image"
          onError={() => fileState.set({ kind: "error", message: "无法显示此图片" })}
        /> : null}
        {text() != null ? <PreviewText text={text() || "文件为空"} testID="library-preview-text" /> : null}
        {truncated() ? <Text class="text-label text-muted-foreground">已显示文件开头</Text> : null}
      </View> : null}
      {props.artifact.url ? <PreviewText text={props.artifact.url} testID="library-preview-url" /> : null}
      {props.artifact.path ? <Text class="text-caption text-muted-foreground">{props.artifact.path}</Text> : null}
      {props.artifact.hash ? <Text class="text-caption text-muted-foreground">SHA-256 {props.artifact.hash}</Text> : null}
      {!props.artifact.path && !props.artifact.text && !props.artifact.url ? <Text class="text-body text-muted-foreground">暂无内容</Text> : null}
    </Scroll>
    {needsExternalFile() || props.artifact.url ? <ModalFooter>
      {needsExternalFile() ? <Button label="使用系统应用打开" onPress={() => { void openArtifact(props.artifact.id); }} /> : null}
      {props.artifact.url ? <Button label="打开链接" onPress={() => { void openExternal(props.artifact.url!); }} /> : null}
    </ModalFooter> : null}
  </>;
}

function MemoryPreview(props: { memory: Memory }) {
  const editing = signal(false);
  const draft = signal(props.memory.text);
  const save = () => {
    const text = draft().trim();
    if (!text) return;
    if (text !== props.memory.text) command({
      type: "memory.upsert",
      memory: { ...props.memory, text, revision: props.memory.revision + 1 },
    });
    closeModal();
  };
  return <>
    <Scroll class="min-h-0 flex-1" contentClass="gap-4 px-6 py-5">
      {editing() ? <TextField value={draft()} onChange={(value) => draft.set(value)} onSubmit={save} autoFocus accessibilityLabel="编辑记忆" testID={`memory-${props.memory.id}`} />
        : <PreviewText text={props.memory.text} testID="library-preview-memory" />}
    </Scroll>
    <ModalFooter>
      {editing() ? <>
        <Button label="取消" onPress={() => { draft.set(props.memory.text); editing.set(false); }} />
        <Button label="保存" variant="primary" disabled={!draft().trim()} onPress={save} />
      </> : <>
        <Button label="删除" variant="ghost" testID={`memory-delete-${props.memory.id}`} onPress={() => {
          command({ type: "memory.delete", memoryId: props.memory.id });
          closeModal();
        }} />
        <Button label="编辑" onPress={() => editing.set(true)} />
      </>}
    </ModalFooter>
  </>;
}

function PreviewText(props: { text: string; testID: string }) {
  return <View selectable><Text class="text-message text-foreground" testID={props.testID}>{props.text}</Text></View>;
}
