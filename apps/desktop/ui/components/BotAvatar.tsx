import { Canvas, cleanup, effect, Path2D, reduceMotion, signal, untracked, type Accessor, type MouseEvent, type Point, type ViewRef } from "nsh";
import { avatarShape, type AvatarShapeId } from "../theme/avatar";

const paths = new Map<string, Path2D>();
const pathOf = (d: string) => {
  let path = paths.get(d);
  if (!path) paths.set(d, (path = new Path2D(d)));
  return path;
};

/** `hex` (#RRGGBB) deeper and more saturated, as seen through thick jelly: each channel partly multiplied by itself. */
function deepen(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * (0.62 + 0.38 * (v / 255)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** The area an avatar's eyes follow the mouse in: the row, tile or button behind it. */
export interface AvatarHover {
  /** The mouse in the root view while it is over the area, else null. */
  mouse: Accessor<Point | null>;
  /** Spread on the area's view. */
  handlers: { onMouseMove: (e: MouseEvent) => void; onMouseLeave: () => void };
}

export function avatarHover(): AvatarHover {
  const mouse = signal<Point | null>(null);
  return {
    mouse: () => mouse(),
    handlers: { onMouseMove: (e) => mouse.set(e.pagePosition), onMouseLeave: () => mouse.set(null) },
  };
}

/**
 * Where the eyes look with the mouse at `mouse` (in the avatar's coordinates; null while it is
 * outside the area) for an avatar of `size`: (0, 0) straight ahead, all the way from its edge on.
 */
export function eyeLook(mouse: Point | null, size: number): Point {
  if (!mouse) return { x: 0, y: 0 };
  const dx = mouse.x - size / 2;
  const dy = mouse.y - size / 2;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0 };
  const t = Math.min(1, d / (size / 2));
  return { x: (dx / d) * t, y: (dy / d) * t };
}

/** Where the eyes are and how fast they move, in look units (`eyeLook`) per second. */
export interface Glide { x: number; y: number; vx: number; vy: number }

/**
 * The eyes `dt` ms later, pulled toward `target` by a critically damped spring of `stiffness`
 * (rad/s): from rest they set off gently, speed up, then settle without overshooting; a new
 * target bends the motion instead of jumping.
 */
export function glide(g: Glide, target: Point, dt: number, stiffness: number): Glide {
  let { x, y, vx, vy } = g;
  for (let left = dt; left > 0; left -= 8) {
    const h = Math.min(8, left) / 1000;
    vx += (stiffness ** 2 * (target.x - x) - 2 * stiffness * vx) * h;
    vy += (stiffness ** 2 * (target.y - y) - 2 * stiffness * vy) * h;
    x += vx * h;
    y += vy * h;
  }
  return { x, y, vx, vy };
}

/** Spring stiffness while the eyes follow the mouse (mostly there in about 0.3 s). */
const EYES_FOLLOW = 18;
/** Spring stiffness back to the middle once the mouse leaves (mostly there in about 1 s). */
const EYES_RETURN = 5;

export interface BotAvatarProps {
  shape: AvatarShapeId;
  color: string;
  /** Points: 30 header pill, 42 list row, 40 shape picker, 64 pinned tile, 84 info panel, 120 create dialog. */
  size: number;
  /** The background behind the avatar whose mouse the eyes follow; the avatar itself if left out. */
  hover?: AvatarHover;
}

/** A bot's shark avatar: a 3D jelly body + fin in the bot color, two glowing capsule eyes that follow the mouse over its background. */
export function BotAvatar(props: BotAvatarProps) {
  // Only the avatar whose area has the mouse follows it; the others look straight ahead.
  const own = avatarHover();
  const area = props.hover ?? own;
  // Where the avatar is in the root view, measured as the mouse comes into the area.
  let node: ViewRef | undefined;
  let inside = false;
  const origin = signal<Point | null>(null);
  effect(() => {
    const now = area.mouse() !== null;
    if (now && !inside && node) void node.measure().then((m) => origin.set(m?.pagePosition ?? null));
    inside = now;
  });
  const mouse = () => {
    const page = area.mouse();
    const at = origin();
    return page && at ? { x: page.x - at.x, y: page.y - at.y } : null;
  };
  // Where the eyes are drawn: they glide toward where they should look, never jump, both as the
  // mouse comes in and moves and, slower, back to the middle once it leaves (at once with reduced
  // motion). The spring runs a frame at a time until the eyes are there.
  const look = signal<Point>({ x: 0, y: 0 });
  let eyes: Glide = { x: 0, y: 0, vx: 0, vy: 0 };
  let frame: number | undefined;
  let last: number | undefined;
  const tick = (time: number) => {
    const at = untracked(mouse);
    const target = eyeLook(at, props.size);
    const dt = Math.min(64, last === undefined ? 16 : time - last);
    eyes = glide(eyes, target, dt, at ? EYES_FOLLOW : EYES_RETURN);
    const settled = Math.hypot(target.x - eyes.x, target.y - eyes.y) < 1e-3 && Math.hypot(eyes.vx, eyes.vy) < 1e-2;
    if (settled) {
      eyes = { ...target, vx: 0, vy: 0 };
      frame = last = undefined;
    } else {
      last = time;
      frame = requestAnimationFrame(tick);
    }
    look.set({ x: eyes.x, y: eyes.y });
  };
  effect(() => {
    const target = eyeLook(mouse(), props.size);
    if (reduceMotion()) {
      cancelAnimationFrame(frame);
      frame = last = undefined;
      eyes = { ...target, vx: 0, vy: 0 };
      look.set(target);
      return;
    }
    frame ??= requestAnimationFrame(tick);
  });
  cleanup(() => cancelAnimationFrame(frame));

  return (
    <Canvas
      ref={(n) => (node = n)}
      {...(props.hover ? {} : own.handlers)}
      style={{ width: props.size, height: props.size }}
      draw={(cx, size) => {
        const shape = avatarShape(props.shape);
        const path = pathOf(shape.d);
        // One grid unit in points: shadows are not scaled by the transform.
        const unit = size.width / 48;
        const body = (dx = 0) => {
          cx.save();
          cx.translate(dx, 0);
          if (shape.rotate) {
            cx.translate(24, 24);
            cx.rotate((shape.rotate * Math.PI) / 180);
            cx.translate(-24, -24);
          }
          cx.fill(path);
          if (shape.strokeWidth) {
            cx.lineWidth = shape.strokeWidth;
            cx.lineJoin = "round";
            cx.stroke(pathOf(shape.body));
          }
          cx.restore();
        };
        cx.scale(unit, size.height / 48);

        // Body at full size, nudged down so the fin's tip stays inside: it fills the canvas
        // (fin top 0.5, lowest edge 48 with hex's rounding stroke). The face shares its frame.
        cx.translate(0, 2.5);
        cx.fillStyle = cx.strokeStyle = props.color;
        body();

        // 3D jelly shading, painted only over the body (source-atop), lit from the top left.
        cx.save();
        cx.globalCompositeOperation = "source-atop";
        // Silhouettes are drawn off the canvas and only their blurred shadows land back, so they
        // follow the outline alone, not the seams of the overlapping subpaths.
        const FAR = 120;
        const silhouette = (color: string, blur: number, dx: number, dy: number) => {
          cx.shadowColor = color;
          cx.shadowBlur = blur * unit;
          cx.shadowOffsetX = (FAR + dx) * unit;
          cx.shadowOffsetY = dy * unit;
          cx.fillStyle = cx.strokeStyle = color;
          body(-FAR);
          cx.shadowColor = "transparent";
          cx.shadowBlur = cx.shadowOffsetX = cx.shadowOffsetY = 0;
        };
        // Rim light: the whole body near white, then the body color back over all of it but a
        // thin bright crescent along the top left edge.
        cx.fillStyle = "rgba(255,255,255,0.8)";
        cx.fillRect(-4, -4, 56, 56);
        silhouette(props.color, 2, 1.3, 1.6);
        // A translucent shell: lighter all round, the edges glowing...
        cx.fillStyle = "rgba(255,255,255,0.5)";
        cx.fillRect(-4, -4, 56, 56);
        // ...and a deeper, denser core filling it back from inside, a little toward the right.
        silhouette(deepen(props.color), 8, 0.6, 0.3);
        // Depth: the middle deeper still.
        let light = cx.createRadialGradient(25, 27, 0, 25, 27, 17);
        light.addColorStop(0, "rgba(20,8,50,0.2)");
        light.addColorStop(1, "rgba(20,8,50,0)");
        cx.fillStyle = light;
        cx.fillRect(-4, -4, 56, 56);
        // Key light: a soft sheen at the top left.
        light = cx.createRadialGradient(14, 13, 0, 14, 13, 13);
        light.addColorStop(0, "rgba(255,255,255,0.55)");
        light.addColorStop(0.45, "rgba(255,255,255,0.16)");
        light.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = light;
        cx.fillRect(-4, -4, 56, 56);
        // Bounce light: the bottom edge glows a little through the jelly.
        light = cx.createLinearGradient(0, 36, 0, 46);
        light.addColorStop(0, "rgba(255,255,255,0)");
        light.addColorStop(1, "rgba(255,255,255,0.22)");
        cx.fillStyle = light;
        cx.fillRect(-4, -4, 56, 56);
        cx.restore();

        // Face: two white capsule eyes (5 wide, 9 tall: 1:1.8), glowing a little, white so they read on every bot
        // color. They turn toward the mouse over the avatar like a head in 3D: both shift, the gap narrows, the
        // far eye foreshortens. The reach (4.6 across, 3.6 up and down) keeps them inside the
        // narrowest shapes (drop, flower, pentagon).
        const { x: lookX, y: lookY } = look();
        const gap = 6.2 * (1 - 0.18 * Math.abs(lookX));
        const length = 4 * (1 - 0.2 * Math.abs(lookY));
        const cy = 23.8 + lookY * 3.6;
        const top = cy - length / 2;
        const bottom = cy + length / 2;
        const eye = cx.createLinearGradient(0, top - 2.5, 0, bottom + 2.5);
        eye.addColorStop(0, "#FFFFFF");
        eye.addColorStop(0.5, "#FFFFFF");
        eye.addColorStop(1, "rgba(255,255,255,0.8)");
        cx.strokeStyle = eye;
        cx.lineCap = "round";
        cx.shadowColor = "rgba(255,255,255,0.7)";
        cx.shadowBlur = 2 * unit;
        for (const side of [-1, 1]) {
          const x = 24 + lookX * 4.6 + side * gap;
          cx.lineWidth = 5 * (1 - 0.3 * Math.max(0, side * lookX));
          cx.beginPath();
          cx.moveTo(x, top);
          cx.lineTo(x, bottom);
          cx.stroke();
        }
      }}
    />
  );
}
