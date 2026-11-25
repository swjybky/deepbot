import { Text, View } from "nsh";
import { PulsingDots } from "./PulsingDots";

/** Mounted only while a reply is pending. */
export function ThinkingIndicator(props: { color: string; label: string }) {
  return <View testID="bot-typing" class="self-start flex-row items-center gap-2 py-2">
    <View class="h-6 justify-center"><PulsingDots color={props.color} testID="thinking-dot" /></View>
    <Text class="text-body text-faint-foreground">{props.label}</Text>
  </View>;
}
