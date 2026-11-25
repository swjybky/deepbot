import type * as Native from "../.nsh/types/nsh/index";
import type { Forwarded } from "./nsh-forwarded";

export * from "../.nsh/types/nsh/index";
export declare const View: Forwarded<typeof Native.View, "testID" | "onLayout">;
export declare const Text: Forwarded<typeof Native.Text, "testID">;
export declare const Overlay: Forwarded<typeof Native.Overlay, "onCancel">;
export declare const Image: Forwarded<typeof Native.Image, "src">;
