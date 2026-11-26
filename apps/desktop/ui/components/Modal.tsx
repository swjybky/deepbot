import { computed, Text, token, untracked, View, type JSX } from "nsh";
import { Dialog } from "nsh/base";
import { FeedbackHost } from "./FeedbackHost";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  /** Escape, a backdrop press and every close button call it; the owner sets `open` to false. */
  onClose: () => void;
  /** Points. 440 for a form dialog, 920 for the settings window. */
  width: number;
  /** Points; leave out to fit the content. */
  height?: number;
  /** A row of content (e.g. a sidebar beside a pane) instead of the default column. */
  row?: boolean;
  animation?: "fade" | "none";
  testID?: string;
  children?: JSX.Element;
}

/**
 * The one modal surface of the app: a dimmed backdrop and a white card in the middle of the window.
 * Compose it with ModalHeader / ModalBody / ModalFooter, or lay out its content freely and add
 * a ModalCloseButton. Constraints: design/components/dialog.md
 */
export function Modal(props: ModalProps) {
  // A refresh of the data behind an open modal must keep the same native dialog mounted.
  const open = computed(() => props.open);
  // Keep the form's mounted subtree when the sibling feedback layer changes.
  const content = untracked(() => props.children);
  return (
    <Dialog
      open={open()}
      animation={props.animation ?? "fade"}
      onOpenChange={({ open }) => !open && props.onClose()}
      backdropStyle={{ backgroundColor: token("overlay") }}
      testID={props.testID}
      class={`m-auto overflow-hidden rounded-dialog bg-card shadow-dialog ${props.row ? "flex-row" : ""}`}
      style={{ width: props.width, ...(props.height === undefined ? {} : { height: props.height }) }}
    >
      {content}
      <FeedbackHost />
    </Dialog>
  );
}

/** Title row: 16pt semibold title and a close button, divided from the body. */
export function ModalHeader(props: { title: string; onClose: () => void; actions?: JSX.Element }) {
  return (
    <View class="flex-row items-center justify-between border-b border-divider py-4 pl-5 pr-4">
      <Text role="header" class="min-w-0 flex-1 line-clamp-1 text-title font-semibold text-foreground">
        {props.title}
      </Text>
      <View class="flex-row items-center gap-2">
        {props.actions}
        <IconButton icon="close" variant="ghost" label="关闭" onPress={props.onClose} />
      </View>
    </View>
  );
}

export function ModalBody(props: { children?: JSX.Element }) {
  return <View class="gap-5 px-6 pb-6 pt-[22px]">{props.children}</View>;
}

/** Actions at the end: secondary (取消) first, the primary action last. */
export function ModalFooter(props: { children?: JSX.Element }) {
  return <View class="flex-row justify-end gap-2 border-t border-divider px-4 py-3.5">{props.children}</View>;
}

/** The close button of a modal without a header: top right corner. */
export function ModalCloseButton(props: { onClose: () => void; label?: string }) {
  return (
    <View class="absolute right-3.5 top-3.5">
      <IconButton icon="close" variant="ghost" label={props.label ?? "关闭"} onPress={props.onClose} />
    </View>
  );
}
