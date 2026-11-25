/** Local wall-clock format shared by the activity list and routine editor. */
export function formatRoutineTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = String(date.getFullYear()).padStart(4, "0");
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseRoutineTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hours, minutes, seconds] = match;
  const date = new Date(0);
  date.setFullYear(Number(year), Number(month) - 1, Number(day));
  date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  // Reject calendar rollovers and local times skipped by a daylight saving transition.
  return formatRoutineTime(date.getTime()) === value ? date.getTime() : NaN;
}
