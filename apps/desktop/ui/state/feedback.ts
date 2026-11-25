import { signal } from "nsh";
import { ToastManager, type ToastEntry } from "nsh/base";

export type FeedbackLevel = "success" | "info" | "warning" | "error";
export type Feedback = { level: FeedbackLevel; message: string };
const durationMs: Record<FeedbackLevel, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
};
const manager = new ToastManager();
export const feedbackEntries = signal<ToastEntry[]>([]);
let clock: ReturnType<typeof setInterval> | undefined;
let sequence = 0;
let paused = false;
const refresh = () => feedbackEntries.set(manager.visible(3));

/** Shared result channel. Pushing a replacement starts a new lifetime for its ID. */
export function notify(level: FeedbackLevel, message: string, id = `feedback-${++sequence}`) {
  manager.push(id, { level, message }, { timeout: durationMs[level] });
  refresh();
  if (clock === undefined) clock = setInterval(() => {
    if (manager.advance(paused).changed) refresh();
    if (manager.isEmpty()) { clearInterval(clock); clock = undefined; }
  }, 50);
}
export function dismissFeedback(id: string) { manager.dismiss(id); refresh(); }
export function pauseFeedback(value: boolean) { paused = value; }
