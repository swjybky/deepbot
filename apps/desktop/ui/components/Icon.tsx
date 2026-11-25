import { Canvas, Path2D, token } from "nsh";
import { icons, type IconName } from "../theme/icons";

const paths = new Map<IconName, Path2D>();
const pathOf = (name: IconName) => {
  let path = paths.get(name);
  if (!path) paths.set(name, (path = new Path2D(icons[name])));
  return path;
};

export interface IconProps {
  name: IconName;
  /** Points. 18 in 36pt buttons, 16 in 32pt buttons and rows, 12 for chevrons. */
  size?: number;
  /** Stroke color; `foreground` by default. Pass a token() value, not a literal hex. */
  color?: string;
  /** On the 24pt grid: 1.8 by default, 1.6–2 as the design does. */
  strokeWidth?: number;
  /** Fill instead of stroke (the pinned star). */
  filled?: boolean;
}

/** A line icon of the design (theme/icons.ts), drawn natively. Decorative: label the button around it. */
export function Icon(props: IconProps) {
  return (
    <Canvas
      style={{ width: props.size ?? 18, height: props.size ?? 18 }}
      draw={(cx, size) => {
        const color = props.color ?? token("foreground");
        cx.scale(size.width / 24, size.height / 24);
        if (props.filled) {
          cx.fillStyle = color;
          cx.fill(pathOf(props.name));
          return;
        }
        cx.strokeStyle = color;
        cx.lineWidth = props.strokeWidth ?? 1.8;
        cx.lineCap = "round";
        cx.lineJoin = "round";
        cx.stroke(pathOf(props.name));
      }}
    />
  );
}
