import { Text, View, type JSX } from "nsh";

/** Labelled controls in a compact two-column editor. */
export function FormField(props: { label: string; hint?: string; children?: JSX.Element }) {
  return <View class="min-w-0 flex-1 gap-1.5">
    <Text class="text-caption text-muted-foreground">{props.label}</Text>
    {props.children}
    {props.hint ? <Text class="text-caption text-muted-foreground">{props.hint}</Text> : null}
  </View>;
}
export function FormRow(props: { children?: JSX.Element }) {
  return <View class="w-full min-w-0 flex-row items-start gap-3">{props.children}</View>;
}
