// Bot avatars: a shark body shape + dorsal fin in the bot's color, two white capsule eyes, no mouth.
// Shapes and colors come from the 创建新 Bot mockup. Constraints: design/components/avatar.md

export type AvatarShapeId =
  | "jelly"
  | "circle"
  | "torpedo"
  | "squircle"
  | "block"
  | "cloud"
  | "flower"
  | "drop"
  | "bean"
  | "hex"
  | "pill"
  | "pentagon"
  | "wave";

export interface AvatarShape {
  id: AvatarShapeId;
  label: string;
  /** Body path on a 48×48 grid, fin included. */
  d: string;
  /** Body path without the fin: what the rounding stroke goes around. */
  body: string;
  /** Stroke width that rounds the body's sharp corners (hex, pentagon), not the fin's; 0 for none. */
  strokeWidth: number;
  /** Rotation in degrees around the center. */
  rotate: number;
}

const FIN = " M18.5 12 C20 3 24.5 -1.5 29.5 -2 C28 2 27.8 7 29 12 Z";

const shape = (id: AvatarShapeId, label: string, d: string, strokeWidth = 0, rotate = 0, fin = FIN): AvatarShape => ({
  id,
  label,
  d: d + fin,
  body: d,
  strokeWidth,
  rotate,
});

export const avatarShapes: readonly [AvatarShape, ...AvatarShape[]] = [
  // A soft rounded square, wider than tall (41 × 35.5), with a larger fin leaning right.
  shape(
    "jelly",
    "果冻",
    "M18.5 9.5h11C39.5 9.5 44.5 14.5 44.5 24.5v5.5C44.5 40 39.5 45 29.5 45h-11C8.5 45 3.5 40 3.5 30v-5.5C3.5 14.5 8.5 9.5 18.5 9.5z",
    0,
    0,
    " M17 13 C19.5 5.5 24.5 0.5 30.5 -0.5 C32.1 -0.7 32 0.6 31.6 1.6 C30.6 5 30.9 9 33 13 Z",
  ),
  shape("circle", "圆鲨", "M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z"),
  shape("torpedo", "鱼雷", "M5 26 C5 15 17 9 30 11 C39 12.5 45 19 45 26 C45 34 37 40 26 40 C13 40 5 36 5 26Z"),
  shape("squircle", "方鲨", "M15 7h18a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H15a8 8 0 0 1-8-8V15a8 8 0 0 1 8-8z", 0, -8),
  shape("block", "礁石", "M11 10h26a7 7 0 0 1 7 7v15a9 9 0 0 1-9 9H13a9 9 0 0 1-9-9V17a7 7 0 0 1 7-7z"),
  shape(
    "cloud",
    "浪花",
    "M16 15a11 11 0 1 1 0 22a11 11 0 1 1 0-22z M32 15a11 11 0 1 1 0 22a11 11 0 1 1 0-22z M24 5a12 12 0 1 1 0 24a12 12 0 1 1 0-24z M16 26h16v11H16z",
  ),
  shape(
    "flower",
    "珊瑚",
    "M24 3a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M35 14a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M24 25a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M13 14a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M24 13a11 11 0 1 1 0 22a11 11 0 1 1 0-22z",
  ),
  shape("drop", "水滴", "M24 4 C30 12 40 20 40 29 A16 15 0 0 1 8 29 C8 20 18 12 24 4Z"),
  shape("bean", "鲸豆", "M7 22 C7 11 17 6 28 8 C40 10 45 19 42 29 C39 39 29 43 19 41 C10 39 7 31 7 22Z"),
  shape("hex", "六角", "M24 5 L40.5 14.5 V33.5 L24 43 L7.5 33.5 V14.5 Z", 5),
  shape("pill", "胶囊", "M15 11h18a13 13 0 0 1 0 26H15a13 13 0 0 1 0-26z", 0, -6),
  shape("pentagon", "贝壳", "M24 6 L42 19 L35 41 H13 L6 19 Z", 5),
  shape("wave", "深潜", "M6 20 C6 13 12 9 20 10 C27 11 30 14 36 13 C41 12.5 44 16 43 23 C42 34 34 41 24 41 C13 41 6 32 6 20Z"),
];

export const avatarShape = (id: AvatarShapeId): AvatarShape =>
  avatarShapes.find((s) => s.id === id) ?? avatarShapes[0];

export interface BotColor {
  id: string;
  label: string;
  hex: string;
}

/** The bot palette. A bot's color is also the app's accent color while that bot is open. */
export const botColors = [
  { id: "black", label: "黑色", hex: "#141414" },
  { id: "brown", label: "棕色", hex: "#A0673A" },
  { id: "red", label: "红色", hex: "#F0283C" },
  { id: "orange", label: "橙色", hex: "#F26A1B" },
  { id: "amber", label: "琥珀", hex: "#F5A00E" },
  { id: "green", label: "绿色", hex: "#1DB863" },
  { id: "teal", label: "青色", hex: "#14B3A0" },
  { id: "blue", label: "蓝色", hex: "#2183F2" },
  { id: "purple", label: "紫色", hex: "#8B5CF6" },
  { id: "pink", label: "粉色", hex: "#EC3C8E" },
  { id: "gray", label: "灰色", hex: "#9A9A9A" },
] as const satisfies readonly BotColor[];

/**
 * A bot's color as a fill under white text (the user's bubbles, the send button, a chosen letter): a little darker,
 * and dark enough for white text (contrast 4.5), keeping the hue. Lines and dots use the color as it is.
 */
export function botFill(hex: string): string {
  const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16);
  const rgb = [channel(1), channel(3), channel(5)] as const;
  const linear = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (s: number) => 0.2126 * linear(rgb[0] * s) + 0.7152 * linear(rgb[1] * s) + 0.0722 * linear(rgb[2] * s);
  let scale = 0.85;
  while (scale > 0.3 && 1.05 / (luminance(scale) + 0.05) < 4.5) scale -= 0.05;
  return `#${rgb.map((v) => Math.round(v * scale).toString(16).padStart(2, "0")).join("")}`;
}
