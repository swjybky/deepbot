import { AnimatedValue, effect, reduceMotion, signal, View, type GestureResponderEvent, type JSX } from "nsh";

/** Captures only deliberate movement, leaving clicks and context menus to the child. */
export function DragSource(props: {
  children: JSX.Element;
  testID: string;
  onPrepare: () => void;
  onMove: (event: GestureResponderEvent) => void;
  onDrop: (event: GestureResponderEvent) => void;
  onCancel: () => void;
}) {
  const dragging = signal(false);
  const scale = new AnimatedValue(0.94);
  effect(() => {
    if (reduceMotion()) scale.set(1);
    else void scale.timing(1, { duration: 180, easing: "easeOut" });
    return () => { void scale.stop(); };
  });
  return <View testID={props.testID}
    style={{ opacity: dragging() ? 0.3 : 1, transform: [{ scale }], cursor: dragging() ? "grabbing" : "grab" }}
    onTouchStartCapture={() => props.onPrepare()}
    onMoveShouldSetResponderCapture={(_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6}
    onResponderGrant={(event) => { dragging.set(true); props.onMove(event); return true; }}
    onResponderMove={(event) => props.onMove(event)}
    onResponderRelease={(event) => { dragging.set(false); props.onDrop(event); }}
    onResponderTerminate={() => { dragging.set(false); props.onCancel(); }}
    onResponderTerminationRequest={() => false}
  >{props.children}</View>;
}

/** A pointer-transparent floating copy; the source stays in place until drop. */
export function DragPreview(props: { x: number; y: number; testID: string; children: JSX.Element }) {
  const lift = new AnimatedValue(1);
  effect(() => {
    if (!reduceMotion()) void lift.timing(1.06, { duration: 140, easing: "easeOut" });
    return () => { void lift.stop(); };
  });
  return <View testID={props.testID} class="absolute z-10 w-24 items-center rounded-card border border-edge bg-card py-2"
    style={{ left: props.x, top: props.y, pointerEvents: "none", transform: [{ scale: lift }] }}>{props.children}</View>;
}
