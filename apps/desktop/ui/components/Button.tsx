import { Text } from "nsh";
import { Pressable } from "./Pressable";
import { botFill } from "../theme/avatar";

export type ButtonVariant = "secondary" | "primary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** secondary (default): every ordinary action. primary: the one confirming action of a dialog. ghost: low emphasis. */
  variant?: ButtonVariant;
  /** sm: 34pt, inside cards and settings rows. md: 36pt, dialog footers and standalone actions. */
  size?: ButtonSize;
  disabled?: boolean | undefined;
  /** primary only, in the conversation: fill with the open Bot's color (darkened by botFill) instead of primary. */
  color?: string;
  testID?: string | undefined;
  accessibilityLabel?: string;
}

const base = "group flex-row items-center justify-center rounded-full disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  sm: "h-[34px] px-3.5",
  md: "h-9 px-4",
};

const variants: Record<ButtonVariant, string> = {
  secondary: "border border-edge bg-secondary hover:bg-chip active:bg-nav-active",
  primary: "bg-primary hover:opacity-90 active:opacity-80 disabled:bg-nav-active",
  ghost: "hover:bg-chip active:bg-nav-active",
};

const labels: Record<ButtonVariant, string> = {
  secondary: "text-foreground",
  primary: "text-primary-foreground group-disabled:text-faint-foreground",
  ghost: "text-foreground",
};

/** A pill button with a text label. Constraints: design/components/button.md */
export function Button(props: ButtonProps) {
  const size = () => props.size ?? "md";
  const variant = () => props.variant ?? "secondary";
  const filled = () => variant() === "primary" && !!props.color && !props.disabled;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      class={`${base} ${sizes[size()]} ${variants[variant()]}`}
      style={variant() === "primary" ? { paddingHorizontal: 18, ...(filled() ? { backgroundColor: botFill(props.color!) } : {}) } : undefined}
    >
      <Text class={`${size() === "sm" ? "text-label" : "text-body"} ${labels[variant()]}`}>{props.label}</Text>
    </Pressable>
  );
}
