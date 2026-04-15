const MINUTE_MS = 60 * 1000;

export function isWeekend(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function parseHHMMToDate(hhmm, baseDate = new Date()) {
  const [hours, minutes] = hhmm.split(":").map((v) => Number(v));
  const output = new Date(baseDate);
  output.setHours(hours, minutes, 0, 0);
  return output;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function diffMinutes(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / MINUTE_MS);
}

export function formatClockTime(date) {
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatCountdown(targetDate, now = new Date()) {
  const minutes = diffMinutes(now, targetDate);
  if (minutes <= 0) {
    return "Due";
  }
  if (minutes === 1) {
    return "1 min";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toIso(date) {
  return date.toISOString();
}

export function dayType(date = new Date()) {
  return isWeekend(date) ? "weekend" : "weekday";
}
