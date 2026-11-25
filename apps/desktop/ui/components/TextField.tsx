import { Input } from "nsh/base";
import type { InputRef } from "nsh";

export interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  /** Required when no visible label sits next to the field. */
  accessibilityLabel: string;
  /** center: a single name-like value under an illustration (创建新 Bot). left (default): forms. */
  align?: "left" | "center";
  onSubmit?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  inputRef?: (node: InputRef) => void;
  maxLength?: number;
  masked?: boolean;
  readonly?: boolean;
  testID?: string | undefined;
}

/** A bordered single-line text field. Constraints: design/components/input.md */
export function TextField(props: TextFieldProps) {
  return (
    <Input
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      onSubmit={props.onSubmit}
      onBlur={props.onBlur}
      placeholder={props.placeholder}
      accessibilityLabel={props.accessibilityLabel}
      autoFocus={props.autoFocus}
      ref={props.inputRef}
      maxLength={props.maxLength}
      masked={props.masked}
      readonly={props.readonly}
      testID={props.testID}
      class="h-10 w-full rounded-field border border-input bg-card px-3 text-body text-foreground placeholder:text-faint-foreground focus:border-ring"
      style={{ textAlign: props.align === "center" ? "center" : "left" }}
    />
  );
}
