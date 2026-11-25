import { Button as BaseButton } from "nsh/base";

/** Every press target's pointer: a hand, the default arrow while disabled. nsh/base sets no cursor of its own. */
export const pressCursor = "cursor-pointer disabled:cursor-default";

/**
 * nsh/base's Button with the press cursor. Every clickable view in the app is one of these (or a component built on it),
 * never a raw nsh/base Button. Constraints: design/components/button.md
 */
export function Pressable(props: Parameters<typeof BaseButton>[0]) {
  return (
    <BaseButton
      onPress={props.onPress}
      disabled={props.disabled}
      selected={props.selected}
      accessibilityLabel={props.accessibilityLabel}
      role={props.role}
      tooltip={props.tooltip}
      testID={props.testID}
      style={props.style}
      class={`select-none ${pressCursor} ${props.class ?? ""}`}
    >
      {props.children}
    </BaseButton>
  );
}
