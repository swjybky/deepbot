import type * as Native from "../.nsh/types/nsh/base";
import type { Forwarded } from "./nsh-forwarded";

export * from "../.nsh/types/nsh/base";
export declare const Button: Forwarded<typeof Native.Button,
  "onPress" | "disabled" | "selected" | "accessibilityLabel" | "role" | "tooltip" | "testID">;
export declare const Dialog: Forwarded<typeof Native.Dialog, "testID">;
export declare const Input: Forwarded<typeof Native.Input,
  "onSubmit" | "onPaste" | "onBlur" | "placeholder" | "autoFocus" | "ref" | "maxLength" | "masked" | "readonly" | "disabled" | "testID">;
export declare const TextView: Forwarded<typeof Native.TextView, "testID">;
export declare const Select: Forwarded<typeof Native.Select, "searchable" | "disabled">;
export declare const Switch: Forwarded<typeof Native.Switch, "disabled" | "testID">;
