/** JSON values enter the application as unknown, including values from local storage. */
export type Guard<T> = (value: unknown) => value is T;
export const string = (value: unknown): value is string => typeof value === "string";
export const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const boolean = (value: unknown): value is boolean => typeof value === "boolean";
export const jsonField = (_value: unknown): _value is unknown => true;
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !isArray(value);
export const hasKey = <T extends object>(object: T, key: PropertyKey): key is keyof T => Object.hasOwn(object, key);
export const errorMessage = (error: unknown, fallback?: string): string =>
  error instanceof Error ? error.message : fallback ?? String(error);

export function oneOf<const T extends readonly string[]>(...values: T): Guard<T[number]> {
  const allowed: readonly string[] = values;
  return (value): value is T[number] => string(value) && allowed.includes(value);
}

export function arrayOf<T>(check: Guard<T>): Guard<T[]> {
  return (value): value is T[] => isArray(value) && value.every(check);
}

export function nullable<T>(check: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || check(value);
}

export function requireShape<T>(value: unknown, check: Guard<T>, message: string): T {
  if (!check(value)) throw new Error(message);
  return value;
}

export function recordOf<T>(check: Guard<T>): Guard<Record<string, T>> {
  return (value): value is Record<string, T> => isRecord(value) && Object.values(value).every(check);
}

type Fields = Record<string, Guard<unknown>>;
type Values<F extends Fields> = { [K in keyof F]: F[K] extends Guard<infer T> ? T : never };

export function shape<R extends Fields, O extends Fields = {}>(required: R, optional?: O): Guard<Values<R> & Partial<Values<O>>> {
  const fields = Object.entries(required);
  const extras = Object.entries(optional ?? {});
  return (value): value is Values<R> & Partial<Values<O>> =>
    isRecord(value) &&
    fields.every(([key, check]) => Object.hasOwn(value, key) && check(value[key])) &&
    extras.every(([key, check]) => value[key] === undefined || check(value[key]));
}
