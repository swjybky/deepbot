import { isArray, isRecord, number } from "../wire-values.ts";

export function toolOutput(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return { output: [{ type: "text" as const, text }] };
}

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || number(value)) return true;
  if (isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
