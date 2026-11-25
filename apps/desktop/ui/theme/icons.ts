// Line icons from the design mockups: SVG path data on a 24×24 grid, drawn as strokes
// by <Icon> (components/Icon.tsx). Add new icons here, never inline path strings in screens.
// Constraints: design/components/icon.md

export const icons = {
  model: "M12 3l9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5",
  terminal: "M4 5h16v14H4z M8 10l2 2-2 2 M12 14h4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6L6 18",
  check: "M5 12l4 4L19 6",
  arrowLeft: "M19 12H5 M12 5l-7 7 7 7",
  stop: "M6 6h12v12H6z",
  apps: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M17 14v6 M14 17h6",
  share: "M12 15V3 M7 8l5-5 5 5 M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  reply: "M9 4l-6 6 6 6 M3 10h11a6 6 0 0 1 0 12",
  more: "M5 12h1 M11.5 12h1 M18 12h1",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",
  waveform: "M4 10v4 M8 7v10 M12 4v16 M16 7v10 M20 10v4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  plug: "M9 2v6 M15 2v6 M6 8h12v4a6 6 0 0 1-12 0z M12 18v4",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  star: "M12 2.5l2.9 6.2 6.6.7-4.9 4.5 1.4 6.6L12 17.2l-6 3.3 1.4-6.6-4.9-4.5 6.6-.7z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  vault: "M4 4h16v16H4z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 9V7 M12 17v-2",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18",
  trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  file: "M14 3H6v18h12V7z M14 3v4h4",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v5H5V6h5",
  download: "M8 17l4 4 4-4 M12 12v9 M20.9 18.4A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.3",
} as const;

export type IconName = keyof typeof icons;
