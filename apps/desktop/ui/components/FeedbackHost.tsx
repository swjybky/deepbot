import { cleanup, Overlay, Text } from "nsh";
import { Toast, ToastStack } from "nsh/base";
import { dismissFeedback, feedbackEntries, pauseFeedback, type Feedback, type FeedbackLevel } from "../state/feedback";
import { IconButton } from "./IconButton";

const labels: Record<FeedbackLevel, string> = { success: "成功", info: "提示", warning: "警告", error: "错误" };
const colors: Record<FeedbackLevel, string> = {
  success: "bg-feedback-success-bg border-feedback-success text-feedback-success",
  info: "bg-feedback-info-bg border-feedback-info text-feedback-info",
  warning: "bg-feedback-warning-bg border-feedback-warning text-feedback-warning",
  error: "bg-feedback-error-bg border-feedback-error text-feedback-error",
};

/** Mount in each native root: the surface, or the currently open Modal. */
export function FeedbackHost() {
  cleanup(() => pauseFeedback(false));
  const newest = () => feedbackEntries().filter(entry => entry.status !== "ending").at(-1);
  return <If when={feedbackEntries().length > 0}><Overlay class="top-16 left-4 right-4 items-center" style={{ pointerEvents: "box-none" }} onCancel={newest() ? () => { const entry = newest(); if (entry) dismissFeedback(entry.id); } : undefined}>
    <ToastStack class="w-full max-w-[480px]" placement="topCenter" onExpandedChange={({ expanded }) => pauseFeedback(expanded)} closeOnEscape={false}>
      <Each of={feedbackEntries()} key={entry => entry.id}>{(entry) => {
        const value = () => entry().value as Feedback;
        return <Toast transitionStatus={entry().status} accessibilityLabel={`${labels[value().level]}：${value().message}`} onDismissRequest={() => dismissFeedback(entry().id)} testID={`feedback-${value().level}`} class={`w-full flex-row items-center gap-3 rounded-card border px-4 py-3 shadow-popover ${colors[value().level]}`}>
          <Text class={`min-w-0 flex-1 text-body text-feedback-${value().level}`} testID="feedback-message">{labels[value().level]}：{value().message}</Text>
          <IconButton icon="close" variant="ghost" label="关闭提示" onPress={() => dismissFeedback(entry().id)} />
        </Toast>;
      }}</Each>
    </ToastStack>
  </Overlay></If>;
}
