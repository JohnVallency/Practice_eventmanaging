export function zonedLocalToIso(localValue: string, timeZone: string): string {
  const [datePart, timePart] = localValue.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(target);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(probe);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const displayed = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
  return new Date(target + target - displayed).toISOString();
}