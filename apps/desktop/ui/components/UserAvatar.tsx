import { Text, View } from "nsh";

/** The account's initial in a circle: 34pt in the sidebar, 44pt in settings. */
export function UserAvatar(props: { name: string; size?: number }) {
  const size = () => props.size ?? 34;
  return (
    <View
      class={`items-center justify-center rounded-full ${size() > 40 ? "border border-edge bg-chip" : "bg-edge"}`}
      style={{ width: size(), height: size() }}
    >
      <Text class={`font-semibold text-icon-foreground ${size() > 40 ? "text-title" : "text-body"}`}>
        {props.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
