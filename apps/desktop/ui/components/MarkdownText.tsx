import { TextView } from "nsh/base";

/** Single line breaks stay line breaks (chat replies use them as paragraphs); fenced code is left as written. */
export function keepLineBreaks(markdown: string): string {
  let fence = "";
  return markdown.split("\n").map((line, index, lines) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || marker[0] === fence[0] && marker.length >= fence.length)) fence = fence ? "" : marker;
    const next = lines[index + 1];
    return !fence && !marker && line.trim() && next?.trim() ? `${line}  ` : line;
  }).join("\n");
}

/** Markdown in a message bubble: plain text looks like plain text, with the message size, medium weight and color; bold is semibold. */
export function MarkdownText(props: { text: string; onLinkPress?: (url: string) => void; testID?: string }) {
  return (
    <TextView
      markdown={keepLineBreaks(props.text)}
      onLinkPress={(event) => props.onLinkPress?.(event.url)}
      testID={props.testID}
      classes={{
        root: "text-message font-medium text-foreground",
        paragraph: "text-message font-medium text-foreground",
        strong: "font-semibold",
        heading: "text-message font-semibold text-foreground",
        heading1: "text-title",
        heading2: "text-title",
        listMarker: "text-message font-medium text-muted-foreground",
        code: "text-message font-medium text-foreground",
        codeBlock: "rounded-control border border-edge bg-card",
        codeBlockCode: "text-label text-foreground",
        blockquote: "text-message font-medium text-muted-foreground",
        link: "text-message font-medium text-foreground underline",
        tableCell: "text-body font-medium text-foreground",
      }}
    />
  );
}
