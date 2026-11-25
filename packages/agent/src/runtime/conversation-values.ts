import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { isArray, shape, oneOf, string } from "../wire-values.ts";

export const ctx = BACKGROUND_CONTEXT;

const textBlock = shape({ type: oneOf("text"), text: string });

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return isArray(content) ? content.filter(textBlock).map(block => block.text).join("") : "";
}
