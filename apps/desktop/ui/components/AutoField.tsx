import { effect, signal, untracked, View, Text } from "nsh";
import { TextField } from "./TextField";
/** Commits a valid changed value on blur/Enter; no separate settings save step. */
export function AutoField(props: { label: string; value: string; onCommit: (value: string) => void; validate?: (value: string) => boolean; onDraftChange?: () => void; allowEmpty?: boolean; identity?: string; testID?: string; placeholder?: string; /** Keeps the label for screen readers only (rows of a list). */ hideLabel?: boolean }) {
  const draft = signal(props.value);
  let previous = props.value; let identity = props.identity;
  effect(() => {
    const value = props.value; const key = props.identity;
    if (value !== previous || key !== identity) {
      previous = value; identity = key; untracked(() => draft.set(value));
    }
  });
  const commit = () => {
    const next = draft().trim();
    if (next === props.value || (!next && !props.allowEmpty)) return;
    if (props.validate && !props.validate(next)) { draft.set(props.value); return; }
    props.onCommit(next);
  };
  const change = (value: string) => {
    draft.set(value);
    props.onDraftChange?.();
  };
  return <View class="gap-1.5">{props.hideLabel ? null : <Text class="text-label text-muted-foreground">{props.label}</Text>}<TextField value={draft()} placeholder={props.placeholder} onChange={change} onSubmit={commit} onBlur={commit} accessibilityLabel={props.label} testID={props.testID} /></View>;
}
