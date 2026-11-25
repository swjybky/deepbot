import { token } from "nsh";
import { Pressable } from "./Pressable";
import type { IconName } from "../theme/icons";
import { Icon } from "./Icon";

export type IconButtonVariant = "outline" | "ghost" | "soft" | "solid";

export interface IconButtonProps {
  icon: IconName;
  /** Required: what screen readers say, and the hover tooltip. */
  label: string;
  onPress?: () => void;
  /**
   * outline (default): 36pt white circle with a border — toolbar actions (搜索, 新建, 分享, 关闭面板).
   * ghost: 32pt, no fill — closing a dialog.
   * soft: 32pt chip fill — secondary actions inside the composer.
   * solid: 36pt dark fill — the composer's main action.
   */
  variant?: IconButtonVariant;
  selected?: boolean;
  /** Greys the icon out and ignores presses; the button keeps its place. */
  disabled?: boolean;
  testID?: string;
}

const box: Record<IconButtonVariant, string> = {
  outline: "size-9 border border-edge bg-card hover:bg-secondary active:bg-chip",
  ghost: "size-8 hover:bg-chip active:bg-nav-active",
  soft: "size-8 bg-chip hover:bg-nav-active active:bg-track",
  solid: "size-9 bg-primary hover:opacity-90 active:opacity-80",
};

/** A round button holding one icon. Constraints: design/components/button.md */
export function IconButton(props: IconButtonProps) {
  const variant = () => props.variant ?? "outline";
  const iconSize = () => (variant() === "ghost" || variant() === "soft" ? 16 : 18);
  const iconColor = () => {
    if (props.icon === "stop") return token("feedback-error");
    switch (variant()) {
      case "solid":
        return token("primary-foreground");
      case "outline":
        return token("foreground");
      default:
        return token("icon-foreground");
    }
  };
  return (
    <Pressable
      onPress={props.onPress}
      selected={props.selected}
      disabled={props.disabled}
      accessibilityLabel={props.label}
      tooltip={props.label}
      testID={props.testID}
      class={`items-center justify-center rounded-full disabled:opacity-40 ${box[variant()]}`}
    >
      <Icon
        name={props.icon}
        size={iconSize()}
        color={iconColor()}
        filled={props.icon === "stop"}
        strokeWidth={variant() === "soft" || variant() === "solid" ? 2 : 1.8}
      />
    </Pressable>
  );
}
