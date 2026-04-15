const RECENT_STOPS_KEY = "coastpulse_recent_stops";
const MAX_RECENT = 6;

export function addRecentStop(stopId) {
  if (!stopId) {
    return;
  }
  const existing = getRecentStops().filter((id) => id !== stopId);
  existing.unshift(stopId);
  localStorage.setItem(RECENT_STOPS_KEY, JSON.stringify(existing.slice(0, MAX_RECENT)));
}

export function getRecentStops() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STOPS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
