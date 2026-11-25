import { AnimatedValue, effect, reduceMotion, signal, View, type JSX } from "nsh";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Three columns with captured pointer drags. Constraints: design/layout.md */
export function ResizableColumns(props: {
  leading: JSX.Element;
  children: JSX.Element;
  trailing: JSX.Element;
  trailingVisible: boolean;
}) {
  const width = signal(1280);
  const leadingWidth = signal(280);
  const trailingWidth = signal(320);
  const scale = () => Math.min(1, width() / (180 + 320 + (props.trailingVisible ? 240 : 0)));
  const panelWidth = () => clamp(trailingWidth(), 240 * scale(), width() - 500 * scale());
  const trailing = () => props.trailingVisible ? panelWidth() : 0;
  // Only the panel translates. A global LayoutAnimation also animates every
  // rewrapped message's height/position and fights the chat's bottom anchoring.
  const hidden = new AnimatedValue(props.trailingVisible ? 0 : 1);
  const panelVisible = signal(props.trailingVisible);
  effect(() => {
    const target = props.trailingVisible ? 0 : 1;
    const open = props.trailingVisible;
    if (open) panelVisible.set(true);
    if (reduceMotion()) { hidden.set(target); panelVisible.set(open); }
    else void hidden.timing(target, { duration: 280, easing: "easeInOut" }).then(({ finished }) => {
      if (finished) panelVisible.set(open);
    });
    return () => { void hidden.stop(); };
  });
  const leading = () => clamp(leadingWidth(), 180 * scale(), width() - 320 * scale() - trailing());
  return <View class="min-w-0 flex-1 flex-row overflow-hidden" onLayout={({ bounds }) => width.set(bounds.size.width)}>
    <View class="shrink-0 overflow-hidden" style={{ width: leading() }} testID="sidebar-column">{props.leading}</View>
    <View class="min-w-0 flex-1 overflow-hidden" testID="chat-column">{props.children}</View>
    <View class="shrink-0" style={{ width: trailing() }} testID="info-column" />
    <View class="absolute bottom-0 right-0 top-0 overflow-hidden"
      style={{ width: panelWidth(), visibility: panelVisible() ? "visible" : "hidden", pointerEvents: props.trailingVisible ? "auto" : "none", transform: [{ translateX: hidden.mul(panelWidth()) }] }} testID="info-panel-content">{props.trailing}</View>
    <ColumnDivider
      index={0} position={leading()} value={leading()} min={180 * scale()} max={width() - 320 * scale() - trailing()}
      onChange={(value) => leadingWidth.set(clamp(value, 180 * scale(), width() - 320 * scale() - trailing()))}
    />
    {props.trailingVisible ? <ColumnDivider
      index={1} position={width() - trailing()} value={trailing()} min={240 * scale()} max={width() - 320 * scale() - leading()}
      reverse onChange={(value) => trailingWidth.set(clamp(value, 240 * scale(), width() - 320 * scale() - leading()))}
    /> : null}
  </View>;
}

function ColumnDivider(props: { index: number; position: number; value: number; min: number; max: number; reverse?: boolean; onChange: (value: number) => void }) {
  const dragging = signal(false);
  let startX = 0;
  let startWidth = 0;
  const move = (pageX: number) => props.onChange(startWidth + (pageX - startX) * (props.reverse ? -1 : 1));
  return <View
    class="absolute bottom-0 top-0 z-10 w-[9px] items-center group"
    style={{ left: props.position - 4, cursor: "col-resize" }}
    role="adjustable" accessibilityLabel={props.index === 0 ? "调整左侧栏宽度" : "调整右侧栏宽度"}
    accessibilityValue={{ min: props.min, max: props.max, now: props.value }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
    onAccessibilityAction={({ actionName }) => props.onChange(props.value + (actionName === "increment" ? 16 : -16))}
    onStartShouldSetResponder={() => true}
    onResponderGrant={(event) => { startX = event.pageX; startWidth = props.value; dragging.set(true); return true; }}
    onResponderMove={(event) => move(event.pageX)}
    onResponderRelease={(event) => { move(event.pageX); dragging.set(false); }}
    onResponderTerminate={() => dragging.set(false)}
    onResponderTerminationRequest={() => false}
    testID={`column-divider-${props.index}`}
  >
    <View class={`h-full w-px ${dragging() ? "bg-ring" : "bg-border group-hover:bg-ring"}`} />
  </View>;
}
