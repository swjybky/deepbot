import { View, type JSX } from "nsh";

/** Transparent header above scrollable content; only its controls take pointer input. */
export function FloatingHeader(props: { children?: JSX.Element }) {
  return <View desktop={{ windowDrag: true }} class="absolute top-0 left-0 right-0 h-16 z-10 items-center justify-center" style={{ pointerEvents: "box-none" }}>
    {props.children}
  </View>;
}
